import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { callerContextFor } from "@/lib/caller-context";
import { parseTwilioForm, publicRequestUrl, twimlDialSip, twimlSay, validateTwilioSignature } from "@/lib/twilio";
import { registerPhoneCall, sipUriForCall, RetellError } from "@/lib/retell";
import { appUrl, retellConfigured, twilioConfigured } from "@/lib/env";
import { canTakeCalls } from "@/lib/billing";
import { formatDateString, formatTime, todayString } from "@/lib/time";
import { formatUsPhone } from "@/lib/form";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Twilio voice webhook. Every call to a restaurant's number lands here.
 * We register the call with Retell (so it knows which agent to use) and hand the audio over via SIP.
 * Concurrent calls are independent — each gets its own Retell call_id.
 */
export async function POST(req: NextRequest) {
  if (!twilioConfigured() || !retellConfigured()) return twimlSay("Sorry, this phone line isn't set up yet. Please try again later.");

  const params = await parseTwilioForm(req);
  const skipVerify = process.env.SKIP_WEBHOOK_SIGNATURE_VALIDATION === "true" && process.env.NODE_ENV !== "production";
  if (!skipVerify && !validateTwilioSignature(publicRequestUrl(req, appUrl()), params, req.headers.get("x-twilio-signature"))) {
    return new Response("Invalid signature", { status: 403 });
  }

  const callSid = params.CallSid;
  const from = params.From ?? "";
  const to = params.To ?? "";
  const isTest = req.nextUrl.searchParams.get("test") === "1";
  const testAccountId = req.nextUrl.searchParams.get("accountId");

  // Inbound: the restaurant's number is `To`. Test calls we place ourselves: the restaurant's number is `From`.
  const account = isTest && testAccountId
    ? await prisma.account.findUnique({ where: { id: testAccountId } })
    : await prisma.account.findUnique({ where: { twilioNumber: to } });

  if (!account || !account.retellAgentId) {
    return twimlSay("Sorry, this restaurant's phone assistant isn't ready yet. Please call back later.");
  }
  // Phase 4: with BILLING_REQUIRED=true a lapsed subscription stops answering (the owner sees a banner in the app).
  if (!canTakeCalls(account)) {
    return twimlSay("Sorry, this restaurant's phone assistant is currently unavailable. Please call back later.");
  }

  // Twilio may retry the webhook — reuse the registration if we already have one for this CallSid.
  if (callSid) {
    const existing = await prisma.call.findUnique({ where: { twilioCallSid: callSid } });
    if (existing?.retellCallId) return twimlDialSip(sipUriForCall(existing.retellCallId));
  }

  const callerPhone = isTest ? to : from;
  const now = new Date();
  // Who is ringing, if we have met them before. Neutral values for every other archetype.
  const known = await callerContextFor(account, callerPhone);
  try {
    const rc = await registerPhoneCall({
      agent_id: account.retellAgentId,
      // For test calls we swap numbers so Retell treats it as an inbound call to the restaurant and greets first.
      from_number: isTest ? to : from,
      to_number: isTest ? from : to,
      direction: "inbound",
      metadata: { accountId: account.id, twilioCallSid: callSid, test: isTest },
      retell_llm_dynamic_variables: {
        restaurant_name: account.businessName,
        host_name: account.hostName,
        timezone: account.timeZone,
        current_date: formatDateString(todayString(account.timeZone), { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
        current_time: formatTime(now, account.timeZone),
        caller_phone: callerPhone ? formatUsPhone(callerPhone) : "an unknown number",
        ...known,
      },
    });

    await prisma.call
      .create({
        data: {
          accountId: account.id,
          twilioCallSid: callSid || null,
          retellCallId: rc.call_id,
          callerPhone: callerPhone || null,
          direction: "inbound",
          callStatus: "registered",
          isTest,
          startedAt: now,
        },
      })
      .catch((e) => console.error("[twilio-voice] could not create Call row", e));

    return twimlDialSip(sipUriForCall(rc.call_id));
  } catch (e) {
    console.error("[twilio-voice] register failed", e instanceof RetellError ? `${e.status} ${e.message}` : e);
    return twimlSay(`Thanks for calling ${account.businessName}. We're having trouble connecting right now. Please call back in a few minutes.`);
  }
}
