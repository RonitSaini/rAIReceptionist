import { test } from "node:test";
import assert from "node:assert/strict";
import { canTextFrom, NO_TEXT_TO_THIS_NUMBER, NO_TEXT_YET, recipientCountry, textPromiseBlocker } from "@/lib/confirmation-text";

/**
 * A confirmation text can only go out from the account's own number, and until the A2P campaign
 * is approved (no messaging service) only Canadian carriers deliver it. Every booking function
 * result used to end with "a confirmation text is on its way" regardless, so the browser demo
 * promised texts that could never arrive (2026-09-07 sweep) and a US caller would have been
 * promised one that carriers filter. The rule (2026-09-08): with a number and a messaging
 * service, promise; with a number and no service, promise only to a Canadian number; withhold
 * whenever the recipient is US-bound or cannot be placed; without a number, never promise.
 */

function withService(value, fn) {
  const before = process.env.TWILIO_MESSAGING_SERVICE_SID;
  if (value === undefined) delete process.env.TWILIO_MESSAGING_SERVICE_SID;
  else process.env.TWILIO_MESSAGING_SERVICE_SID = value;
  try {
    return fn();
  } finally {
    if (before === undefined) delete process.env.TWILIO_MESSAGING_SERVICE_SID;
    else process.env.TWILIO_MESSAGING_SERVICE_SID = before;
  }
}

const WITH_NUMBER = { twilioNumber: "+12125550199" };
const NO_NUMBER = { twilioNumber: null };
const US = "+12125550142"; // Manhattan
const CA = "+14165550142"; // Toronto

test("only an account with a number can text", () => {
  assert.equal(canTextFrom(WITH_NUMBER), true);
  assert.equal(canTextFrom(NO_NUMBER), false);
  assert.equal(canTextFrom({ twilioNumber: "" }), false);
});

test("a recipient's country comes from the number alone: Canadian area codes, then US, else unknown", () => {
  assert.equal(recipientCountry(CA), "CA");
  assert.equal(recipientCountry("+1 (604) 555-0142"), "CA");
  assert.equal(recipientCountry("5145550142"), "CA");
  assert.equal(recipientCountry(US), "US");
  assert.equal(recipientCountry("+13125550142"), "US");
  assert.equal(recipientCountry("+442071234567"), "unknown");
  assert.equal(recipientCountry(""), "unknown");
  assert.equal(recipientCountry(null), "unknown");
  assert.equal(recipientCountry("+11235550142"), "unknown", "an area code cannot start with 1");
});

test("with a messaging service, every recipient with a number gets the promise", () => {
  withService("MGtest000000000000000000000000000", () => {
    assert.equal(textPromiseBlocker(WITH_NUMBER, US), null);
    assert.equal(textPromiseBlocker(WITH_NUMBER, CA), null);
    assert.equal(textPromiseBlocker(WITH_NUMBER, "+442071234567"), null);
  });
});

test("without a messaging service, only a Canadian recipient gets the promise; US-bound and unplaceable are withheld", () => {
  withService(undefined, () => {
    assert.equal(textPromiseBlocker(WITH_NUMBER, CA), null);
    assert.equal(textPromiseBlocker(WITH_NUMBER, US), NO_TEXT_TO_THIS_NUMBER);
    assert.equal(textPromiseBlocker(WITH_NUMBER, "+442071234567"), NO_TEXT_TO_THIS_NUMBER);
    assert.equal(textPromiseBlocker(WITH_NUMBER, null), NO_TEXT_TO_THIS_NUMBER);
  });
});

test("without a number there is never a promise, service or not, and the caller is told why in words that fit", () => {
  withService("MGtest000000000000000000000000000", () => assert.equal(textPromiseBlocker(NO_NUMBER, CA), NO_TEXT_YET));
  withService(undefined, () => assert.equal(textPromiseBlocker(NO_NUMBER, US), NO_TEXT_YET));
  assert.match(NO_TEXT_YET, /^Do not promise a text/);
  assert.match(NO_TEXT_YET, /once the number is set up/);
  assert.match(NO_TEXT_TO_THIS_NUMBER, /^Do not promise a text/);
  assert.match(NO_TEXT_TO_THIS_NUMBER, /do not mention a text/);
  assert.doesNotMatch(NO_TEXT_TO_THIS_NUMBER, /registration|campaign|carrier/i, "the caller never hears why");
});
