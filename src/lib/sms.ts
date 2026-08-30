import type { Account } from "@prisma/client";
import { prisma } from "./prisma";
import { sendSms } from "./twilio";
import { twilioConfigured } from "./env";
import { formatDateTime } from "./time";
import { formatUsPhone } from "./form";

/**
 * Guest-facing SMS (the restaurant itself is never texted — it gets in-app notifications).
 * Every send is best-effort: a Twilio failure (trial limits, unregistered 10DLC, bad number) is
 * logged and reported back, never thrown into the call flow.
 */

export type SmsResult = { ok: true; sid: string } | { ok: false; error: string; skipped?: boolean };

function sender(account: Pick<Account, "twilioNumber">): string | undefined {
  return process.env.TWILIO_MESSAGING_SERVICE_SID ? undefined : (account.twilioNumber ?? undefined);
}

export async function sendGuestSms(account: Pick<Account, "id" | "twilioNumber" | "restaurantName">, to: string | null | undefined, body: string): Promise<SmsResult> {
  if (!to) return { ok: false, error: "no phone number", skipped: true };
  if (!twilioConfigured()) return { ok: false, error: "Twilio not configured", skipped: true };
  const from = sender(account);
  if (!from && !process.env.TWILIO_MESSAGING_SERVICE_SID) return { ok: false, error: "no sending number yet", skipped: true };
  try {
    const { sid } = await sendSms({ to, body, from });
    return { ok: true, sid };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.warn(`[sms] to ${to} failed: ${error}`);
    return { ok: false, error };
  }
}

const trim = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function reservationConfirmationText(account: Pick<Account, "restaurantName" | "timeZone" | "twilioNumber">, r: { guestName: string; partySize: number; startTime: Date; isWaitlist: boolean }): string {
  const when = formatDateTime(r.startTime, account.timeZone);
  const phone = account.twilioNumber ? ` Questions? Call ${formatUsPhone(account.twilioNumber)}.` : "";
  if (r.isWaitlist) return `${account.restaurantName}: ${r.guestName}, you're on our waitlist for ${r.partySize} on ${when}. We'll call if a table opens up. Reply CANCEL to leave the waitlist.${phone}`;
  return `${account.restaurantName}: You're booked! Party of ${r.partySize} on ${when}. Reply CANCEL if your plans change.${phone}`;
}

export function takeoutConfirmationText(account: Pick<Account, "restaurantName" | "timeZone" | "twilioNumber">, o: { guestName: string; items: string; pickupTime: Date; isDelivery: boolean }): string {
  const when = formatDateTime(o.pickupTime, account.timeZone);
  const items = trim(o.items.replace(/\s*\n+\s*/g, ", "), 90);
  const phone = account.twilioNumber ? ` Questions? Call ${formatUsPhone(account.twilioNumber)}.` : "";
  return `${account.restaurantName}: Order received — ${items}. ${o.isDelivery ? "Delivery" : "Pickup"} ${when}. Reply CANCEL to cancel.${phone}`;
}

export function escalationFollowUpText(account: Pick<Account, "restaurantName" | "twilioNumber">, nextOpen: string | null): string {
  const when = nextOpen ? ` when we next open (${nextOpen})` : " as soon as we open";
  const phone = account.twilioNumber ? ` You can also call us at ${formatUsPhone(account.twilioNumber)}.` : "";
  return `${account.restaurantName}: Thanks for calling. Our manager couldn't get back to you right away — they'll call you${when}.${phone}`;
}

export function cancellationReplyText(account: Pick<Account, "restaurantName" | "timeZone">, kind: "reservation" | "waitlist" | "order", when: Date): string {
  const w = formatDateTime(when, account.timeZone);
  if (kind === "waitlist") return `${account.restaurantName}: You've been removed from the waitlist for ${w}. Hope to see you another time!`;
  if (kind === "order") return `${account.restaurantName}: Your order for ${w} is cancelled. Hope to see you another time!`;
  return `${account.restaurantName}: Your reservation for ${w} is cancelled. Hope to see you another time!`;
}

/** Record that a guest confirmation went out (or why it didn't) on the booking. */
export async function markConfirmationSent(kind: "reservation" | "order", id: string, result: SmsResult): Promise<void> {
  if (!result.ok) return;
  if (kind === "reservation") await prisma.reservation.update({ where: { id }, data: { smsConfirmedAt: new Date() } }).catch(() => {});
  else await prisma.takeoutOrder.update({ where: { id }, data: { smsConfirmedAt: new Date() } }).catch(() => {});
}
