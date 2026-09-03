import type { ReferralCredit } from "@prisma/client";
import { prisma } from "./prisma";
import { createNotification } from "./notifications";
import { appUrl } from "./env";
import { subscriptionActive } from "./billing-ui";

/**
 * Referrals: one code per account, and the ledger of what each side is owed.
 *
 * The offer, in full: an account claims someone else's code BEFORE it has ever paid, and then both
 * sides get $100 off — the claimer off their first month, the referrer off their next one. Two
 * halves of that sentence do real work here:
 *
 *   "before paying" is why the claim is refused once an account has an active subscription or has
 *   ever paid the setup fee. It is the offer as stated, and it is also the only version that can be
 *   checked honestly at claim time.
 *
 *   "both" does NOT mean both at the same moment. The claimer's discount is real as soon as they
 *   check out, because they are the one paying. The referrer is owed nothing until that payment
 *   clears (`qualifiedAt`) — otherwise ten throwaway sign-ups claiming one code would mint a
 *   thousand dollars of credit against nothing.
 *
 * This module is deliberately Prisma-only. Turning a credit into money is Stripe's job and lives in
 * billing.ts; what lives here is who is owed what, and whether it has been spent yet.
 */

/** $100, in cents. Stored per credit row so changing the offer never rewrites what was promised. */
export const REFERRAL_CREDIT_CENTS = 10_000;

/**
 * The most referrer credits one account can ever earn — $1,200 lifetime. Insurance against fraud
 * rings and pricing mistakes, sized so no honest owner ever meets it; the cap is on EARNING only,
 * so the thirteenth business to use a code still gets its own discount in full.
 */
export const REFERRAL_CAP = 12;

/** No O, I, L, 0 or 1: these get read down a phone line and written on the back of a card. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;
const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// ---------- The code ----------

function randomCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return out;
}

/**
 * What someone typed, turned into a code. Accepts the whole share link as well as the code itself,
 * because that is what people paste; strips spaces, dashes and punctuation for the same reason.
 */
export function normalizeReferralCode(input: string): string {
  const fromLink = /[?&]ref=([^&\s]+)/i.exec(input)?.[1] ?? input;
  return fromLink.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 32);
}

export function isReferralCodeShape(code: string): boolean {
  return CODE_PATTERN.test(code);
}

/** The link that puts a code in front of someone: it prefills sign-up and survives to the claim. */
export function referralShareUrl(code: string): string {
  return `${appUrl()}/signup?ref=${code}`;
}

/**
 * A code no account holds yet.
 *
 * The candidate is checked before it is used rather than relying on the unique index to reject it,
 * because this runs inside the sign-up transaction: a unique violation there would abort the whole
 * transaction and cost someone their account over a one-in-a-trillion draw. Eight characters from a
 * 31-letter alphabet is 8.5e11 codes, so the loop effectively never runs twice.
 */
export async function issueReferralCode(client: TxClient | typeof prisma = prisma): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = randomCode();
    const taken = await client.account.findUnique({ where: { referralCode: candidate }, select: { id: true } });
    if (!taken) return candidate;
  }
  throw new Error("Could not generate an unused referral code after 5 attempts.");
}

// ---------- Claiming ----------

export type ClaimResult = { ok: true; code: string; creditCents: number } | { ok: false; error: string };

/** `code: null` means the field was left blank, which is fine — the code is optional. */
export type CodeCheck = { ok: true; code: string | null } | { ok: false; error: string };

const NOT_FOUND = "We don't recognize that referral code. Check it with whoever sent it to you.";

/**
 * Is this a code someone could actually claim? Asked at SIGN-UP, before an account exists.
 *
 * The sign-up box needs an answer before the account is created, because the alternatives are both
 * bad: refusing afterwards means throwing away an account someone just filled in a form for, and
 * accepting silently means a code a person deliberately typed disappears without a word. So the
 * shape and the existence are checked up front and reported like any other field error.
 *
 * The claim itself still goes through claimReferralCode once the account exists — the rules that
 * need an account (already claimed, your own code, already paid) can only be checked there, and
 * none of them can be true of an account created a moment ago.
 */
export async function checkReferralCodeAvailable(rawCode: string): Promise<CodeCheck> {
  const code = normalizeReferralCode(rawCode);
  if (!code) return { ok: true, code: null };
  if (!isReferralCodeShape(code)) return { ok: false, error: NOT_FOUND };
  const referrer = await prisma.account.findUnique({ where: { referralCode: code }, select: { id: true } });
  return referrer ? { ok: true, code } : { ok: false, error: NOT_FOUND };
}

/**
 * Record one account claiming another's code, and open the credit the claimer is owed.
 *
 * Every refusal below is also a real constraint in the database — the unique index on
 * `referredAccountId` is what actually stops a second claim, not the check in front of it — so a
 * double-submit or a hand-crafted POST lands in the same place a polite user does.
 */
