import { formatDateTime } from "@/lib/time";
import { formatUsPhone } from "@/lib/form";
import type { BookingSummary, CancellationKind, SmsAccount, SmsTemplates } from "./types";

/**
 * Guest-facing SMS for restaurants.
 *
 * Every vertical keeps its templates in its own `*.sms.ts` file, and tests/sms-gsm7.test.mjs
 * scans all of them. The split matters: a system prompt is free to use em dashes and curly
 * quotes, an SMS is not — one non-GSM-7 character re-encodes the whole message as UCS-2 and
 * drops the segment size from 160 characters to 70. Keeping sendable text in files that contain
 * nothing but sendable text is what makes that check mechanical instead of a judgement call.
 */

const trim = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 3)}...` : s);

const callUs = (account: SmsAccount) => (account.twilioNumber ? ` Questions? Call ${formatUsPhone(account.twilioNumber)}.` : "");

/** Carrier rules want opt-out language visible in the first message a customer receives, so every
 *  template that can OPEN a conversation ends with this. Replies (cancellations etc.) do not. */
const STOP = " Reply STOP to opt out.";

function reservationConfirmation(account: SmsAccount, b: BookingSummary): string {
  // A restaurant booking always has a time; the null case only exists for a field-service job
  // that has been requested but not yet slotted.
  const when = b.when ? formatDateTime(b.when, account.timeZone) : "a time we will confirm";
  const phone = callUs(account);
  if (b.isWaitlist) return `${account.businessName}: ${b.customerName}, you're on our waitlist for ${b.partySize} on ${when}. We'll call if a table opens up. Reply CANCEL to leave the waitlist.${phone}${STOP}`;
  return `${account.businessName}: You're booked! Party of ${b.partySize} on ${when}. Reply CANCEL if your plans change.${phone}${STOP}`;
}

function orderConfirmation(account: SmsAccount, b: BookingSummary): string {
  const when = b.when ? formatDateTime(b.when, account.timeZone) : "a time we will confirm";
  const items = trim((b.items ?? "").replace(/\s*\n+\s*/g, ", "), 90);
  const phone = callUs(account);
  return `${account.businessName}: Order received - ${items}. ${b.isDelivery ? "Delivery" : "Pickup"} ${when}. Reply CANCEL to cancel.${phone}${STOP}`;
}

export const restaurantSmsTemplates: SmsTemplates = {
  bookingConfirmation(account, booking) {
    return booking.kind === "order" ? orderConfirmation(account, booking) : reservationConfirmation(account, booking);
  },

  escalationFollowUp(account, nextOpen) {
    const when = nextOpen ? ` when we next open (${nextOpen})` : " as soon as we open";
    const phone = account.twilioNumber ? ` You can also call us at ${formatUsPhone(account.twilioNumber)}.` : "";
    return `${account.businessName}: Thanks for calling. Our manager couldn't get back to you right away - they'll call you${when}.${phone}${STOP}`;
  },

  cancellationReply(account: SmsAccount, kind: CancellationKind, when: Date) {
    const w = formatDateTime(when, account.timeZone);
    if (kind === "waitlist") return `${account.businessName}: You've been removed from the waitlist for ${w}. Hope to see you another time!`;
    if (kind === "order") return `${account.businessName}: Your order for ${w} is cancelled. Hope to see you another time!`;
    return `${account.businessName}: Your reservation for ${w} is cancelled. Hope to see you another time!`;
  },
};
