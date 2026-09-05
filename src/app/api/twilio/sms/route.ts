import type { NextRequest } from "next/server";
import { after } from "next/server";
import { syncReservationToGoogle } from "@/lib/google-calendar";
import { prisma } from "@/lib/prisma";
import { escapeXml, parseTwilioForm, publicRequestUrl, twiml, validateTwilioSignature } from "@/lib/twilio";
import { appUrl, twilioConfigured } from "@/lib/env";
import { createNotification } from "@/lib/notifications";
import { cancellationReplyText, jobCancelChoiceText, jobCancelledText, notifyUndeliveredSms, recordSms } from "@/lib/sms";
import { cancellableJobsFor, cancelJobFromSms, parseCancelChoice } from "@/lib/job-cancel";
import { carrierKeywordKind } from "@/lib/sms-keywords";
import { applyCarrierKeyword, isOptedOut } from "@/lib/sms-opt-out";
import { formatDateTime } from "@/lib/time";
import { formatUsPhone, normalizeUsPhone } from "@/lib/form";

export const dynamic = "force-dynamic";

/**
 * "CANCEL", "cancel please", "Cancel my appointment" → true.
 *
 * CANCEL is a carrier opt-out keyword too, and it stays ours: src/lib/sms-keywords.ts says why it
 * is the one reserved word this route still acts on.
 */
export function isCancelIntent(body: string): boolean {
  return /^\s*cancel\b/i.test(body) || /\bcancel (my|the|our) (reservation|booking|order|table|appointment|visit|job|tow|estimate|call-out|service call|work order|dispatch)\b/i.test(body);
}

const reply = (text: string) => twiml(`<Message>${escapeXml(text)}</Message>`);

/**
 * Inbound SMS to an account's number. A customer replying CANCEL to their confirmation text
 * cancels their next upcoming reservation, order, or job, and the business is notified in-app.
 * When several jobs qualify, the reply lists them numbered and a bare "1"/"2"/"3" picks one.
 */
