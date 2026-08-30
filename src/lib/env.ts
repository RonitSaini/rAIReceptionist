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

/** Both integrations present — the phone number can be provisioned and wired to an agent. */
export function phoneStackConfigured(): boolean {
  return twilioConfigured() && retellConfigured();
}

/** Webhook endpoints are only reachable over a public URL (Vercel, or a tunnel like ngrok in dev). */
export function appUrlIsPublic(): boolean {
  const u = appUrl();
  return !/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(u) && u.startsWith("https://");
}
