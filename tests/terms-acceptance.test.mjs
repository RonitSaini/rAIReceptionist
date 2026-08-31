import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * ToS acceptance gates account creation — on the SERVER, which is what these tests pin. The
 * checkbox and the disabled buttons are courtesy; the contract is that signUp (the endpoint every
 * hand-crafted POST ultimately reaches) refuses first, before validating, looking up or creating
 * anything. The Google path's equivalent (a new user with no signed consent cookie is refused in
 * the NextAuth callback) rests on hasPendingTermsCookie, whose no-request behavior is pinned here
 * too: absence of proof is never proof.
 */

process.env.DATABASE_URL ??= "postgresql://snapshot:snapshot@localhost:5432/snapshot";
process.env.DIRECT_URL ??= process.env.DATABASE_URL;

const { signUp } = await import("../src/actions/auth.ts");
const { hasPendingTermsCookie } = await import("../src/lib/terms-acceptance.ts");
const { TERMS_VERSION, TERMS_EFFECTIVE } = await import("../src/app/terms/terms-version.ts");

const fd = (entries) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

test("a hand-crafted signup POST without acceptance is refused", async () => {
  // Everything else about this request is valid — the terms gate alone must stop it. No database
  // is configured in this test on purpose: the refusal has to happen before anything is touched.
  const r = await signUp(null, fd({ email: "crafted@example.test", password: "longenough1", businessName: "Crafted Co", vertical: "plumbing" }));
  assert.equal(r.ok, false);
  assert.match(r.error, /accept the Terms of Service/);
});

test("the gate is first: with acceptance ticked, validation proceeds past it", async () => {
  const r = await signUp(null, fd({ acceptTerms: "on", email: "not-an-email", password: "longenough1", businessName: "Crafted Co", vertical: "plumbing" }));
  assert.equal(r.ok, false);
  assert.match(r.error, /valid email/); // a different refusal — the terms gate let it through
});

test("forged checkbox values do not count", async () => {
  for (const v of ["true", "1", "yes", "ON "]) {
    const r = await signUp(null, fd({ acceptTerms: v, email: "crafted@example.test", password: "longenough1", businessName: "Crafted Co", vertical: "plumbing" }));
    assert.match(r.error ?? "", /accept the Terms of Service/, `value ${JSON.stringify(v)} must not pass`);
  }
});

test("the Google consent cookie is never assumed outside a real request", async () => {
  // In the NextAuth callback this returning false means: new Google user, no captured consent,
  // no account. Outside any request context it must fail closed, not throw and not pass.
  assert.equal(await hasPendingTermsCookie(), false);
});

test("the terms version is date-based and the page's effective date derives from it", () => {
  assert.match(TERMS_VERSION, /^\d{4}-\d{2}-\d{2}$/);
  const expected = new Date(`${TERMS_VERSION}T12:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  assert.equal(TERMS_EFFECTIVE, expected);
});
