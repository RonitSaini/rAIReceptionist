import type { NextRequest } from "next/server";
import { after } from "next/server";
import { syncReservationToGoogle } from "@/lib/google-calendar";
import { prisma } from "@/lib/prisma";
import { escapeXml, parseTwilioForm, publicRequestUrl, twiml, validateTwilioSignature } from "@/lib/twilio";
import { appUrl, twilioConfigured } from "@/lib/env";
import { createNotification } from "@/lib/notifications";
import { cancellationReplyText } from "@/lib/sms";
import { formatDateTime } from "@/lib/time";
import { formatUsPhone, normalizeUsPhone } from "@/lib/form";

export const dynamic = "force-dynamic";

/** "CANCEL", "cancel please", "Cancel my reservation" → true. STOP/HELP are handled by Twilio itself. */
export function isCancelIntent(body: string): boolean {
  return /^\s*cancel\b/i.test(body) || /\bcancel (my|the|our) (reservation|booking|order|table)\b/i.test(body);
}

const reply = (text: string) => twiml(`<Message>${escapeXml(text)}</Message>`);

/**
 * Inbound SMS to a restaurant's number. A guest replying CANCEL to their confirmation text
 * cancels their next upcoming reservation (or order) and the restaurant is notified in-app.
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

  const help = account.twilioNumber ? ` Call ${formatUsPhone(account.twilioNumber)} and we'll help.` : "";

  if (!isCancelIntent(body)) {
    // Not something we can act on automatically — leave a note for the restaurant and tell the guest how to reach a person.
    await createNotification({
      accountId: account.id,
      type: "message",
      title: `Text from ${formatUsPhone(from)}`,
      body: body.slice(0, 300),
    });
    return reply(`${account.restaurantName}: Thanks for your message — we'll get back to you.${help} Reply CANCEL to cancel a booking.`);
  }

  const graceAgo = new Date(Date.now() - 30 * 60_000);

  const reservation = await prisma.reservation.findFirst({
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

  const order = await prisma.takeoutOrder.findFirst({
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

  return reply(`${account.restaurantName}: We couldn't find an upcoming booking for this number.${help}`);
}
