import type { Account, SubscriptionStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { createNotification } from "./notifications";
import { appUrl, stripeConfigured } from "./env";
import { billingState, GRACE_DAYS } from "./billing-state";
import { syncRetellAgentQuietly } from "./agent-sync";
import { subscriptionActive } from "./billing-ui";
import {
  createCoupon,
  createPortalConfiguration,
  creditCustomerBalance,
  getCoupon,
  getPrice,
  getSubscription,
  idOf,
  invoiceSubscriptionId,
  isStripeNotFound,
  listPortalConfigurations,
  listSubscriptions,
  stripeErrorMessage,
  type StripeCheckoutSession,
  type StripeInvoice,
  type StripeSubscription,
  type StripeSubscriptionStatus,
  type StripeWebhookEvent,
} from "./stripe";
import {
  REFERRAL_CREDIT_CENTS,
  pendingCredits,
  qualifyReferral,
  reserveCreditsForCheckout,
  selectCreditsUpTo,
  settleBalanceCredit,
  settleCheckoutCredits,
  sumCents,
  type ReferralCredit,
} from "./referrals";

/**
 * Billing state lives in Stripe; the Account row mirrors just enough to gate the app
 * (status, period end, cancel-at-period-end, setup fee paid). Two things write that mirror:
 * the webhook (src/app/api/stripe/webhook) and the explicit "Refresh status" action. Reads never do.
 */

// ---------- Status mapping ----------

export function mapSubscriptionStatus(s: StripeSubscriptionStatus): SubscriptionStatus {
  switch (s) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
    case "unpaid":
    case "paused":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "cancelled";
    case "incomplete":
    default:
      return "none";
  }
}

/** Latest period end across the subscription's items (monthly plan → one item). */
export function periodEndOf(sub: StripeSubscription): Date | null {
  const ends = sub.items?.data?.map((i) => i.current_period_end).filter((n): n is number => typeof n === "number") ?? [];
  return ends.length ? new Date(Math.max(...ends) * 1000) : null;
}

// ---------- Writing Stripe state onto the account ----------

/**
 * Mirror a Stripe subscription onto the account. Idempotent. Events for an older subscription are ignored
 * once a newer one is attached (e.g. re-subscribing after a cancellation) unless they make it active.
 */
export async function applySubscription(accountId: string, sub: StripeSubscription): Promise<SubscriptionStatus> {
  const status = mapSubscriptionStatus(sub.status);
  const current = await prisma.account.findUnique({
    where: { id: accountId },
    select: { subscriptionStatus: true, stripeSubscriptionId: true, isInternal: true, paymentFailedAt: true, subscriptionEndedAt: true, onboardingStepId: true },
  });
  if (!current) return "none";
  const isOtherSubscription = !!current.stripeSubscriptionId && current.stripeSubscriptionId !== sub.id;
  if (isOtherSubscription && !subscriptionActive({ subscriptionStatus: status })) return current.subscriptionStatus;

  const now = new Date();
  const updated = await prisma.account.update({
    where: { id: accountId },
    data: {
      stripeCustomerId: idOf(sub.customer),
      stripeSubscriptionId: sub.id,
      subscriptionStatus: status,
      subscriptionCurrentPeriodEnd: periodEndOf(sub),
      subscriptionCancelAtPeriodEnd: !!sub.cancel_at_period_end,
      ...billingClocks(status, current, now),
    },
    select: { subscriptionStatus: true, isInternal: true, paymentFailedAt: true, subscriptionEndedAt: true, onboardingStepId: true },
  });

  // Crossing the paused boundary in either direction changes what the agent's prompt says it may
  // do (docs/frontdesk-billing-spec.md §2), and going active lifts the demo cap on its call length
  // (§5). Re-sync now rather than waiting for the sweep: an owner who just paid expects the next
  // call to book, and to run past three minutes, not the one after the next cron.
  const before = billingState(current, now);
  const after = billingState(updated, now);
  const pausedFlipped = (before === "paused") !== (after === "paused");
  const activeFlipped = subscriptionActive(current) !== subscriptionActive(updated);
  if (pausedFlipped || activeFlipped) await syncRetellAgentQuietly(accountId);
  return status;
}

