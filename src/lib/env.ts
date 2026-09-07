import type { SubscriptionStatus } from "@prisma/client";
import { subscriptionActive } from "./billing-ui";

/** Small helpers around environment configuration for the integrations. */

export function appUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  return raw.replace(/\/+$/, "");
}

export function twilioConfigured(): boolean {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
}

export function retellConfigured(): boolean {
  return !!process.env.RETELL_API_KEY;
}

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/** The monthly price is required for checkout; the setup fee is optional. */
export function stripePricesConfigured(): boolean {
  return !!process.env.STRIPE_PRICE_MONTHLY;
}

export function stripeWebhookConfigured(): boolean {
  return !!process.env.STRIPE_WEBHOOK_SECRET;
}

/**
 * "true" = the AI host stops answering calls for accounts without an active subscription.
 * Off by default so dev and demo accounts keep working before Stripe is wired up.
 */
export function billingRequired(): boolean {
  return process.env.BILLING_REQUIRED === "true";
}

/**
 * A phone number is only issued to an account with an active subscription. ON unless
 * PHONE_REQUIRES_SUBSCRIPTION is explicitly "false".
 *
 * Note the polarity — this is the one flag in this file that defaults ON, and deliberately. A
 * number rents real dollars every month for as long as it exists, so the failure worth designing
 * against is the quiet one: an environment where nobody remembered to set the variable, handing
 * out numbers nobody is paying for. Defaulting to enforcement puts the cost of a forgotten
 * variable on us noticing a blocked step, not on next month's Twilio bill.
 *
 * History, because the polarity looks like a mistake otherwise: it was a hard rule, then a
 * default-off flag from 2026-09-01 so the first signups could connect a number before billing
 * enforcement began. Enforcement is on again at the owner's request (2026-09-06). The off switch
 * stays, because it was genuinely needed once — PHONE_REQUIRES_SUBSCRIPTION=false and a redeploy.
 */
export function phoneRequiresSubscription(): boolean {
  return process.env.PHONE_REQUIRES_SUBSCRIPTION !== "false";
}

/**
 * May this account be issued a phone number? The one place that decides.
 *
 * Both sites that care ask this: the action that buys the number, and the panel that decides
 * whether the button is live. They used to compute it separately, as exact negations of each
 * other — which is a button that can lie, offering "Get my number" to someone the server will
 * refuse the moment they click it.
 *
 * Skipped where Stripe is not configured at all: local dev and preview have no way to subscribe,
 * and a gate nobody in that environment can pass is just a step that never opens.
 */
export function canConnectNumber(account: { subscriptionStatus: SubscriptionStatus }): boolean {
  return !phoneRequiresSubscription() || !stripeConfigured() || subscriptionActive(account);
}

/** Both integrations present — the phone number can be provisioned and wired to an agent. */
export function phoneStackConfigured(): boolean {
  return twilioConfigured() && retellConfigured();
}

/** Webhook endpoints are only reachable over a public URL (Vercel, or a tunnel like ngrok in dev). */
export function appUrlIsPublic(): boolean {
  const u = appUrl();
  return !/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(u) && u.startsWith("https://");
}

/** Server key for Places API (New) + Geocoding API — address suggestions and delivery-area checks. */
export function googleMapsConfigured(): boolean {
  return !!process.env.GOOGLE_MAPS_API_KEY;
}
