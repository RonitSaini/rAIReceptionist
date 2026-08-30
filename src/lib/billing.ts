import type { Account, SubscriptionStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { createNotification } from "./notifications";
import { billingRequired, stripeConfigured } from "./env";
import { subscriptionActive } from "./billing-ui";
import {
  getPrice,
  getSubscription,
  idOf,
  invoiceSubscriptionId,
  listPortalConfigurations,
  listSubscriptions,
  type StripeCheckoutSession,
  type StripeInvoice,
  type StripeSubscription,
  type StripeSubscriptionStatus,
  type StripeWebhookEvent,
} from "./stripe";

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

/** Whether the AI host may answer calls for this account. Billing is only enforced when BILLING_REQUIRED=true. */
export function canTakeCalls(a: Pick<Account, "subscriptionStatus">): boolean {
  return !billingRequired() || subscriptionActive(a);
}

// ---------- Writing Stripe state onto the account ----------

/**
 * Mirror a Stripe subscription onto the account. Idempotent. Events for an older subscription are ignored
 * once a newer one is attached (e.g. re-subscribing after a cancellation) unless they make it active.
 */
export async function applySubscription(accountId: string, sub: StripeSubscription): Promise<SubscriptionStatus> {
  const status = mapSubscriptionStatus(sub.status);
  const current = await prisma.account.findUnique({ where: { id: accountId }, select: { subscriptionStatus: true, stripeSubscriptionId: true } });
  if (!current) return "none";
  const isOtherSubscription = !!current.stripeSubscriptionId && current.stripeSubscriptionId !== sub.id;
  if (isOtherSubscription && !subscriptionActive({ subscriptionStatus: status })) return current.subscriptionStatus;

  await prisma.account.update({
    where: { id: accountId },
    data: {
      stripeCustomerId: idOf(sub.customer),
      stripeSubscriptionId: sub.id,
      subscriptionStatus: status,
      subscriptionCurrentPeriodEnd: periodEndOf(sub),
      subscriptionCancelAtPeriodEnd: !!sub.cancel_at_period_end,
    },
  });
  return status;
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
      await applySubscription(account.id, await getSubscription(subId));
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
        body: "We couldn't collect this month's subscription. Update your card in Settings → Billing → Open billing portal to keep the AI host answering.",
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

/** The portal configuration to open: the Dashboard default if there is one, else the first active one. */
export async function resolvePortalConfiguration(): Promise<string | undefined> {
  if (portalConfigCache && Date.now() - portalConfigCache.at < CACHE_TTL_MS) return portalConfigCache.id ?? undefined;
  let id = (await listPortalConfigurations({ is_default: true, active: true, limit: 1 })).data[0]?.id ?? null;
  if (!id) id = (await listPortalConfigurations({ active: true, limit: 1 })).data[0]?.id ?? null;
  portalConfigCache = { at: Date.now(), id };
  return id ?? undefined;
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
