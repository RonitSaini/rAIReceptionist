import Stripe from "stripe";

/**
 * Stripe client — the official SDK, one instance per key.
 *
 * Everything the app needs is a handful of calls: Customers, Checkout Sessions, Subscriptions,
 * Invoices, Prices, the Customer Portal and webhook signature checks. The SDK owns the parts that
 * must not be artisanal — signature verification, API-version pinning, typed errors, retries.
 *
 * Server-only. Never import from a client component; never log the key or raw headers.
 */

/** Pinned to the SDK's own version so the types and the wire format agree. Bump both together. */
export const STRIPE_API_VERSION: Stripe.LatestApiVersion = "2026-08-26.dahlia";

/**
 * The product's own public URL, shown beside the integration in Stripe's dashboard and logs.
 *
 * Deliberately a constant and NOT `appUrl()`: that returns the URL of whichever DEPLOYMENT is running
 * (localhost in dev, a preview host on a branch), and Stripe wants one stable public address for the
 * integration. It was pointing at `remained-software.vercel.app` — a different project entirely,
 * copy-pasted in and wrong long before this domain existed. Update it if the product's domain moves.
 */
const PRODUCT_URL = "https://www.frontdeskai.dev";

/** Tags every Checkout Session so flows can be compared in the Dashboard (Stripe asks for a fixed 8-letter suffix). */
export const CHECKOUT_INTEGRATION_ID = "frontdesk_subscribe_qzvmxrtp";

let client: { key: string; stripe: Stripe } | null = null;

export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set.");
  if (!client || client.key !== key) {
    client = {
      key,
      stripe: new Stripe(key, {
        apiVersion: STRIPE_API_VERSION,
        maxNetworkRetries: 2, // idempotency keys are added automatically on retried POSTs
        appInfo: { name: "FrontDesk AI", url: PRODUCT_URL },
      }),
    };
  }
  return client.stripe;
}

// ---------- Errors ----------

