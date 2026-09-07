import { NextResponse } from "next/server";
import type { Vertical } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createWebCall } from "@/lib/retell";
import { syncRetellAgent } from "@/lib/agent-sync";
import { UNKNOWN_CALLER } from "@/lib/caller-context";
import { retellConfigured } from "@/lib/env";
import { formatDateString, formatTime, todayString } from "@/lib/time";
import { demoCapped, DEMO_CALL_LIMIT, DEMO_CALL_MAX_MS } from "@/lib/billing-state";
import { onboardingStepHref } from "@/lib/onboarding-flow";
import { hasFinishedOnboarding } from "@/verticals";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Where "subscribe" lives for this account: the payment step mid-setup, Billing afterwards. */
function paymentHrefFor(account: { vertical: Vertical; onboardingStepId: string }): string {
  return hasFinishedOnboarding(account) ? "/settings?tab=billing" : onboardingStepHref(account, "payment");
}

/**
 * Starts an in-browser test call with the account's agent. Returns the Retell access token the
 * client SDK needs plus our Call row id so the UI can link to the transcript afterwards.
 *
 * An account that has not paid gets DEMO_CALL_LIMIT of these, DEMO_CALL_MAX_MS each
 * (docs/frontdesk-billing-spec.md §5). The count is checked here, before the agent is even built,
 * so a capped account causes no Retell activity at all; the per-call length is the agent's own
 * max_call_duration_ms, set by buildAgentConfig, so it holds whatever the browser does.
 */
export async function POST() {
  const session = await auth();
  const accountId = session?.user?.accountId;
  if (!accountId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!retellConfigured()) return NextResponse.json({ error: "Retell is not configured (RETELL_API_KEY)." }, { status: 503 });

  let account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  // Browser test calls are the Call rows with no Twilio leg. Phone test calls ("Call me to test")
  // need a number, which an unpaid account cannot have, so the count is exactly the demos.
  const capped = demoCapped(account);
  const used = capped ? await prisma.call.count({ where: { accountId: account.id, isTest: true, twilioCallSid: null } }) : 0;
  if (capped && used >= DEMO_CALL_LIMIT) {
    return NextResponse.json(
      {
        error: `You've used your ${DEMO_CALL_LIMIT} free test calls. Subscribe and test calls become unlimited - your phone number unlocks at the same time.`,
        paymentHref: paymentHrefFor(account),
        demo: { used, limit: DEMO_CALL_LIMIT, maxMinutes: DEMO_CALL_MAX_MS / 60_000 },
      },
      { status: 403 },
    );
  }

  // Make sure the agent exists and reflects the latest saved settings.
  const sync = await syncRetellAgent(account.id);
  if (!sync.ok) return NextResponse.json({ error: `AI host isn't ready: ${sync.error}` }, { status: 502 });
  account = (await prisma.account.findUnique({ where: { id: accountId } }))!;

  try {
    const now = new Date();
    const rc = await createWebCall({
      agent_id: account.retellAgentId!,
      metadata: { accountId: account.id, test: true, web: true },
      retell_llm_dynamic_variables: {
        ...UNKNOWN_CALLER,
        restaurant_name: account.businessName,
        host_name: account.hostName,
        timezone: account.timeZone,
        current_date: formatDateString(todayString(account.timeZone), { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
        current_time: formatTime(now, account.timeZone),
        caller_phone: account.cellPhone ? account.cellPhone : "an unknown number",
      },
    });

    const call = await prisma.call.create({
      data: {
        accountId: account.id,
        retellCallId: rc.call_id,
        callerPhone: account.cellPhone ?? null,
        callerName: `${account.ownerName ?? "Owner"} (browser test)`,
        direction: "inbound",
        callStatus: "registered",
        isTest: true,
        startedAt: now,
      },
    });

    return NextResponse.json({
      accessToken: rc.access_token,
      callId: call.id,
      retellCallId: rc.call_id,
      hostName: account.hostName,
      voiceId: sync.voiceId,
      // This call counts; tell the owner where they stand before they hear the greeting.
      demo: capped ? { used: used + 1, limit: DEMO_CALL_LIMIT, maxMinutes: DEMO_CALL_MAX_MS / 60_000, paymentHref: paymentHrefFor(account) } : null,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not start the call" }, { status: 502 });
  }
}