/**
 * The enforcement clocks (docs/frontdesk-billing-spec.md §3), set here and nowhere else.
 *
 * `active` clears everything - that is the "reactivation inside the window keeps everything" rule,
 * and it is a single line so it cannot be half-applied. `past_due` starts grace once per lapse
 * (`??` keeps the first failure's date through Stripe's retries); `cancelled` starts reclamation.
 */
function billingClocks(status: SubscriptionStatus, current: Pick<Account, "paymentFailedAt" | "subscriptionEndedAt">, now: Date) {
  if (subscriptionActive({ subscriptionStatus: status })) {
    return { paymentFailedAt: null, billingPausedAt: null, subscriptionEndedAt: null, reclamationWarnedAt: null };
  }
  if (status === "past_due") return { paymentFailedAt: current.paymentFailedAt ?? now };
  if (status === "cancelled") return { subscriptionEndedAt: current.subscriptionEndedAt ?? now };
  return {};
}

/** Pull the current state from Stripe (explicit action — the "Refresh status" button). */
export async function refreshFromStripe(account: Pick<Account, "id" | "stripeCustomerId" | "stripeSubscriptionId">): Promise<SubscriptionStatus> {
  if (account.stripeSubscriptionId) {
    const sub = await getSubscription(account.stripeSubscriptionId);
    if (subscriptionActive({ subscriptionStatus: mapSubscriptionStatus(sub.status) })) return applySubscription(account.id, sub);
  }
  if (!account.stripeCustomerId) return "none";
  const { data } = await listSubscriptions(account.stripeCustomerId);
  if (data.length === 0) return "none";
  const rank = (s: StripeSubscription) => (subscriptionActive({ subscriptionStatus: mapSubscriptionStatus(s.status) }) ? 1 : 0);
  const best = [...data].sort((a, b) => rank(b) - rank(a) || b.created - a.created)[0];
  // Adopt whatever is best now (a re-subscribe supersedes the cancelled one we hold).
  await prisma.account.update({ where: { id: account.id }, data: { stripeSubscriptionId: best.id } });
  return applySubscription(account.id, best);
}

async function findAccountForStripe(customerId: string | null | undefined, metadataAccountId: string | undefined) {
  if (metadataAccountId) {
    const byId = await prisma.account.findUnique({ where: { id: metadataAccountId } });
    if (byId) return byId;
  }
  if (customerId) return prisma.account.findUnique({ where: { stripeCustomerId: customerId } });
  return null;
}

// ---------- Webhook events ----------

/**
 * Fulfil from events, never from the success page: the customer may close the tab before returning.
 * `checkout.session.completed` arrives while `payment_status` is still `unpaid` for delayed payment
 * methods, so activation waits for `async_payment_succeeded` in that case.
 */