export async function claimReferralCode(accountId: string, rawCode: string): Promise<ClaimResult> {
  const code = normalizeReferralCode(rawCode);
  if (!code) return { ok: false, error: "Enter the referral code you were given." };
  if (!isReferralCodeShape(code)) return { ok: false, error: NOT_FOUND };

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { referralCode: true, subscriptionStatus: true, setupFeePaidAt: true, referralClaimed: { select: { code: true } } },
  });
  if (!account) return { ok: false, error: "Please log in again." };

  if (account.referralClaimed) {
    return account.referralClaimed.code === code
      ? { ok: true, code, creditCents: REFERRAL_CREDIT_CENTS }
      : { ok: false, error: `You've already applied the code ${account.referralClaimed.code}. Only one referral code can be used per account.` };
  }
  if (account.referralCode === code) return { ok: false, error: "That's your own code — send it to someone else and you both get the credit." };
  // The offer is "claim it before you pay". An account that has already paid has had its first
  // month, so there is no first month left to discount.
  if (subscriptionActive(account) || account.setupFeePaidAt) {
    return { ok: false, error: "Referral codes can only be applied before your first payment." };
  }

  const referrer = await prisma.account.findUnique({ where: { referralCode: code }, select: { id: true } });
  if (!referrer) return { ok: false, error: NOT_FOUND };
  if (referrer.id === accountId) return { ok: false, error: "That's your own code — send it to someone else and you both get the credit." };

  try {
    await prisma.referral.create({
      data: {
        code,
        referrerAccountId: referrer.id,
        referredAccountId: accountId,
        // The claimer's half opens now: they are the one about to pay, and this is what comes off
        // the invoice when they do. The referrer's half waits for that payment (qualifyReferral).
        credits: { create: { accountId, side: "referred", amountCents: REFERRAL_CREDIT_CENTS } },
      },
    });
  } catch (e) {
    // A concurrent claim won the unique index. Their row stands; report it the same way.
    if (typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002") {
      return { ok: false, error: "A referral code has already been applied to this account." };
    }
    throw e;
  }

  return { ok: true, code, creditCents: REFERRAL_CREDIT_CENTS };
}

/**
 * Best-effort claim for the sign-up link (`/signup?ref=CODE`). A bad or self-referring code must
 * never cost someone their account, so this swallows the refusal — the explicit form on the payment
 * step is where a person gets told why a code didn't work.
 */
export async function claimReferralCodeQuietly(accountId: string, rawCode: string): Promise<void> {
  try {
    const result = await claimReferralCode(accountId, rawCode);
    if (!result.ok) console.warn(`[referrals] sign-up link code rejected for ${accountId}: ${result.error}`);
  } catch (e) {
    console.error("[referrals] sign-up link claim failed:", e instanceof Error ? e.message : e);
  }
}

// ---------- Qualifying: the referrer's half ----------

/**
 * The referred account's first payment cleared, so the referrer has earned their credit.
 *
 * Idempotent twice over, because Stripe redelivers webhooks and because both `checkout.session.completed`
 * and `invoice.paid` call it: the `updateMany` on a null `qualifiedAt` is what makes only one caller
 * the winner, and the unique index on (referralId, side) is what makes the credit itself unrepeatable.
 *
 * Returns the referrer's account id when a credit was just opened, so the caller can push it to
 * Stripe; null when there was nothing to do.
 */
