import type { Account } from "@prisma/client";
import { billingRequired } from "./env";
import { subscriptionActive } from "./billing-ui";
import { ONBOARDING_DONE } from "@/verticals/steps";

/**
 * Where an account stands with billing, as one word (docs/frontdesk-billing-spec.md).
 *
 * Pure: reads the account and the clock, touches nothing. That is what lets the agent prompt
 * builder, the inbound-call route, the layout banner and the daily sweep all agree on the answer
 * without any of them importing Prisma or Stripe. The clocks themselves are set in one place,
 * `applySubscription` in billing.ts, and cleared the moment a subscription is active again.
 *
 *   exempt  - billing is not enforced on this deployment, this is an internal/test account, or the
 *             account has not finished setup. That last one is the sale: the voice step lets a
 *             prospect talk to the agent in the browser before the payment step, and an agent that
 *             refuses to book is not a demo. Nothing else can reach it - no number is issued before
 *             payment - so enforcement starts the moment setup is done.
 *   ok      - an active (or trialing) subscription
 *   grace   - a payment failed less than GRACE_DAYS ago: the agent works normally, the owner is nagged
 *   paused  - anything else: no subscription, a cancelled one, or grace ran out unpaid. The agent
 *             still answers, still takes a name and number, never hangs up - and books nothing.
 */
export type BillingState = "exempt" | "ok" | "grace" | "paused";

export type BillingAccount = Pick<Account, "subscriptionStatus" | "isInternal" | "paymentFailedAt" | "subscriptionEndedAt" | "onboardingStepId">;

export const GRACE_DAYS = 10;
export const RECLAIM_WARN_DAYS = 20;
export const RECLAIM_DAYS = 30;
const DAY_MS = 86_400_000;

export function graceEndsAt(a: Pick<Account, "paymentFailedAt">): Date | null {
  return a.paymentFailedAt ? new Date(a.paymentFailedAt.getTime() + GRACE_DAYS * DAY_MS) : null;
}

export function billingState(a: BillingAccount, now: Date = new Date()): BillingState {
  if (!billingRequired() || a.isInternal) return "exempt";
  if (a.onboardingStepId !== ONBOARDING_DONE) return "exempt";
  if (subscriptionActive(a)) return "ok";
  const graceEnd = graceEndsAt(a);
  if (a.subscriptionStatus === "past_due" && graceEnd && now < graceEnd) return "grace";
  return "paused";
}

/** Whole days of grace left, for the banner. Zero once it has run out. */
export function graceDaysLeft(a: Pick<Account, "paymentFailedAt">, now: Date = new Date()): number {
  const end = graceEndsAt(a);
  return end ? Math.max(0, Math.ceil((end.getTime() - now.getTime()) / DAY_MS)) : 0;
}

/**
 * When the reclamation clock started: the subscription ending (cancelled), or - for a lapse that
 * was never cancelled in Stripe - the moment grace ran out unpaid. Null while nothing has ended.
 */
export function reclamationClockStart(a: Pick<Account, "subscriptionEndedAt" | "paymentFailedAt">): Date | null {
  if (a.subscriptionEndedAt) return a.subscriptionEndedAt;
  const graceEnd = graceEndsAt(a);
  return graceEnd ?? null;
}

export function reclamationWarnAt(a: Pick<Account, "subscriptionEndedAt" | "paymentFailedAt">): Date | null {
  const start = reclamationClockStart(a);
  return start ? new Date(start.getTime() + RECLAIM_WARN_DAYS * DAY_MS) : null;
}

export function reclamationDueAt(a: Pick<Account, "subscriptionEndedAt" | "paymentFailedAt">): Date | null {
  const start = reclamationClockStart(a);
  return start ? new Date(start.getTime() + RECLAIM_DAYS * DAY_MS) : null;
}
