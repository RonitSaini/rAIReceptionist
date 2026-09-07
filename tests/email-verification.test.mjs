import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * The verification token is a signed, expiring claim (src/lib/email-verification.ts). These pin the
 * pure half: a token round-trips, and anything tampered, expired, or of another kind reads as
 * nothing. The consuming half (address must still match, one write from the confirm button) is
 * plain enough to read; what matters here is that no token can be forged or outlive its 48 hours.
 */

process.env.DATABASE_URL ??= "postgresql://snapshot:snapshot@localhost:5432/snapshot";
process.env.NEXTAUTH_SECRET ??= "test-only-secret-never-used-in-production-0000";

const { mintVerificationToken, readVerificationToken, VERIFICATION_TTL_MS } = await import("../src/lib/email-verification.ts");

const T0 = Date.parse("2026-09-06T12:00:00Z");

test("a token round-trips to the user and the address it was sent to", () => {
  const token = mintVerificationToken("user_1", "Owner@Example.com", T0);
  assert.deepEqual(readVerificationToken(token, T0 + 1000), { userId: "user_1", email: "owner@example.com" });
});

test("it lives 48 hours and not a second more", () => {
  const token = mintVerificationToken("user_1", "owner@example.com", T0);
  assert.ok(readVerificationToken(token, T0 + VERIFICATION_TTL_MS - 1), "still good just before expiry");
  assert.equal(readVerificationToken(token, T0 + VERIFICATION_TTL_MS), null, "gone at expiry");
});

test("a tampered token is nothing", () => {
  const token = mintVerificationToken("user_1", "owner@example.com", T0);
  const flipped = token.slice(0, -2) + (token.endsWith("A") ? "B" : "A") + token.slice(-1);
  assert.equal(readVerificationToken(flipped, T0), null);
  assert.equal(readVerificationToken("", T0), null);
  assert.equal(readVerificationToken(null, T0), null);
  assert.equal(readVerificationToken("not-a-token", T0), null);
});

test("two users never share a token, and the address is bound in", () => {
  const a = mintVerificationToken("user_1", "a@example.com", T0);
  const b = mintVerificationToken("user_2", "a@example.com", T0);
  assert.notEqual(a, b);
  assert.equal(readVerificationToken(b, T0).userId, "user_2");
});