export async function POST(req: NextRequest) {
  if (!twilioConfigured()) return twiml("");
  const params = await parseTwilioForm(req);
  const skipVerify = process.env.SKIP_WEBHOOK_SIGNATURE_VALIDATION === "true" && process.env.NODE_ENV !== "production";
  if (!skipVerify && !validateTwilioSignature(publicRequestUrl(req, appUrl()), params, req.headers.get("x-twilio-signature"))) {
    return new Response("Invalid signature", { status: 403 });
  }

  const from = normalizeUsPhone(params.From ?? "") ?? params.From ?? "";
  const to = params.To ?? "";
  const body = (params.Body ?? "").trim();
  if (!from || !to || !body) return twiml("");

  const account = await prisma.account.findUnique({ where: { twilioNumber: to } });
  if (!account) return twiml("");

  // Inbound SMS is billed per segment too. Twilio sends NumSegments on the webhook, so record
  // what was actually billed rather than guessing from the body. Best-effort and idempotent
  // on MessageSid, so a webhook retry cannot double-count.
  if (params.MessageSid) {
    await recordSms({
      accountId: account.id,
      messageSid: params.MessageSid,
      direction: "inbound",
      toNumber: to,
      fromNumber: from,
      numSegments: Number(params.NumSegments ?? 1) || 1,
      purpose: "inbound_reply",
    });
  }

  // STOP, START, HELP and the rest of the reserved vocabulary: billed and recorded above, mirrored
  // onto the customer so the app stops texting a number that asked it to, and that is where they
  // end. Twilio has already updated its own subscription list and sent the carrier auto-reply, so
  // there is nothing for the owner to do and nothing for us to say — a reply of our own would
  // either duplicate the carriers or, after a STOP, be a message we are no longer allowed to send.
  const keyword = carrierKeywordKind(body);
  if (keyword) {
    await applyCarrierKeyword(account.id, from, keyword);
    return twiml("");
  }

  /**
   * Someone who has texted STOP can still text us — opt-out only blocks the other direction. So
   * every reply below has to ask whether it can actually be delivered: a TwiML <Message> to an
   * opted-out number is dropped by the carrier with no error, no record and no sign anything went
   * wrong. That is the quietest failure in the system, and it lands on the reply that matters most
   * — the one confirming a booking they just cancelled.
   *
   * Looked up once, here, rather than per reply path.
   */
  const optedOut = await isOptedOut(account.id, from);

  /**
   * Answer the sender if we can, and tell the owner if we cannot.
   *
   * `what` describes the undeliverable message in the owner's terms; it is only ever used when the
   * reply cannot be sent.
   */
  const replyOrNotify = async (text: string, what: string, links?: { reservationId?: string | null; takeoutOrderId?: string | null; jobId?: string | null }): Promise<Response> => {
    if (!optedOut) return reply(text);
    await notifyUndeliveredSms(
      account,
      { ok: false, error: "Recipient has opted out of messages from this number (replied STOP).", reason: "opted_out", skipped: true },
      { name: "", phone: from, what, ...links },
    );
    return twiml("");
  };

  const help = account.twilioNumber ? ` Call ${formatUsPhone(account.twilioNumber)} and we'll help.` : "";

  const wantsCancel = isCancelIntent(body);
  // A bare "1"/"2"/"3" only means anything as an answer to the which-one prompt below, and the
  // prompt is only ever sent to someone with cancellable jobs — so the digit is honored exactly
  // when such jobs exist, and falls through to the plain-message path otherwise (a restaurant
  // guest texting "1" gets the same note-taking behavior as ever).
  const choice = parseCancelChoice(body);

  // Not something we can act on automatically — leave a note for the business and tell the sender how to reach a person.
  const noteAndThank = async () => {
    await createNotification({
      accountId: account.id,
      type: "message",
      title: `Text from ${formatUsPhone(from)}`,
      body: body.slice(0, 300),
    });
    // No second notification here: the message itself is already in the feed above, and the
    // courtesy "we'll get back to you" is not a fact the owner needs chasing.
    if (optedOut) return twiml("");
    return reply(`${account.businessName}: Thanks for your message — we'll get back to you.${help} Reply CANCEL to cancel a booking.`);
  };

  if (!wantsCancel && choice === null) return noteAndThank();

  const graceAgo = new Date(Date.now() - 30 * 60_000);

  const reservation = !wantsCancel
    ? null
    : await prisma.reservation.findFirst({
        where: { accountId: account.id, guestPhone: from, status: { in: ["booked", "confirmed"] }, startTime: { gte: graceAgo } },
        orderBy: { startTime: "asc" },
      });
  if (reservation) {
    await prisma.reservation.update({ where: { id: reservation.id }, data: { status: "cancelled", cancelledAt: new Date(), cancelledBy: "guest" } });
    after(() => syncReservationToGoogle(reservation.id)); // remove the mirrored calendar event
    await createNotification({
      accountId: account.id,
      type: reservation.isWaitlist ? "waitlist" : "reservation",
      title: `${reservation.isWaitlist ? "Left the waitlist" : "Cancelled by guest"}: ${reservation.guestName}, party of ${reservation.partySize}`,
      body: `${formatDateTime(reservation.startTime, account.timeZone)} · replied CANCEL by text from ${formatUsPhone(from)}`,
      reservationId: reservation.id,
    });
    return replyOrNotify(
      cancellationReplyText(account, reservation.isWaitlist ? "waitlist" : "reservation", reservation.startTime),
      "They cancelled by text and we could not confirm it back to them",
      { reservationId: reservation.id },
    );
  }

  const order = !wantsCancel
    ? null
    : await prisma.takeoutOrder.findFirst({
        where: { accountId: account.id, guestPhone: from, status: { in: ["new", "confirmed", "ready"] }, pickupTime: { gte: graceAgo } },
        orderBy: { pickupTime: "asc" },
      });
  if (order) {
    await prisma.takeoutOrder.update({ where: { id: order.id }, data: { status: "cancelled", cancelledAt: new Date(), cancelledBy: "guest" } });
    await createNotification({
      accountId: account.id,
      type: "takeout",
      title: `Order cancelled by guest: ${order.guestName}`,
      body: `${order.isDelivery ? "Delivery" : "Pickup"} ${formatDateTime(order.pickupTime, account.timeZone)} · ${order.items.replace(/\s*\n+\s*/g, ", ").slice(0, 120)} · replied CANCEL by text`,
      takeoutOrderId: order.id,
    });
    return replyOrNotify(cancellationReplyText(account, "order", order.pickupTime), "They cancelled by text and we could not confirm it back to them", { takeoutOrderId: order.id });
  }

  // Jobs — every profession that isn't a restaurant. One match cancels; several ask which, and the
  // numbered reply lands back here where the same ordered query resolves it.
  const jobs = await cancellableJobsFor(account.id, from, graceAgo);
  if (jobs.length > 0) {
    const chosen = choice !== null ? jobs[choice - 1] : jobs.length === 1 ? jobs[0] : undefined;
    if (chosen) {
      await cancelJobFromSms(account, chosen, from);
      return replyOrNotify(jobCancelledText(account, chosen), "They cancelled by text and we could not confirm it back to them", { jobId: chosen.id });
    }
    return replyOrNotify(jobCancelChoiceText(account, jobs), "They texted CANCEL but have more than one booking, and we could not ask them which");
  }

  // A bare digit that answered nothing is just a message; a real CANCEL with nothing to cancel is told so.
  if (!wantsCancel) return noteAndThank();
  return replyOrNotify(`${account.businessName}: We couldn't find an upcoming booking for this number.${help}`, "They texted CANCEL, had nothing upcoming to cancel, and we could not tell them so");
}
