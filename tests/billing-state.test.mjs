import { test } from "node:test";
import assert from "node:assert/strict";
import { billingState, graceDaysLeft, reclamationDueAt, reclamationWarnAt, GRACE_DAYS, RECLAIM_DAYS, RECLAIM_WARN_DAYS } from "@/lib/billing-state";

/**
 * The billing state machine (docs/frontdesk-billing-spec.md §1, §3), pinned as a table.
 *
 * Everything that enforces billing - the prompt, the function endpoint, the banner, the sweep -
 * asks this one function, so the table here is the policy in executable form: ten days of grace,
 * a warning at day twenty, the number gone at day thirty, and a reactivation that clears it all.
 * `now` is passed in everywhere; nothing here reads the clock.
 */

const DAY = 86_400_000;
const T0 = new Date("2026-09-06T12:00:00Z");
const daysLater = (n) => new Date(T0.getTime() + n * DAY);

const account = (over = {}) => ({ subscriptionStatus: "active", isInternal: false, paymentFailedAt: null, subscriptionEndedAt: null, ...over });

function withEnv(vars, fn) {
  const before = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  Object.entries(vars).forEach(([k, v]) => (v === undefined ? delete process.env[k] : (process.env[k] = v)));
  try {
    return fn();
  } finally {
    Object.entries(before).forEach(([k, v]) => (v === undefined ? delete process.env[k] : (process.env[k] = v)));
  }
}
const enforced = (fn) => withEnv({ BILLING_REQUIRED: "true" }, fn);

test("nothing is enforced unless BILLING_REQUIRED is on", () => {
  withEnv({ BILLING_REQUIRED: undefined }, () => {
    assert.equal(billingState(account({ subscriptionStatus: "none" }), T0), "exempt");
    assert.equal(billingState(account({ subscriptionStatus: "cancelled" }), T0), "exempt");
  });
});

test("an internal account is exempt even when it is enforced", () => {
  enforced(() => assert.equal(billingState(account({ subscriptionStatus: "none", isInternal: true }), T0), "exempt"));
});

test("active and trialing are ok", () => {
  enforced(() => {
    assert.equal(billingState(account(), T0), "ok");
    assert.equal(billingState(account({ subscriptionStatus: "trialing" }), T0), "ok");
  });
});

test("a failed payment buys ten days of grace, then pauses", () => {
  enforced(() => {
    const lapsed = account({ subscriptionStatus: "past_due", paymentFailedAt: T0 });
    assert.equal(billingState(lapsed, T0), "grace");
    assert.equal(billingState(lapsed, daysLater(GRACE_DAYS - 1)), "grace");
    assert.equal(graceDaysLeft(lapsed, daysLater(GRACE_DAYS - 1)), 1);
    assert.equal(billingState(lapsed, daysLater(GRACE_DAYS)), "paused");
    assert.equal(graceDaysLeft(lapsed, daysLater(GRACE_DAYS)), 0);
  });
});

test("past_due with no failure recorded does not get grace - the clock was never started", () => {
  // Only applySubscription sets the clock; a row that says past_due without one is paused, not
  // silently granted ten days nobody was told about.
  enforced(() => assert.equal(billingState(account({ subscriptionStatus: "past_due" }), T0), "paused"));
});

test("cancelled and none are paused, immediately", () => {
  enforced(() => {
    assert.equal(billingState(account({ subscriptionStatus: "cancelled", subscriptionEndedAt: T0 }), T0), "paused");
    assert.equal(billingState(account({ subscriptionStatus: "none" }), T0), "paused");
  });
});

test("the reclamation clock runs from the end of the subscription, or the end of grace", () => {
  const cancelled = account({ subscriptionStatus: "cancelled", subscriptionEndedAt: T0 });
  assert.deepEqual(reclamationWarnAt(cancelled), daysLater(RECLAIM_WARN_DAYS));
  assert.deepEqual(reclamationDueAt(cancelled), daysLater(RECLAIM_DAYS));

  // Never cancelled in Stripe, just never paid again: grace ends at day 10, warning at 30, gone at 40.
  const unpaid = account({ subscriptionStatus: "past_due", paymentFailedAt: T0 });
  assert.deepEqual(reclamationWarnAt(unpaid), daysLater(GRACE_DAYS + RECLAIM_WARN_DAYS));
  assert.deepEqual(reclamationDueAt(unpaid), daysLater(GRACE_DAYS + RECLAIM_DAYS));

  // An ended subscription is the earlier, harder fact and wins over the grace-derived clock.
  const both = account({ subscriptionStatus: "cancelled", paymentFailedAt: daysLater(-5), subscriptionEndedAt: T0 });
  assert.deepEqual(reclamationDueAt(both), daysLater(RECLAIM_DAYS));

  assert.equal(reclamationDueAt(account()), null);
});

test("reactivation is a clean slate: an active account has no clocks that matter", () => {
  enforced(() => {
    // Even with stale clock values present, active wins; applySubscription clears them anyway.
    const back = account({ subscriptionStatus: "active", paymentFailedAt: daysLater(-40), subscriptionEndedAt: daysLater(-35) });
    assert.equal(billingState(back, T0), "ok");
  });
});
