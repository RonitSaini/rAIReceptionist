import type { SubscriptionStatus } from "@prisma/client";

/** Pure billing helpers safe to import from client components (no Prisma, no Stripe). */

export const ACTIVE_SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = ["active", "trialing"];

export function subscriptionActive(a: { subscriptionStatus: SubscriptionStatus }): boolean {
  return ACTIVE_SUBSCRIPTION_STATUSES.includes(a.subscriptionStatus);
}

export const subscriptionTone: Record<SubscriptionStatus, "green" | "blue" | "red" | "gray"> = {
  active: "green",
  trialing: "blue",
  past_due: "red",
  cancelled: "gray",
  none: "gray",
};

export const invoiceTone: Record<string, "green" | "amber" | "red" | "gray"> = {
  paid: "green",
  open: "amber",
  uncollectible: "red",
  void: "gray",
  draft: "gray",
};

/** `?checkout=` on the return from hosted Checkout. */
export type CheckoutResult = "success" | "cancelled" | null;

export function parseCheckoutResult(v: string | undefined): CheckoutResult {
  return v === "success" ? "success" : v === "cancelled" ? "cancelled" : null;
}
