import { formatDateTime } from "@/lib/time";
import { formatUsPhone } from "@/lib/form";
import type { BookingSummary, CancellationKind, SmsAccount, SmsTemplates } from "./types";

/**
 * Customer-facing SMS for plumbing.
 *
 * Everything in this file is transmitted, so everything in it must be GSM-7 — no em dashes, no
 * curly quotes, no ellipsis characters. tests/sms-gsm7.test.mjs scans every `*.sms.ts` file and
 * fails on the first character outside the alphabet, because one of them re-encodes the whole
 * message as UCS-2 and cuts the segment size from 160 characters to 70.
 */

const callUs = (account: SmsAccount) => (account.twilioNumber ? ` Questions? Call ${formatUsPhone(account.twilioNumber)}.` : "");

/** Street address only, so a long "city, state, postcode" tail does not push the text to two segments. */
const shortAddress = (address: string | null | undefined) => {
  const first = (address ?? "").split(",")[0].trim();
  return first.length > 40 ? `${first.slice(0, 37)}...` : first;
};

export const plumbingSmsTemplates: SmsTemplates = {
  bookingConfirmation(account, booking: BookingSummary) {
    const who = booking.technician ? ` ${booking.technician}` : "";
    const where = shortAddress(booking.address);
    const phone = callUs(account);

    if (booking.isEmergency) {
      return `${account.restaurantName}: We have your emergency${where ? ` at ${where}` : ""}. ${booking.technician || "Our plumber"} will call you within 15 minutes.${phone}`;
    }
    if (!booking.when) {
      return `${account.restaurantName}: Thanks ${booking.customerName}, we have your request${where ? ` for ${where}` : ""}. We will call to confirm a time. Reply CANCEL to cancel.${phone}`;
    }
    const when = formatDateTime(booking.when, account.timeZone);
    return `${account.restaurantName}: Booked!${who ? who + " is" : " We are"} coming ${when}${where ? ` to ${where}` : ""}. Reply CANCEL if your plans change.${phone}`;
  },

  escalationFollowUp(account, nextOpen) {
    const when = nextOpen ? ` when we next open (${nextOpen})` : " as soon as we can";
    const phone = account.twilioNumber ? ` You can also call us at ${formatUsPhone(account.twilioNumber)}.` : "";
    return `${account.restaurantName}: Thanks for calling. We could not reach a plumber right away - someone will call you${when}.${phone}`;
  },

  cancellationReply(account: SmsAccount, kind: CancellationKind, when: Date) {
    const w = formatDateTime(when, account.timeZone);
    if (kind === "job") return `${account.restaurantName}: Your visit on ${w} is cancelled. Call us any time if you still need a plumber.`;
    return `${account.restaurantName}: That booking for ${w} is cancelled. Call us any time if you still need a plumber.`;
  },
};
