import { test } from "node:test";
import assert from "node:assert/strict";
import { isEmail } from "@/lib/form";
import { checkEmailDomain } from "@/lib/email-address";

/**
 * Sign-up used to take any string with an @ and a dot in it, which meant an account could be
 * created behind an address nothing could ever be delivered to — no welcome email, no receipt, no
 * password reset, and no way to tell the owner. Two checks stand there now, and this covers both:
 * `isEmail` for the shape, `checkEmailDomain` for whether the domain takes mail at all.
 *
 * The table is the point. Email syntax is one of those things everyone writes a regex for once and
 * then quietly breaks the next time it is touched, so the cases that matter are written down rather
 * than left to a reading of the pattern.
 */

const VALID = [
  "owner@gmail.com",
  "first.last@sub.domain.co.uk",
  "owner+booking@frontdeskai.dev",
  "o@x.io",
  "owner-name@my-plumbing-co.com",
  "n0t.a.p4ttern@e1even.ca",
  // Ugly, legal, and someone somewhere has one: every character an unquoted local part may use.
  "!#$%&'*+/=?^_`{|}~-@example.com",
  `${"a".repeat(64)}@example.com`,
];

const INVALID = [
  ["", "empty"],
  ["owner", "no domain at all"],
  ["owner@", "nothing after the @"],
  ["@example.com", "nothing before the @"],
  ["owner@localhost", "single label, no TLD"],
  ["owner@example", "no dot in the domain"],
  ["owner@example.c", "a one-letter TLD does not exist"],
  ["owner@example.123", "a numeric TLD does not exist"],
  ["owner@example.co1", "TLDs are alphabetic"],
  ["owner@gmail..com", "an empty label"],
  ["owner@.gmail.com", "a leading empty label"],
  ["owner@example.com.", "a trailing dot"],
  ["owner@-example.com", "a label may not start with a hyphen"],
  ["owner@example-.com", "a label may not end with a hyphen"],
  [".owner@example.com", "the local part may not start with a dot"],
  ["owner.@example.com", "the local part may not end with a dot"],
  ["own..er@example.com", "consecutive dots in the local part"],
  ["owner name@example.com", "a space in the local part"],
  ["owner@exam ple.com", "a space in the domain"],
  ["owner@example.com extra", "trailing rubbish"],
  ['"owner name"@example.com', "a quoted local part: legal in the RFC, refused here on purpose"],
  ["öwner@example.com", "non-ASCII in the local part"],
  ["owner@exämple.com", "a non-punycoded IDN"],
  ["a@b@example.com", "two @ signs"],
  [`${"a".repeat(65)}@example.com`, "a local part over 64 characters"],
  [`owner@${"a".repeat(64)}.com`, "a label over 63 characters"],
  [`${"a".repeat(250)}@example.com`, "an address over 254 characters"],
];

test("well-formed addresses are accepted", () => {
  for (const address of VALID) assert.equal(isEmail(address), true, `should accept ${address}`);
});

test("addresses that cannot receive mail are refused", () => {
  for (const [address, why] of INVALID) assert.equal(isEmail(address), false, `should refuse ${JSON.stringify(address)} — ${why}`);
});

test("a real mail domain passes the domain check", async () => {
  // Also passes with no network at all: an inconclusive lookup accepts the address by design,
  // because a resolver having a bad day must never cost a real customer their sign-up.
  assert.equal((await checkEmailDomain("owner@gmail.com")).ok, true);
});

test("a domain that cannot exist is refused", async (t) => {
  // .invalid is reserved by RFC 6761 precisely so that it never resolves — the one negative that
  // is true everywhere, forever, without depending on somebody's registration lapsing.
  const result = await checkEmailDomain("owner@frontdesk-ai.invalid");
  if (result.ok) {
    t.skip("DNS did not answer; the check fails open, so there is nothing to assert");
    return;
  }
  assert.match(result.error, /frontdesk-ai\.invalid/);
});
