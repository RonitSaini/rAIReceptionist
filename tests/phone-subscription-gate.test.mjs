import { test } from "node:test";
import assert from "node:assert/strict";
import { canConnectNumber, phoneRequiresSubscription } from "@/lib/env";

/**
 * A phone number is only issued to an account that is paying for one.
 *
 * This is a money rule, not a UI preference: a Twilio number bills every month for as long as it
 * exists, whether or not anyone ever subscribes behind it. The rule was a hard one, spent five days
 * as a default-off flag while the first signups came in (2026-09-01), and is back on by default
 * since 2026-09-06.
 *
 * The default is the part worth pinning down. `phoneRequiresSubscription` reads its variable with
 * the opposite polarity to every other flag in env.ts, so an accidental "tidy-up" to `=== "true"`
 * would silently start giving numbers away in every environment that never set the variable —
 * which today is all of them. These assertions are what makes that a failing test rather than a
 * bill.
 */

/** env.ts reads process.env per call, so a case can just set it and put it back. */
function withEnv(vars, fn) {
  const before = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  Object.entries(vars).forEach(([k, v]) => (v === undefined ? delete process.env[k] : (process.env[k] = v)));
  try {
    return fn();
  } finally {
    Object.entries(before).forEach(([k, v]) => (v === undefined ? delete process.env[k] : (process.env[k] = v)));
  }
}

const STRIPE_ON = { STRIPE_SECRET_KEY: "sk_test_gate_only_never_sent_anywhere" };
const account = (subscriptionStatus) => ({ subscriptionStatus });

test("the rule is on when nobody has set the variable", () => {
  withEnv({ PHONE_REQUIRES_SUBSCRIPTION: undefined }, () => assert.equal(phoneRequiresSubscription(), true));
  // Copying .env.example gives an empty string, which must still mean "enforce".
  withEnv({ PHONE_REQUIRES_SUBSCRIPTION: "" }, () => assert.equal(phoneRequiresSubscription(), true));
  withEnv({ PHONE_REQUIRES_SUBSCRIPTION: "true" }, () => assert.equal(phoneRequiresSubscription(), true));
});

test("only the exact string false switches it off", () => {
  withEnv({ PHONE_REQUIRES_SUBSCRIPTION: "false" }, () => assert.equal(phoneRequiresSubscription(), false));
  // Anything else stays enforced. A near-miss erring towards charging is the harmless direction.
  for (const v of ["FALSE", "False", "0", "no", "off"]) {
    withEnv({ PHONE_REQUIRES_SUBSCRIPTION: v }, () => assert.equal(phoneRequiresSubscription(), true, `${v} must not disable the rule`));
  }
});

test("a number needs a subscription that is actually paying", () => {
  withEnv({ ...STRIPE_ON, PHONE_REQUIRES_SUBSCRIPTION: undefined }, () => {
    for (const status of ["none", "past_due", "cancelled"]) {
      assert.equal(canConnectNumber(account(status)), false, `${status} must not get a number`);
    }
    assert.equal(canConnectNumber(account("active")), true);
    // Trialing is a grant made deliberately in Stripe, and the app never creates one on its own.
    assert.equal(canConnectNumber(account("trialing")), true);
  });
});

test("the off switch releases the gate", () => {
  withEnv({ ...STRIPE_ON, PHONE_REQUIRES_SUBSCRIPTION: "false" }, () => assert.equal(canConnectNumber(account("none")), true));
});

test("no Stripe, no gate: an environment where nobody can subscribe must not have a step that never opens", () => {
  withEnv({ STRIPE_SECRET_KEY: undefined, PHONE_REQUIRES_SUBSCRIPTION: undefined }, () => {
    assert.equal(canConnectNumber(account("none")), true);
  });
});
