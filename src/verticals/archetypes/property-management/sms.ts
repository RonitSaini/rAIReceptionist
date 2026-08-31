import { formatUsPhone } from "@/lib/form";
import { formatDateTime } from "@/lib/time";
import type { BookingSummary, CancellationKind, SmsAccount, SmsTemplates } from "../../types";
import type { PmWords } from "./index";

/**
 * Customer-facing SMS for property management.
 *
 * Everything here is transmitted, so everything must be GSM-7. Deliberately says nothing about
 * where the work order is: the text goes to a phone number, and a phone can be read by someone
 * standing next to the person who reported the fault. The tenant already knows their own address.
 */

const callUs = (account: SmsAccount) => (account.twilioNumber ? ` Questions? Call ${formatUsPhone(account.twilioNumber)}.` : "");

export function pmSmsTemplates(w: PmWords): SmsTemplates {
  return {
    bookingConfirmation(account, booking: BookingSummary) {
      const phone = callUs(account);
      if (booking.isEmergency) {
        return `${account.businessName}: We have your emergency and someone has been alerted. You will get a call back shortly.${phone}`;
      }
      return `${account.businessName}: Thanks ${booking.customerName}, your ${w.visit} is logged. We will be in touch to arrange a time.${phone}`;
    },

    escalationFollowUp(account, nextOpen) {
      const when = nextOpen ? ` when the office next opens (${nextOpen})` : " as soon as we can";
      const phone = account.twilioNumber ? ` You can also call us at ${formatUsPhone(account.twilioNumber)}.` : "";
      return `${account.businessName}: Thanks for calling. We could not reach anyone right away - someone will call you${when}.${phone}`;
    },

    cancellationReply(account: SmsAccount, kind: CancellationKind, when: Date) {
      const at = formatDateTime(when, account.timeZone);
      if (kind === "job") return `${account.businessName}: The ${w.visit} scheduled for ${at} is cancelled. Call us if you still need it.`;
      return `${account.businessName}: That booking for ${at} is cancelled. Call us any time.`;
    },
  };
}
