import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * Carrier compliance keywords never reach the owner.
 *
 * The bug this pins: texting START produced "Text from +1 212 555 0142 — START" in the notification
 * feed. Twilio had already handled the opt-in; the owner was told about a protocol detail. The two
 * halves worth locking are the fold (case, spacing and punctuation are all noise) and the two
 * keywords deliberately left out of the set, because losing a real CANCEL is far worse than
 * showing one spurious notification.
 */

process.env.DATABASE_URL ??= "postgresql://snapshot:snapshot@localhost:5432/snapshot";
process.env.DIRECT_URL ??= process.env.DIRECT_URL ?? process.env.DATABASE_URL;

const { isCarrierKeyword, carrierKeywordKind } = await import("../src/lib/sms-keywords.ts");
const { isCancelIntent } = await import("../src/app/api/twilio/sms/route.ts");

test("every reserved keyword is recognised", () => {
  for (const s of ["STOP", "STOPALL", "UNSUBSCRIBE", "END", "QUIT", "START", "UNSTOP", "HELP", "INFO"]) {
    assert.equal(isCarrierKeyword(s), true, s);
  }
});

test("case, spacing and punctuation are noise", () => {
  for (const s of ["stop", "Stop", "sToP", " STOP ", "\tstop\n", "STOP.", "stop!", "Stop?", "STOP ALL", "stop all", "S.T.O.P.", "  Help  ", "unSTOP"]) {
    assert.equal(isCarrierKeyword(s), true, JSON.stringify(s));
  }
});

test("a keyword inside a sentence is still a message for the owner", () => {
  for (const s of ["stop, I need help", "please stop calling me", "help me find the place", "can you start earlier", "info about parking?", "we quit the other guy"]) {
    assert.equal(isCarrierKeyword(s), false, s);
  }
});

test("CANCEL stays ours: a carrier opt-out word, but the whole point of the confirmation texts", () => {
  for (const s of ["CANCEL", "cancel", " Cancel. "]) {
    assert.equal(isCarrierKeyword(s), false, s);
    assert.equal(isCancelIntent(s), true, s);
  }
});

test("YES keeps notifying — a plain English answer more often than an opt-in", () => {
  assert.equal(isCarrierKeyword("YES"), false);
  assert.equal(isCarrierKeyword("yes"), false);
});

test("the replies that change the owner's day are untouched", () => {
  // The escalation acknowledgement ("OK"), a cancellation, and the numbered which-one answer.
  for (const s of ["OK", "ok", "Okay", "1", "2", "3", "CANCEL", "running late", "thanks"]) {
    assert.equal(isCarrierKeyword(s), false, s);
  }
});

test("an empty or punctuation-only body is not a keyword", () => {
  for (const s of ["", "   ", "...", "?!"]) {
    assert.equal(isCarrierKeyword(s), false, JSON.stringify(s));
  }
});

test("each keyword is classified by what it asks the carrier to do", () => {
  for (const s of ["STOP", "stopall", "UNSUBSCRIBE", "end", "QUIT"]) assert.equal(carrierKeywordKind(s), "opt_out", s);
  for (const s of ["START", "unstop"]) assert.equal(carrierKeywordKind(s), "opt_in", s);
  for (const s of ["HELP", "info"]) assert.equal(carrierKeywordKind(s), "help", s);
});

test("anything that is not a keyword classifies as nothing", () => {
  for (const s of ["CANCEL", "YES", "OK", "1", "stop calling me", ""]) assert.equal(carrierKeywordKind(s), null, JSON.stringify(s));
});

test("HELP is a keyword but moves no opt-out state — only opt_out and opt_in do", () => {
  // applyCarrierKeyword() returns early on "help"; this pins the classification it relies on.
  assert.equal(carrierKeywordKind("HELP"), "help");
  assert.notEqual(carrierKeywordKind("HELP"), "opt_out");
});
