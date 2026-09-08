import type { Account } from "@prisma/client";
import { messagingServiceSid } from "./twilio";

/**
 * Whether a confirmation text can go out for this account right now.
 *
 * Texts are sent from the account's own number, so until one is provisioned - the browser demo
 * before paying, or the gap between paying and the phone step - there is nothing to send from.
 * Found in the 2026-09-07 pre-launch sweep: every demo call ended with the agent promising a
 * confirmation text that could never arrive, because the function results told it to.
 */
export function canTextFrom(a: Pick<Account, "twilioNumber">): boolean {
  return !!a.twilioNumber;
}

/** What a function result tells the agent instead of the text promise, while there is no number. */
export const NO_TEXT_YET = "Do not promise a text: this business's phone number is not set up yet, so say confirmations will be sent by text once the number is set up, and read the details back to them instead.";

/**
 * What it tells the agent when the number exists but a text to THIS recipient would be filtered:
 * no registered messaging service yet, and the recipient is US-bound (or cannot be placed).
 * The caller never hears why; they just get the details read back.
 */
export const NO_TEXT_TO_THIS_NUMBER = "Do not promise a text: texting to this caller's number is not available yet, so read the details back to them instead and do not mention a text.";

/**
 * Canadian NANP area codes. Everything else under +1 is treated as US-bound for the registration
 * rule (Caribbean codes fall in that bucket too, which errs on the side of not promising).
 */
const CANADIAN_AREA_CODES = new Set(["204", "226", "236", "249", "250", "257", "263", "289", "306", "343", "354", "365", "367", "368", "382", "387", "403", "416", "418", "428", "431", "437", "438", "450", "460", "468", "474", "506", "514", "519", "548", "579", "581", "584", "587", "604", "613", "639", "647", "672", "683", "705", "709", "742", "753", "778", "780", "782", "807", "819", "825", "851", "867", "873", "879", "902", "905"]);

export type RecipientCountry = "US" | "CA" | "unknown";

/** Where a text to this number would land, from the number alone. Anything that is not a NANP number is unknown. */
export function recipientCountry(phone: string | null | undefined): RecipientCountry {
  const digits = (phone ?? "").replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits.length === 10 ? digits : null;
  if (!national) return "unknown";
  const area = national.slice(0, 3);
  if (CANADIAN_AREA_CODES.has(area)) return "CA";
  return /^[2-9]\d\d$/.test(area) ? "US" : "unknown";
}

/**
 * The instruction that replaces the text promise in a function result, or null when the promise
 * is honest. Until the A2P campaign is approved there is no messaging service, and US carriers
 * filter texts from a bare number; Canadian carriers deliver them. So without a service the
 * promise is kept only for a recipient whose number is Canadian, and withheld whenever the
 * recipient is US-bound or cannot be placed (decided 2026-09-08).
 */
export function textPromiseBlocker(a: Pick<Account, "twilioNumber">, recipientPhone: string | null | undefined): string | null {
  if (!canTextFrom(a)) return NO_TEXT_YET;
  if (messagingServiceSid()) return null;
  return recipientCountry(recipientPhone) === "CA" ? null : NO_TEXT_TO_THIS_NUMBER;
}