export async function handleStripeEvent(event: StripeWebhookEvent): Promise<void> {
  const obj = event.data.object;
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = obj as StripeCheckoutSession;
      if (s.mode !== "subscription" || s.payment_status === "unpaid") return;
      const accountId = s.metadata?.accountId || s.client_reference_id;
      if (!accountId) return;
      const account = await prisma.account.findUnique({ where: { id: accountId } });
      if (!account) return;

      const customerId = idOf(s.customer);
      const data: { stripeCustomerId?: string; setupFeePaidAt?: Date } = {};
      if (customerId && account.stripeCustomerId !== customerId) data.stripeCustomerId = customerId;
      if (!account.setupFeePaidAt && s.metadata?.setupFee === "1") data.setupFeePaidAt = new Date();
      if (Object.keys(data).length) await prisma.account.update({ where: { id: accountId }, data });

      const before = account.subscriptionStatus;
      let after = before;
      const subscriptionId = idOf(s.subscription);
      if (subscriptionId) after = await applySubscription(accountId, await getSubscription(subscriptionId));
      if (!subscriptionActive({ subscriptionStatus: before }) && subscriptionActive({ subscriptionStatus: after })) {
        await createNotification({ accountId, type: "system", title: "Payment received", body: "Your FrontDesk AI subscription is active. Thanks for joining!" });
      }
      await settleReferrals(accountId, { couponId: idOf(s.discounts?.[0]?.coupon), checkoutSessionId: s.id, active: subscriptionActive({ subscriptionStatus: after }) });
      return;
    }

    case "checkout.session.async_payment_failed": {
      const s = obj as StripeCheckoutSession;
      const accountId = s.metadata?.accountId || s.client_reference_id;
      if (!accountId) return;
      await createNotification({ accountId, type: "system", priority: "urgent", title: "Payment didn't go through", body: "Your bank declined the subscription payment. Open Settings → Billing to try again." });
      return;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = obj as StripeSubscription;
      const account = await findAccountForStripe(idOf(sub.customer), sub.metadata?.accountId);
      if (!account) return;
      const before = account.subscriptionStatus;
      const after = await applySubscription(account.id, sub);
      if (before !== "cancelled" && after === "cancelled" && account.stripeSubscriptionId === sub.id) {
        await createNotification({ accountId: account.id, type: "system", title: "Subscription ended", body: "Your FrontDesk AI subscription has ended. Re-subscribe from Settings → Billing to keep the AI host answering." });
      }
      return;
    }

    case "invoice.paid": {
      const inv = obj as StripeInvoice;
      const subId = invoiceSubscriptionId(inv);
      if (!subId) return;
      const account = await findAccountForStripe(idOf(inv.customer), inv.metadata?.accountId);
      if (!account) return;
      const status = await applySubscription(account.id, await getSubscription(subId));
      await settleReferrals(account.id, { active: subscriptionActive({ subscriptionStatus: status }) });
      return;
    }

    case "invoice.payment_failed":
    case "invoice.payment_action_required": {
      const inv = obj as StripeInvoice;
      const subId = invoiceSubscriptionId(inv);
      if (!subId) return;
      const account = await findAccountForStripe(idOf(inv.customer), inv.metadata?.accountId);
      if (!account) return;
      await applySubscription(account.id, await getSubscription(subId));
      await createNotification({
        accountId: account.id,
        type: "system",
        priority: "urgent",
        title: event.type === "invoice.payment_failed" ? "Payment failed" : "Payment needs your attention",
        body: `We couldn't collect this month's subscription. ${account.hostName} keeps answering and booking as normal for ${GRACE_DAYS} days; after that, calls are taken as messages only. Update your card in Settings → Billing → Open billing portal.`,
      });
      return;
    }

    default:
      return; // Not subscribed to anything else; ignore quietly.
  }
}

// ---------- Customer Portal ----------

const CACHE_TTL_MS = 5 * 60_000;
let portalConfigCache: { at: number; id: string | null } | null = null;

/** /terms promises that cancelling keeps the service through the paid period. That promise lives
 *  here, not in the Stripe Dashboard: only a portal configuration that cancels at period end is
 *  ever offered to a customer. */
const cancelsAtPeriodEnd = (c: { features?: { subscription_cancel?: { enabled?: boolean; mode?: string } } }) =>
  c.features?.subscription_cancel?.enabled === true && c.features?.subscription_cancel?.mode === "at_period_end";

/**
 * The portal configuration to open: the Dashboard default when it already cancels at period end,
 * else any active configuration that does — and when none does (someone edited the Dashboard, or a
 * fresh mode has no configuration yet), one of our own is created with the terms pinned into it.
 */
export async function resolvePortalConfiguration(): Promise<string | undefined> {
  if (portalConfigCache && Date.now() - portalConfigCache.at < CACHE_TTL_MS) return portalConfigCache.id ?? undefined;
  const configs = (await listPortalConfigurations({ active: true, limit: 10 })).data;
  let chosen = configs.find((c) => c.is_default && cancelsAtPeriodEnd(c)) ?? configs.find(cancelsAtPeriodEnd) ?? null;
  if (!chosen) {
    chosen = await createPortalConfiguration({
      business_profile: { privacy_policy_url: `${appUrl()}/privacy`, terms_of_service_url: `${appUrl()}/terms` },
      features: {
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        subscription_cancel: { enabled: true, mode: "at_period_end" },
      },
      metadata: { frontdesk: "portal-terms-v1" },
    });
    console.warn(`[billing] no at-period-end portal configuration existed; created ${chosen.id}`);
  }
  portalConfigCache = { at: Date.now(), id: chosen.id };
  return chosen.id;
}

