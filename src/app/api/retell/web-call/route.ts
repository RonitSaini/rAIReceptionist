import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createWebCall } from "@/lib/retell";
import { syncRetellAgent } from "@/lib/agent-sync";
import { retellConfigured } from "@/lib/env";
import { formatDateString, formatTime, todayString } from "@/lib/time";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Starts an in-browser test call with the account's agent. Returns the Retell access token the
 * client SDK needs plus our Call row id so the UI can link to the transcript afterwards.
 */
export async function POST() {
  const session = await auth();
  const accountId = session?.user?.accountId;
  if (!accountId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!retellConfigured()) return NextResponse.json({ error: "Retell is not configured (RETELL_API_KEY)." }, { status: 503 });

  let account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

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
        restaurant_name: account.restaurantName,
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

    return NextResponse.json({ accessToken: rc.access_token, callId: call.id, retellCallId: rc.call_id, hostName: account.hostName, voiceId: sync.voiceId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not start the call" }, { status: 502 });
  }
}
