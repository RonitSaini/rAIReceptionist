import { formatDateTime } from "@/lib/time";
import { formatUsPhone } from "@/lib/form";
import type { BookingSummary, CancellationKind, SmsAccount, SmsTemplates } from "../../types";
import type { ShopWords } from "./index";

/**
 * Customer-facing SMS for a shop.
 *
 * Everything here is transmitted, so everything must be GSM-7 — no em dashes, no curly quotes, no
 * ellipsis characters. tests/sms-gsm7.test.mjs scans this file and separately renders every
 * registered vertical's templates and checks the output.
 *
 * Shorter than the field-service ones on purpose: there is no address to read back, because the
 * customer already knows where the shop is. What they need is the day, the time, and who it is for.
 */

const callUs = (account: SmsAccount) => (account.twilioNumber ? ` Questions? Call ${formatUsPhone(account.twilioNumber)}.` : "");

export function shopSmsTemplates(w: ShopWords): SmsTemplates {
  return {
    bookingConfirmation(account, booking: BookingSummary) {
      const phone = callUs(account);
      const subject = booking.items ? ` for ${booking.items}` : "";
      if (!booking.when) {
        return `${account.businessName}: Thanks ${booking.customerName}, we have your request${subject}. We will call to confirm a time. Reply CANCEL to cancel.${phone}`;
      }
      const when = formatDateTime(booking.when, account.timeZone);
      return `${account.businessName}: Booked! ${when}${subject}. Please arrive a few minutes early. Reply CANCEL if your plans change.${phone}`;
    },

    escalationFollowUp(account, nextOpen) {
      const when = nextOpen ? ` when we next open (${nextOpen})` : " as soon as we can";
      const phone = account.twilioNumber ? ` You can also call us at ${formatUsPhone(account.twilioNumber)}.` : "";
      return `${account.businessName}: Thanks for calling. We could not reach a ${w.staff} right away - someone will call you${when}.${phone}`;
    },

    cancellationReply(account: SmsAccount, kind: CancellationKind, when: Date) {
      const at = formatDateTime(when, account.timeZone);
      if (kind === "job") return `${account.businessName}: Your ${w.visit} on ${at} is cancelled. Call us any time to rebook.`;
      return `${account.businessName}: That booking for ${at} is cancelled. Call us any time to rebook.`;
    },
  };
}
