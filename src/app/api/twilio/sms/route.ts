import type { NextRequest } from "next/server";
import { after } from "next/server";
import { syncReservationToGoogle } from "@/lib/google-calendar";
import { prisma } from "@/lib/prisma";
import { escapeXml, parseTwilioForm, publicRequestUrl, twiml, validateTwilioSignature } from "@/lib/twilio";
import { appUrl, twilioConfigured } from "@/lib/env";
import { createNotification } from "@/lib/notifications";
import { cancellationReplyText, jobCancelChoiceText, jobCancelledText, recordSms } from "@/lib/sms";
import { cancellableJobsFor, cancelJobFromSms, parseCancelChoice } from "@/lib/job-cancel";
import { formatDateTime } from "@/lib/time";
import { formatUsPhone, normalizeUsPhone } from "@/lib/form";

export const dynamic = "force-dynamic";

/** "CANCEL", "cancel please", "Cancel my appointment" → true. STOP/HELP are handled by Twilio itself. */
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
    return reply(cancellationReplyText(account, reservation.isWaitlist ? "waitlist" : "reservation", reservation.startTime));
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
    return reply(cancellationReplyText(account, "order", order.pickupTime));
  }

  // Jobs — every profession that isn't a restaurant. One match cancels; several ask which, and the
  // numbered reply lands back here where the same ordered query resolves it.
  const jobs = await cancellableJobsFor(account.id, from, graceAgo);
  if (jobs.length > 0) {
    const chosen = choice !== null ? jobs[choice - 1] : jobs.length === 1 ? jobs[0] : undefined;
    if (chosen) {
      await cancelJobFromSms(account, chosen, from);
      return reply(jobCancelledText(account, chosen));
    }
    return reply(jobCancelChoiceText(account, jobs));
  }

  // A bare digit that answered nothing is just a message; a real CANCEL with nothing to cancel is told so.
  if (!wantsCancel) return noteAndThank();
  return reply(`${account.businessName}: We couldn't find an upcoming booking for this number.${help}`);
}
