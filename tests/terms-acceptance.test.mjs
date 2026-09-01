import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * ToS acceptance gates account creation — on the SERVER, which is what these tests pin. The
 * checkbox and the disabled buttons are courtesy; the contract is that signUp (the endpoint every
 * hand-crafted POST ultimately reaches) refuses first, before validating, looking up or creating
 * anything.
 *
 * The Google path has no equivalent here to pin: it no longer carries consent in a cookie taken
 * before the redirect. Signing in with Google creates a User row and nothing else, and the asking
 * happens on onboarding step 1, whose action (createAccountForCurrentUser) refuses to create an
 * Account without acceptance — a guarantee that needs a session and a database, so it is covered by
 * the browser walk rather than here.
 */

process.env.DATABASE_URL ??= "postgresql://snapshot:snapshot@localhost:5432/snapshot";
process.env.DIRECT_URL ??= process.env.DATABASE_URL;

const { signUp } = await import("../src/actions/auth.ts");
const termsAcceptance = await import("../src/lib/terms-acceptance.ts");
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

test("consent is never carried across the Google redirect in a cookie", async () => {
  // The pre-redirect cookie let the signup form's checkbox stand in for the Google path, so a
  // Google sign-up was never shown a box to tick — and a tick on an abandoned attempt could
  // silently consent a later one for the fifteen minutes it lived. Nothing may reintroduce it.
  for (const gone of ["setPendingTermsCookie", "hasPendingTermsCookie"]) {
    assert.equal(termsAcceptance[gone], undefined, `${gone} must stay gone: the Google path asks on step 1`);
  }
});

test("the terms version is date-based and the page's effective date derives from it", () => {
  assert.match(TERMS_VERSION, /^\d{4}-\d{2}-\d{2}$/);
  const expected = new Date(`${TERMS_VERSION}T12:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  assert.equal(TERMS_EFFECTIVE, expected);
});