export function stripeErrorMessage(e: unknown): string {
  if (e instanceof Stripe.errors.StripeError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong talking to Stripe.";
}

export function isStripeNotFound(e: unknown): boolean {
  return e instanceof Stripe.errors.StripeError && e.statusCode === 404;
}

// ---------- Object shapes (SDK types, aliased so callers import one module) ----------

export type StripeCustomer = Stripe.Customer | Stripe.DeletedCustomer;
export type StripePrice = Stripe.Price;
export type StripeSubscription = Stripe.Subscription;
export type StripeSubscriptionStatus = Stripe.Subscription.Status;
export type StripeCheckoutSession = Stripe.Checkout.Session;
export type StripeInvoice = Stripe.Invoice;
export type StripeCoupon = Stripe.Coupon;
export type StripeCustomerBalanceTransaction = Stripe.CustomerBalanceTransaction;
export type StripePortalConfiguration = Stripe.BillingPortal.Configuration;
export type StripeWebhookEvent = Stripe.Event;

/** Expandable references arrive as an id or as the object; we only ever want the id. */
export function idOf(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

/** The subscription an invoice belongs to (lives under `parent.subscription_details` since API version basil). */
export function invoiceSubscriptionId(inv: Stripe.Invoice): string | null {
  return idOf(inv.parent?.subscription_details?.subscription);
}

// ---------- API calls ----------

export function createCustomer(input: { email: string | null; name: string; accountId: string }) {
  return stripe().customers.create({ email: input.email ?? undefined, name: input.name, metadata: { accountId: input.accountId } });
}

export function getCustomer(id: string) {
  return stripe().customers.retrieve(id);
}

export function getPrice(id: string) {
  return stripe().prices.retrieve(id);
}

export type CheckoutSessionInput = {
  customer: string;
  clientReferenceId: string;
  lineItems: { price: string; quantity: number }[];
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
  subscriptionMetadata: Record<string, string>;
  /** A one-off coupon covering this account's referral credit, when it has any. */
  couponId?: string | null;
};

/**
 * Hosted Checkout in subscription mode. One-time prices in `lineItems` (the setup fee) land on the first
 * invoice only. `payment_method_types` is deliberately omitted so Stripe picks payment methods dynamically.
 */
export function createCheckoutSession(input: CheckoutSessionInput) {
  return stripe().checkout.sessions.create({
    mode: "subscription",
    customer: input.customer,
    client_reference_id: input.clientReferenceId,
    line_items: input.lineItems,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: input.metadata,
    subscription_data: { metadata: input.subscriptionMetadata },
    // Stripe accepts `discounts` or `allow_promotion_codes`, never both. Referral credit wins when
    // there is any: it is money already owed to this account, whereas a promotion code is one they
    // may or may not have. The discount is a coupon rather than a customer balance credit so that
    // the customer SEES the money come off on Stripe's own page, which is the whole promise.
    ...(input.couponId ? { discounts: [{ coupon: input.couponId }] } : { allow_promotion_codes: true }),
    billing_address_collection: "auto",
    customer_update: { address: "auto", name: "auto" },
    // Acceptance is captured a second time at the payment step, in Stripe's own records. Requires
    // the terms-of-service URL in Dashboard -> Settings -> Public details, or session creation
    // fails loudly (probed 2026-08-31; Stripe's error names that exact page). custom_text would
    // have put the cancellation policy inline here, but it is incompatible with Managed Payments,
    // which this account runs — the policy lives one link away in /terms instead. Do not re-add
    // custom_text without turning Managed Payments off first.
    consent_collection: { terms_of_service: "required" },
    integration_identifier: CHECKOUT_INTEGRATION_ID,
  });
}

/**
 * A single-use amount-off coupon. Minted per checkout rather than kept as one reusable coupon
 * because the amount varies: an account can be owed one credit or three.
 */
export function createCoupon(input: { amountOffCents: number; currency: string; name: string; metadata: Record<string, string>; redeemByEpoch?: number }) {
  return stripe().coupons.create({
    amount_off: input.amountOffCents,
    currency: input.currency,
    duration: "once",
    name: input.name,
    max_redemptions: 1,
    metadata: input.metadata,
    ...(input.redeemByEpoch ? { redeem_by: input.redeemByEpoch } : {}),
  });
}

export function getCoupon(id: string) {
  return stripe().coupons.retrieve(id);
}

/**
 * Put money on the customer's invoice balance. A NEGATIVE amount is the credit; Stripe applies it to
 * the next invoice it finalizes, up to that invoice's total, and carries any remainder forward.
 *
 * `idempotencyKey` is the credit's own row id, so a webhook redelivery cannot credit twice.
 */
export function creditCustomerBalance(customer: string, input: { amountCents: number; currency: string; description: string; metadata: Record<string, string>; idempotencyKey: string }) {
  return stripe().customers.createBalanceTransaction(
    customer,
    { amount: -Math.abs(input.amountCents), currency: input.currency, description: input.description, metadata: input.metadata },
    { idempotencyKey: input.idempotencyKey },
  );
}

export function getSubscription(id: string) {
  return stripe().subscriptions.retrieve(id);
}

export function listSubscriptions(customer: string, limit = 10) {
  return stripe().subscriptions.list({ customer, status: "all", limit });
}

export function listInvoices(customer: string, limit = 12) {
  return stripe().invoices.list({ customer, limit });
}

/**
 * Self-service card updates, invoice history and cancellation. Stripe only falls back to a configuration
 * that is marked default; others must be named explicitly.
 */
export function createPortalSession(customer: string, returnUrl: string, configuration?: string) {
  return stripe().billingPortal.sessions.create({ customer, return_url: returnUrl, configuration });
}

export function listPortalConfigurations(params: { is_default?: boolean; active?: boolean; limit?: number } = {}) {
  return stripe().billingPortal.configurations.list(params);
}

export function createPortalConfiguration(params: Stripe.BillingPortal.ConfigurationCreateParams) {
  return stripe().billingPortal.configurations.create(params);
}

// ---------- Webhooks ----------

/**
 * Verify the `Stripe-Signature` header against the raw body and parse the event.
 * Throws `Stripe.errors.StripeSignatureVerificationError` on a bad/missing/stale signature
 * (default tolerance 300 s) and a plain error on unparsable JSON.
 */
export function constructWebhookEvent(rawBody: string, signature: string | null, secret = process.env.STRIPE_WEBHOOK_SECRET): Stripe.Event {
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set.");
  return stripe().webhooks.constructEvent(rawBody, signature ?? "", secret);
}