// ---------- Plan display ----------

export type PlanPrice = { id: string; amount: number; currency: string; interval: string | null };
export type PlanPrices = { setupFee: PlanPrice | null; monthly: PlanPrice | null };

let priceCache: { at: number; value: PlanPrices } | null = null;
const PRICE_TTL_MS = CACHE_TTL_MS;

/** The two configured prices, for the plan card. Cached briefly; null when Stripe isn't reachable. */
export async function getPlanPrices(): Promise<PlanPrices | null> {
  if (!stripeConfigured()) return null;
  if (priceCache && Date.now() - priceCache.at < PRICE_TTL_MS) return priceCache.value;
  const load = async (id: string | undefined): Promise<PlanPrice | null> => {
    if (!id) return null;
    const p = await getPrice(id);
    return p.unit_amount == null ? null : { id: p.id, amount: p.unit_amount, currency: p.currency, interval: p.recurring?.interval ?? null };
  };
  try {
    const [setupFee, monthly] = await Promise.all([load(process.env.STRIPE_PRICE_SETUP_FEE), load(process.env.STRIPE_PRICE_MONTHLY)]);
    priceCache = { at: Date.now(), value: { setupFee, monthly } };
    return priceCache.value;
  } catch (e) {
    console.error("[billing] could not load prices:", e instanceof Error ? e.message : e);
    return null;
  }
}

// ---------- Referral credit ----------

/**
 * Turning referral credit into money. The ledger (src/lib/referrals.ts) decides who is owed what;
 * everything here decides how Stripe is told, and there are exactly two ways:
 *
 *   A one-off COUPON on the Checkout Session, for an account that has not subscribed yet. Chosen
 *   over a customer balance credit — which Stripe would also apply — because a coupon shows up as a
 *   line on Stripe's own checkout page. "$100 off your first month" that the customer cannot see
 *   until the receipt arrives is not the offer we made.
 *
 *   A CUSTOMER BALANCE credit, for an account that already has a subscription. Stripe applies it to
 *   the next invoice it finalizes, up to that invoice's total, and carries the remainder forward —
 *   which is exactly "$100 off your next month", with no coupon to expire and nothing to redeem.
 */

/**
 * The most a Checkout coupon should be worth: what the first invoice can actually absorb. A coupon
 * discounts one invoice and throws away the rest, so anything above this stays in the ledger and
 * goes onto the invoice balance later instead, where it carries over.
 *
 * If the prices can't be read, one credit — the advertised offer, and never more than a real invoice.
 */
async function checkoutDiscountCapCents(chargeSetupFee: boolean): Promise<number> {
  const prices = await getPlanPrices();
  if (!prices?.monthly) return REFERRAL_CREDIT_CENTS;
  return prices.monthly.amount + (chargeSetupFee ? (prices.setupFee?.amount ?? 0) : 0);
}

/**
 * Mint (or reuse) the coupon for whatever this account is owed, and tie the credits to it.
 *
 * Reuse matters more than it looks. Someone who opens Checkout, wanders off, and comes back gets a
 * second session; if that session carried a SECOND coupon for the same credits, the first coupon
 * would still be redeemable by the still-open first session, and only one of the two could ever be
 * settled against the ledger. One coupon per set of credits keeps the accounting exact.
 *
 * Returns null when nothing is owed — the caller then falls back to promotion codes.
 */
