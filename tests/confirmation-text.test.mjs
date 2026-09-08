import { test } from "node:test";
import assert from "node:assert/strict";
import { canTextFrom, NO_TEXT_YET } from "@/lib/confirmation-text";

/**
 * A confirmation text can only go out from the account's own number. Every booking function
 * result used to end with "a confirmation text is on its way", number or not, so the browser
 * demo promised texts that could never arrive (2026-09-07 sweep, every archetype).
 */

test("only an account with a number can text", () => {
  assert.equal(canTextFrom({ twilioNumber: "+12125550199" }), true);
  assert.equal(canTextFrom({ twilioNumber: null }), false);
  assert.equal(canTextFrom({ twilioNumber: "" }), false);
});

test("without a number the agent is told what to say instead of the promise", () => {
  assert.match(NO_TEXT_YET, /^Do not promise a text/);
  assert.match(NO_TEXT_YET, /once the number is set up/);
  assert.match(NO_TEXT_YET, /read the details back/);
});
