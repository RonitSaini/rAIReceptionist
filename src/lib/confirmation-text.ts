import type { Account } from "@prisma/client";

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