export async function reserveReferralDiscount(accountId: string, chargeSetupFee: boolean): Promise<{ couponId: string; amountCents: number } | null> {
  const owed = await pendingCredits(accountId);
  if (owed.length === 0) return null;

  // One currency per checkout (the plan is USD-only; this is belt and braces, not a feature).
  const currency = owed[0].currency;
  const credits = selectCreditsUpTo(owed.filter((c) => c.currency === currency), await checkoutDiscountCapCents(chargeSetupFee));
  if (credits.length === 0) return null;
  const amountCents = sumCents(credits);

  const existing = credits[0].stripeCouponId;
  if (existing && credits.every((c) => c.stripeCouponId === existing)) {
    const coupon = await getCoupon(existing).catch((e) => {
      if (isStripeNotFound(e)) return null;
      throw e;
    });
    if (coupon && !coupon.deleted && coupon.valid && coupon.amount_off === amountCents && coupon.currency === currency) {
      return { couponId: existing, amountCents };
    }
  }

  const coupon = await createCoupon({
    amountOffCents: amountCents,
    currency,
    name: `Referral credit (${credits.length} x $${(REFERRAL_CREDIT_CENTS / 100).toFixed(0)})`,
    metadata: { accountId, referralCreditIds: credits.map((c) => c.id).join(",") },
    // Two days. A Checkout Session expires after 24 hours, so this outlives any session that could
    // still redeem it and then stops being a loose end: an unredeemed coupon going invalid is what
    // releases its credits back to the invoice-balance path below.
    redeemByEpoch: Math.floor(Date.now() / 1000) + 2 * 24 * 60 * 60,
  });
  await reserveCreditsForCheckout(credits.map((c) => c.id), coupon.id);
  return { couponId: coupon.id, amountCents };
}

/**
 * Whether a credit is still spoken for by a checkout that might yet complete.
 *
 * A reserved credit must not also be pushed onto the invoice balance, or an account gets the same
 * $100 twice. Stripe is the authority on that, not us: the coupon is single-use, so once it has been
 * redeemed or its `redeem_by` has passed, `valid` is false and the credit is free again.
 */
async function heldByLiveCoupon(credit: ReferralCredit): Promise<boolean> {
  if (!credit.stripeCouponId) return false;
  try {
    const coupon = await getCoupon(credit.stripeCouponId);
    return !coupon.deleted && coupon.valid;
  } catch (e) {
    if (isStripeNotFound(e)) return false;
    throw e; // an unreadable coupon is not a licence to spend the credit twice
  }
}

/**
 * Push everything this account is owed onto its Stripe invoice balance.
 *
 * Only for an account that already has a subscription: without one there is no invoice coming, and
 * the credit is better spent as the coupon on their own checkout, where they can see it.
 * Returns the total credited, in cents.
 */
export async function applyPendingCreditsToBalance(accountId: string): Promise<number> {
  const account = await prisma.account.findUnique({ where: { id: accountId }, select: { stripeCustomerId: true, subscriptionStatus: true } });
  if (!account?.stripeCustomerId || !subscriptionActive(account)) return 0;

  let applied = 0;
  for (const credit of await pendingCredits(accountId)) {
    try {
      if (await heldByLiveCoupon(credit)) continue;
      const txn = await creditCustomerBalance(account.stripeCustomerId, {
        amountCents: credit.amountCents,
        currency: credit.currency,
        description: "FrontDesk AI referral credit",
        metadata: { accountId, referralCreditId: credit.id },
        // The row id, so a redelivered webhook re-sends the same request instead of a second credit.
        idempotencyKey: `referral-credit-${credit.id}`,
      });
      await settleBalanceCredit(credit.id, txn.id);
      applied += credit.amountCents;
    } catch (e) {
      // Leave it pending rather than losing it: the next activation, invoice or "Refresh status"
      // tries again, and the idempotency key makes a retry safe.
      console.error(`[referrals] could not credit ${credit.id}:`, stripeErrorMessage(e));
      break;
    }
  }
  return applied;
}

/**
 * Everything that has to happen to the referral ledger when an account's money moves.
 *
 * Order is not arbitrary: the coupon this checkout carried has to be marked spent BEFORE the sweep
 * onto the invoice balance, or the same credit leaves twice.
 */
export async function settleReferrals(accountId: string, opts: { couponId?: string | null; checkoutSessionId?: string; active: boolean }): Promise<void> {
  if (opts.couponId && opts.checkoutSessionId) await settleCheckoutCredits(accountId, opts.couponId, opts.checkoutSessionId);
  if (!opts.active) return;
  await applyPendingCreditsToBalance(accountId);
  // This account has now paid, which is the moment the referrer earns their half.
  const qualified = await qualifyReferral(accountId);
  if (qualified) await applyPendingCreditsToBalance(qualified.referrerAccountId);
}
