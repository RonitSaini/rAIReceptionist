import { formatDateTime } from "@/lib/time";
import { formatUsPhone } from "@/lib/form";
import type { BookingSummary, CancellationKind, SmsAccount, SmsTemplates } from "../../types";
import type { TradeWords } from "./index";

/**
 * Customer-facing SMS for every field_service trade.
 *
 * Everything in this file is transmitted, so everything in it must be GSM-7 — no em dashes, no
 * curly quotes, no ellipsis characters. tests/sms-gsm7.test.mjs scans every `*.sms.ts` and every
 * archetype's `sms.ts`, and separately renders every registered vertical's templates and checks the
 * output, because a trade noun that is not GSM-7 would slip past a scan of this file alone. One
 * such character re-encodes the whole message as UCS-2 and cuts the segment from 160 to 70.
 *
 * The trades differ by two words: what you call the person who turns up, and what the customer had
 * booked. A roofer books an estimate, not a visit, and saying "visit" to their customer is a small
 * wrongness a shared template has no excuse for.
 */

const callUs = (account: SmsAccount) => (account.twilioNumber ? ` Questions? Call ${formatUsPhone(account.twilioNumber)}.` : "");

/** Street address only, so a long "city, state, postcode" tail does not push the text to two segments. */
const shortAddress = (address: string | null | undefined) => {
  const first = (address ?? "").split(",")[0].trim();
  return first.length > 40 ? `${first.slice(0, 37)}...` : first;
};

export function fieldServiceSmsTemplates(w: TradeWords): SmsTemplates {
  return {
    bookingConfirmation(account, booking: BookingSummary) {
      const who = booking.technician ? ` ${booking.technician}` : "";
      const where = shortAddress(booking.address);
      const phone = callUs(account);

      if (booking.isEmergency) {
        return `${account.businessName}: We have your emergency${where ? ` at ${where}` : ""}. ${booking.technician || `Our ${w.staff}`} will call you within 15 minutes.${phone}`;
      }
      if (!booking.when) {
        return `${account.businessName}: Thanks ${booking.customerName}, we have your request${where ? ` for ${where}` : ""}. We will call to confirm a time. Reply CANCEL to cancel.${phone}`;
      }
      const when = formatDateTime(booking.when, account.timeZone);
      return `${account.businessName}: Booked!${who ? who + " is" : " We are"} coming ${when}${where ? ` to ${where}` : ""}. Reply CANCEL if your plans change.${phone}`;
    },

    escalationFollowUp(account, nextOpen) {
      const when = nextOpen ? ` when we next open (${nextOpen})` : " as soon as we can";
      const phone = account.twilioNumber ? ` You can also call us at ${formatUsPhone(account.twilioNumber)}.` : "";
      return `${account.businessName}: Thanks for calling. We could not reach a ${w.staff} right away - someone will call you${when}.${phone}`;
    },

    cancellationReply(account: SmsAccount, kind: CancellationKind, when: Date) {
      const at = formatDateTime(when, account.timeZone);
      if (kind === "job") return `${account.businessName}: Your ${w.visit} on ${at} is cancelled. Call us any time if you still need a ${w.staff}.`;
      return `${account.businessName}: That booking for ${at} is cancelled. Call us any time if you still need a ${w.staff}.`;
    },
  };
}
