import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseTwilioForm, publicRequestUrl, validateTwilioSignature } from "@/lib/twilio";
import { appUrl, twilioConfigured } from "@/lib/env";
import { reportUndeliveredSms } from "@/lib/sms";
import { markOptedOutFromDeliveryFailure } from "@/lib/sms-opt-out";

export const dynamic = "force-dynamic";

/** Twilio's terminal verdicts. Anything else (queued, sending, sent) is still in flight. */
const DELIVERED = "delivered";
const FAILED = new Set(["failed", "undelivered"]);

/** Twilio's code for "attempt to send to unsubscribed recipient". */
const OPTED_OUT_CODE = "21610";

/**
 * What the carrier did with a message Twilio already accepted.
 *
 * Without this the only visible SMS failure was a synchronous rejection — the kind Twilio refuses
 * outright. Everything Twilio accepted and the carrier later dropped stayed "queued" on its row
 * forever and read exactly like a message that arrived: the same invisible failure as an opt-out,
 * with a slower fuse.
 *
 * Idempotent. Twilio retries these, and a status only ever moves forward, so a repeat delivers no
 * second notification.
 */
export async function POST(req: NextRequest) {
  if (!twilioConfigured()) return new Response(null, { status: 204 });
  const params = await parseTwilioForm(req);
  const skipVerify = process.env.SKIP_WEBHOOK_SIGNATURE_VALIDATION === "true" && process.env.NODE_ENV !== "production";
  if (!skipVerify && !validateTwilioSignature(publicRequestUrl(req, appUrl()), params, req.headers.get("x-twilio-signature"))) {
    return new Response("Invalid signature", { status: 403 });
  }

  const sid = params.MessageSid ?? params.SmsSid;
  const status = params.MessageStatus ?? params.SmsStatus;
  if (!sid || !status) return new Response(null, { status: 204 });

  const row = await prisma.smsMessage.findUnique({ where: { messageSid: sid } });
  // A receipt for a message this app never recorded: nothing to update, and nothing worth guessing
  // an account from. Twilio stops retrying on a 2xx, which is right — there is no work here.
  if (!row) return new Response(null, { status: 204 });

  const failed = FAILED.has(status);
  // Already terminal and already reported. A retry must not notify twice.
  if (row.status === "failed" || row.status === DELIVERED) return new Response(null, { status: 204 });

  const code = params.ErrorCode ?? "";
  // The raw provider text stays here on the diagnostic row; the code goes with it because that is
  // what tells opt-out apart from carrier filtering. friendlyProviderError() reads both.
  const error = failed ? [code, params.ErrorMessage || "The carrier did not deliver the message."].filter(Boolean).join(" ").slice(0, 300) : null;

  await prisma.smsMessage.update({
    where: { messageSid: sid },
    data: { status: failed ? "failed" : status, ...(error ? { error } : {}) },
  });

  if (!failed) return new Response(null, { status: 204 });

  // A STOP typed to the carrier, or sent while this webhook was down, never reached the inbound
  // route — the first the app hears of it is this receipt. Recording it here is what stops the
  // next message being attempted too.
  if (code === OPTED_OUT_CODE) await markOptedOutFromDeliveryFailure(row.accountId, row.toNumber);

  // The same words the stale sweep uses, so "the carrier said no" and "the carrier said nothing"
  // read alike to the owner.
  await reportUndeliveredSms(row, error ?? "", code === OPTED_OUT_CODE ? "opted_out" : "provider");

  return new Response(null, { status: 204 });
}
