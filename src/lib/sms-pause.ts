import { messagingServiceSid } from "./twilio";
import { recipientCountry } from "./confirmation-text";

/**
 * Texting to US numbers is paused until the A2P campaign is approved (2026-09-08).
 *
 * With no messaging service a text leaves from the bare number, US carriers filter it as
 * unregistered traffic, and the delivery receipt filed an urgent "Couldn't text" alert for every
 * booking - noise about one known condition, on the owner's Home, all day. So while there is no
 * service, a US-bound (or unplaceable) recipient is not attempted at all: the row is recorded as
 * skipped with this plain reason, nothing is notified, and Home carries one dismissable line
 * instead. Canadian carriers deliver from a bare number, so a Canadian recipient goes out as before.
 * The day TWILIO_MESSAGING_SERVICE_SID is set, all of this switches off by itself.
 */
export const SMS_PAUSE_TITLE = "Text confirmations to US numbers are paused until carrier registration completes";

/** What the skipped SmsMessage row says. GSM-7, like every string that could end up beside a text. */
export const SMS_PAUSE_REASON = `${SMS_PAUSE_TITLE}.`;

export function smsPausedFor(to: string): boolean {
  return !messagingServiceSid() && recipientCountry(to) !== "CA";
}

/** Set to the account id when the owner dismissed Home's banner in this browser. */
export const SMS_PAUSE_DISMISS_COOKIE = "fd-sms-pause-dismissed";

/**
 * Home shows the banner while texting is paused and the account has a number to text from (an
 * account without one has nothing paused), unless this browser dismissed it for this account.
 */
export function showSmsPauseBanner(account: { id: string; twilioNumber: string | null }, dismissedFor: string | null | undefined): boolean {
  return !messagingServiceSid() && !!account.twilioNumber && dismissedFor !== account.id;
}