export async function qualifyReferral(referredAccountId: string): Promise<{ referrerAccountId: string } | null> {
  const referral = await prisma.referral.findUnique({ where: { referredAccountId } });
  if (!referral || referral.qualifiedAt) return null;

  const claimed = await prisma.referral.updateMany({ where: { id: referral.id, qualifiedAt: null }, data: { qualifiedAt: new Date() } });
  if (claimed.count === 0) return null; // a concurrent delivery got there first

  // The referrer may have closed their account since (the FK is SetNull for exactly this reason).
  // The referral still qualified — the claimer keeps their discount — but there is nobody to pay.
  if (!referral.referrerAccountId) return null;

  // The cap. Counted at minting time rather than enforced at claim time, because the claimer's
  // half of the offer should never be hostage to how many referrals the code already earned. Two
  // first payments clearing in the same instant could in principle both read 11 and mint a 12th
  // and 13th — a $100 rounding error at a once-in-the-program's-life corner, not worth a lock.
  const earned = await prisma.referralCredit.count({ where: { accountId: referral.referrerAccountId, side: "referrer" } });
  if (earned >= REFERRAL_CAP) {
    await createNotification({
      accountId: referral.referrerAccountId,
      type: "system",
      title: "Your referral code was used again",
      body: `A business signed up with your code ${referral.code} and paid their first invoice — but you've reached the ${REFERRAL_CAP}-referral credit limit, so no new credit was added. Their own discount still applied.`,
    });
    return null;
  }

  try {
    await prisma.referralCredit.create({
      data: { accountId: referral.referrerAccountId, referralId: referral.id, side: "referrer", amountCents: REFERRAL_CREDIT_CENTS },
    });
  } catch (e) {
    if (typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002") return null;
    throw e;
  }

  await createNotification({
    accountId: referral.referrerAccountId,
    type: "system",
    title: "You earned $100 of referral credit",
    body: `A business signed up with your referral code ${referral.code} and paid their first invoice. Your $100 comes off your next bill.`,
  });

  return { referrerAccountId: referral.referrerAccountId };
}

// ---------- The ledger ----------

/** Everything this account is still owed, oldest first — the order it should be spent in. */
export function pendingCredits(accountId: string) {
  return prisma.referralCredit.findMany({ where: { accountId, appliedAt: null }, orderBy: { createdAt: "asc" } });
}

/**
 * As many whole credits as fit under `capCents`, in order.
 *
 * The cap exists because the two ways a credit can be spent are not equally forgiving. A customer
 * balance credit carries over to the invoice after next; a Checkout coupon does not — anything it
 * discounts past the invoice total is simply gone. So a checkout only ever carries what that first
 * invoice can absorb, and the rest stays in the ledger.
 *
 * Whole credits only: half a credit would have to be split across two rows, and a row is the record
 * of one referral. Pure and exported so `tests/referrals.test.mjs` can pin the arithmetic.
 */
export function selectCreditsUpTo<T extends { amountCents: number }>(credits: readonly T[], capCents: number): T[] {
  const chosen: T[] = [];
  let total = 0;
  for (const credit of credits) {
    if (total + credit.amountCents > capCents) continue;
    chosen.push(credit);
    total += credit.amountCents;
  }
  return chosen;
}

export function sumCents(credits: readonly { amountCents: number }[]): number {
  return credits.reduce((total, c) => total + c.amountCents, 0);
}

/**
 * Attach a minted coupon to the credits it stands for, before the Checkout Session is created.
 *
 * `appliedAt` is deliberately NOT set here: a checkout can be abandoned, and a credit written off
 * against a session nobody completed is a credit stolen from a customer. The webhook settles it.
 */
export function reserveCreditsForCheckout(creditIds: string[], couponId: string) {
  return prisma.referralCredit.updateMany({ where: { id: { in: creditIds } }, data: { stripeCouponId: couponId } });
}

/** The session that carried `couponId` completed, so the credits behind it are spent. */
export function settleCheckoutCredits(accountId: string, couponId: string, checkoutSessionId: string) {
  return prisma.referralCredit.updateMany({
    where: { accountId, appliedAt: null, stripeCouponId: couponId },
    data: { appliedAt: new Date(), stripeCheckoutSessionId: checkoutSessionId },
  });
}

/** A credit spent the other way: straight onto the Stripe customer's invoice balance. */
export function settleBalanceCredit(creditId: string, balanceTransactionId: string) {
  return prisma.referralCredit.update({
    where: { id: creditId },
    // The coupon fields are cleared because this credit did NOT leave as a coupon. A stale coupon id
    // from an abandoned checkout would otherwise sit here reading like a second application.
    data: { appliedAt: new Date(), stripeBalanceTransactionId: balanceTransactionId, stripeCouponId: null, stripeCheckoutSessionId: null },
  });
}

// ---------- What the Billing tab shows ----------

export type ReferralSummary = {
  code: string | null;
  /** Accounts that claimed this code and have since paid — the ones that earned anything. */
  qualified: number;
  /** Accounts that claimed it but haven't paid yet. Shown so the number isn't silently missing. */
  awaitingFirstPayment: number;
  /** Owed but not yet taken off anything, in cents. */
  pendingCents: number;
  /** Already taken off an invoice, in cents. */
  appliedCents: number;
  /** The code this account itself claimed, if any. */
  claimedCode: string | null;
  /** Whether that claim has been honored yet — false until they check out. */
  claimedCreditApplied: boolean;
};

export async function referralSummary(accountId: string): Promise<ReferralSummary> {
  const [account, given, credits] = await Promise.all([
    prisma.account.findUnique({ where: { id: accountId }, select: { referralCode: true } }),
    prisma.referral.findMany({ where: { referrerAccountId: accountId }, select: { qualifiedAt: true } }),
    prisma.referralCredit.findMany({ where: { accountId }, select: { amountCents: true, appliedAt: true, side: true } }),
  ]);
  const claimed = await prisma.referral.findUnique({ where: { referredAccountId: accountId }, select: { code: true } });

  const spent = (rows: typeof credits, applied: boolean) => sumCents(rows.filter((c) => !!c.appliedAt === applied));
  return {
    code: account?.referralCode ?? null,
    qualified: given.filter((r) => r.qualifiedAt).length,
    awaitingFirstPayment: given.filter((r) => !r.qualifiedAt).length,
    pendingCents: spent(credits, false),
    appliedCents: spent(credits, true),
    claimedCode: claimed?.code ?? null,
    claimedCreditApplied: credits.some((c) => c.side === "referred" && !!c.appliedAt),
  };
}

export type { ReferralCredit };
