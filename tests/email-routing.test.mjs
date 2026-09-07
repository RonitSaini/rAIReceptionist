import { test } from "node:test";
import assert from "node:assert/strict";
import { routeOutbound } from "@/lib/email";

/**
 * Only production talks to real people (src/lib/email.ts routeOutbound).
 *
 * On the night of 2026-09-06 three signups on a laptop mailed the addresses typed into them - a
 * welcome email and a referral email each, to people who never asked for anything. The rule that
 * stops that is pinned here as a table, with the environment passed in, so the test never depends
 * on where it is running.
 */

test("production sends to the real recipient, untouched", () => {
  assert.deepEqual(routeOutbound("owner@example.com", "Welcome", { production: true, devInbox: "dev@example.com" }), { to: "owner@example.com", subject: "Welcome" });
  // A dev inbox configured on production changes nothing.
  assert.deepEqual(routeOutbound("owner@example.com", "Welcome", { production: true, devInbox: null }), { to: "owner@example.com", subject: "Welcome" });
});

test("anywhere else redirects to the dev inbox and names the real recipient in the subject", () => {
  assert.deepEqual(routeOutbound("stranger@example.com", "Welcome to FrontDesk AI", { production: false, devInbox: "dev@example.com" }), {
    to: "dev@example.com",
    subject: "[to: stranger@example.com] Welcome to FrontDesk AI",
  });
});

test("anywhere else with no dev inbox refuses - nothing leaves an unconfigured machine", () => {
  assert.equal(routeOutbound("stranger@example.com", "Welcome", { production: false, devInbox: undefined }), null);
  assert.equal(routeOutbound("stranger@example.com", "Welcome", { production: false, devInbox: "   " }), null);
});

test("the redirect applies to the owner's own addresses too - there is no allowlist to maintain", () => {
  const r = routeOutbound("mintchilled553+test@gmail.com", "Confirm your email", { production: false, devInbox: "mintchilled553@gmail.com" });
  assert.equal(r.to, "mintchilled553@gmail.com");
  assert.match(r.subject, /^\[to: mintchilled553\+test@gmail\.com\] /);
});
