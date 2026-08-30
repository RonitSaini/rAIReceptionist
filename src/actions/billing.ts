"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAccount } from "@/lib/current-account";
import { str, type ActionState } from "@/lib/form";
import { appUrl, stripeConfigured, stripePricesConfigured } from "@/lib/env";
import { humanize } from "@/lib/constants";
import { subscriptionActive } from "@/lib/billing-ui";
import { refreshFromStripe, resolvePortalConfiguration } from "@/lib/billing";
import { createCheckoutSession, createCustomer, createPortalSession, getCustomer, isStripeNotFound, stripeErrorMessage } from "@/lib/stripe";

type Mode = "onboarding" | "settings";

function modeOf(fd: FormData): Mode {
  return str(fd, "mode") === "settings" ? "settings" : "onboarding";
}

const NOT_CONFIGURED = "Stripe isn't set up yet — add STRIPE_SECRET_KEY and STRIPE_PRICE_MONTHLY (optionally STRIPE_PRICE_SETUP_FEE) to the environment.";

/** Find or create the Stripe Customer for this account and persist its id. */
async function ensureCustomer(accountId: string, userId: string, name: string, existingId: string | null): Promise<string> {
  if (existingId) {
    try {
      const c = await getCustomer(existingId);
      if (!c.deleted) return existingId;
    } catch (e) {
      if (!isStripeNotFound(e)) throw e; // deleted in the Dashboard → make a new one
    }
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  const c = await createCustomer({ email: user?.email ?? null, name, accountId });
  await prisma.account.update({ where: { id: accountId }, data: { stripeCustomerId: c.id } });
  return c.id;
}

/** Onboarding step 8 / Settings → Billing: send the owner to hosted Checkout for setup fee + monthly plan. */
export async function startCheckout(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { account, userId } = await requireAccount();
  const mode = modeOf(fd);
  if (!stripeConfigured() || !stripePricesConfigured()) return { ok: false, error: NOT_CONFIGURED };
  if (subscriptionActive(account)) return { ok: true, message: "Your subscription is already active." };

  const setupFeePrice = process.env.STRIPE_PRICE_SETUP_FEE || null;
  const monthlyPrice = process.env.STRIPE_PRICE_MONTHLY as string;
  const chargeSetupFee = !!setupFeePrice && !account.setupFeePaidAt;

  const returnPath = mode === "onboarding" ? "/onboarding/8" : "/settings?tab=billing";
  const sep = returnPath.includes("?") ? "&" : "?";
  const base = appUrl();

  let url: string | null;
  try {
    const customer = await ensureCustomer(account.id, userId, account.restaurantName, account.stripeCustomerId);
    const session = await createCheckoutSession({
      customer,
      clientReferenceId: account.id,
      lineItems: [...(chargeSetupFee ? [{ price: setupFeePrice as string, quantity: 1 }] : []), { price: monthlyPrice, quantity: 1 }],
      successUrl: `${base}${returnPath}${sep}checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}${returnPath}${sep}checkout=cancelled`,
      metadata: { accountId: account.id, setupFee: chargeSetupFee ? "1" : "0" },
      subscriptionMetadata: { accountId: account.id },
    });
    url = session.url;
  } catch (e) {
    console.error("[billing] checkout failed:", stripeErrorMessage(e));
    return { ok: false, error: `Couldn't start checkout: ${stripeErrorMessage(e)}` };
  }
  if (!url) return { ok: false, error: "Stripe didn't return a checkout link. Try again." };
  redirect(url);
}

/** Settings → Billing: self-service card updates, invoices and cancellation in Stripe's Customer Portal. */
export async function openBillingPortal(): Promise<ActionState> {
  const { account } = await requireAccount();
  if (!stripeConfigured()) return { ok: false, error: NOT_CONFIGURED };
  if (!account.stripeCustomerId) return { ok: false, error: "No billing account yet — subscribe first." };

  let url: string;
  try {
    const configuration = await resolvePortalConfiguration();
    url = (await createPortalSession(account.stripeCustomerId, `${appUrl()}/settings?tab=billing`, configuration)).url;
  } catch (e) {
    console.error("[billing] portal failed:", stripeErrorMessage(e));
    return { ok: false, error: `Couldn't open the billing portal: ${stripeErrorMessage(e)}` };
  }
  redirect(url);
}

/**
 * Explicit re-sync from Stripe. The webhook normally keeps the mirror current; this covers a delayed
 * delivery right after checkout, or local dev without `stripe listen`. It's an action, not a read —
 * page renders never write.
 */
export async function refreshBillingStatus(): Promise<ActionState> {
  const { account } = await requireAccount();
  if (!stripeConfigured()) return { ok: false, error: NOT_CONFIGURED };
  if (!account.stripeCustomerId) return { ok: false, error: "No billing account yet — subscribe first." };
  try {
    const status = await refreshFromStripe(account);
    revalidatePath("/", "layout");
    return { ok: true, message: `Subscription status: ${humanize(status)}.` };
  } catch (e) {
    console.error("[billing] refresh failed:", stripeErrorMessage(e));
    return { ok: false, error: `Couldn't refresh from Stripe: ${stripeErrorMessage(e)}` };
  }
}
