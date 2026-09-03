import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * Referral codes and the credit arithmetic behind them.
 *
 * Everything here is a pure function, imported from the real module — the parts that touch Prisma
 * or Stripe are exercised by using the app. What is pinned here is the two things that quietly
 * cost money if they drift: what counts as a code someone typed, and how many whole $100 credits
 * may ride on one Checkout coupon.
 */

const { REFERRAL_CREDIT_CENTS, isReferralCodeShape, normalizeReferralCode, selectCreditsUpTo, sumCents } = await import("../src/lib/referrals.ts");

const CODE = "K7QM2XPD";

test("a code is read out of whatever the user pasted", () => {
  assert.equal(normalizeReferralCode(CODE), CODE);
  assert.equal(normalizeReferralCode("k7qm2xpd"), CODE);
  assert.equal(normalizeReferralCode("  K7QM-2XPD  "), CODE);
  assert.equal(normalizeReferralCode("K7QM 2XPD"), CODE);
  // The invite link is what actually gets pasted into the box, so it has to work.
  assert.equal(normalizeReferralCode(`https://www.frontdeskai.dev/signup?ref=${CODE}`), CODE);
  assert.equal(normalizeReferralCode(`https://www.frontdeskai.dev/signup?x=1&ref=${CODE}&y=2`), CODE);
  assert.equal(normalizeReferralCode(""), "");
});

test("the alphabet excludes the characters people mistype", () => {
  assert.ok(isReferralCodeShape(CODE));
  // O/0, I/1 and L are never issued, so a code containing one was misread or invented.
  for (const bad of ["K7QM2XPO", "K7QM2XP0", "K7QM2XPI", "K7QM2XP1", "K7QM2XPL"]) {
    assert.equal(isReferralCodeShape(bad), false, bad);
  }
  assert.equal(isReferralCodeShape("K7QM2XP"), false, "too short");
  assert.equal(isReferralCodeShape("K7QM2XPDD"), false, "too long");
  assert.equal(isReferralCodeShape(""), false);
});

// $150 setup + $300 monthly, the plan as priced in Stripe today.
const FIRST_INVOICE_CENTS = 45_000;
const credits = (n) => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, amountCents: REFERRAL_CREDIT_CENTS }));

test("a checkout coupon carries only what the first invoice can absorb", () => {
  // Four credits is $400 against a $450 invoice: all four fit.
  assert.equal(sumCents(selectCreditsUpTo(credits(4), FIRST_INVOICE_CENTS)), 40_000);
  // Six is $600. Only four fit; the other two stay owed and go on the invoice balance later, where
  // Stripe carries the remainder forward instead of throwing it away.
  const chosen = selectCreditsUpTo(credits(6), FIRST_INVOICE_CENTS);
  assert.equal(chosen.length, 4);
  assert.ok(sumCents(chosen) <= FIRST_INVOICE_CENTS);
  // Order matters: the oldest credits are the ones spent.
  assert.deepEqual(chosen.map((c) => c.id), ["c0", "c1", "c2", "c3"]);
});

test("whole credits only, and never more than the cap", () => {
  // A monthly-only invoice ($300) takes three.
  assert.equal(selectCreditsUpTo(credits(5), 30_000).length, 3);
  // A cap below one credit takes none rather than a partial one.
  assert.equal(selectCreditsUpTo(credits(3), 9_999).length, 0);
  assert.equal(selectCreditsUpTo([], FIRST_INVOICE_CENTS).length, 0);
  // Exactly one credit's worth of room takes exactly one.
  assert.equal(selectCreditsUpTo(credits(3), REFERRAL_CREDIT_CENTS).length, 1);
});

test("the offer is $100", () => {
  assert.equal(REFERRAL_CREDIT_CENTS, 10_000);
});
