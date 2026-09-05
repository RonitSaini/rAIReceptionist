/**
 * Carrier compliance keywords in an inbound text.
 *
 * Every US/Canadian carrier reserves a small vocabulary — STOP and friends to leave, START to come
 * back, HELP to ask what this is — and the CTIA requires them to work on any number that sends
 * messages. Twilio intercepts them, updates its own subscription list and sends the mandated
 * auto-reply itself, but the webhook still fires: that is how "Text from +1 555 0142 — START" ended
 * up in an owner's notification feed. Nobody running a business needs to be told a customer typed
 * START.
 *
 * So they are handled here: recorded like any other inbound message (they are billed segments and
 * belong in the cost history), written to the customer's opt-out state, then answered with silence
 * — no notification, and no reply of our own on top of the carrier's.
 */

/** What the sender is asking for. Opt-out and opt-in both move `Customer.smsOptedOutAt`. */
export type CarrierKeywordKind = "opt_out" | "opt_in" | "help";

/**
 * The keywords, matched only as a whole message.
 *
 * Two of Twilio's defaults are deliberately absent:
 *
 * - CANCEL is an opt-out keyword to the carriers and the whole point of our confirmation texts
 *   ("Reply CANCEL to cancel a booking"). A customer who cancels a booking is telling the owner
 *   something that changes their day, so it keeps its notification and its cancellation flow.
 * - YES is an opt-in keyword to the carriers and a plain English answer to everyone else. Someone
 *   coming back from a STOP almost always types START or UNSTOP; someone typing YES is more often
 *   replying to a person. Left notifying on purpose — swallowing a real message is the worse error.
 *
 * Both still work at the carrier, which is the only place compliance is actually enforced. Leaving
 * them out only means this app does not *also* act on them.
 */
const CARRIER_KEYWORDS: ReadonlyMap<string, CarrierKeywordKind> = new Map([
  // Leave.
  ["STOP", "opt_out"],
  ["STOPALL", "opt_out"],
  ["UNSUBSCRIBE", "opt_out"],
  ["END", "opt_out"],
  ["QUIT", "opt_out"],
  // Come back.
  ["START", "opt_in"],
  ["UNSTOP", "opt_in"],
  // What is this?
  ["HELP", "help"],
  ["INFO", "help"],
]);

/**
 * Which reserved word this whole message is, if any.
 *
 * Case, spacing and punctuation are all noise here — carriers accept " stop ", "Stop!" and
 * "STOP ALL" alike, and a keypad user sends whatever their thumbs produced. Everything that is not
 * a letter or a digit is dropped before the comparison, which folds "STOP ALL" onto STOPALL and
 * "S.T.O.P." onto STOP without ever matching a sentence: only a message made of nothing but the
 * keyword can survive the fold, so "stop, I need help" stays an ordinary message.
 */
export function carrierKeywordKind(body: string): CarrierKeywordKind | null {
  const folded = body.replace(/[^\p{L}\p{N}]+/gu, "").toUpperCase();
  return folded.length > 0 ? (CARRIER_KEYWORDS.get(folded) ?? null) : null;
}

/** Is this whole message one of the reserved keywords, whatever it asks for? */
export function isCarrierKeyword(body: string): boolean {
  return carrierKeywordKind(body) !== null;
}
