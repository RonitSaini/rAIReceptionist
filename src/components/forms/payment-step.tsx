import { completePaymentStep } from "@/actions/onboarding";
import type { AccountView } from "@/lib/serialize";
import { humanize } from "@/lib/constants";
import { formatUsd } from "@/lib/form";
import { formatDateLong } from "@/lib/time";
import { stripeConfigured, stripePricesConfigured } from "@/lib/env";
import { getPlanPrices, type PlanPrice } from "@/lib/billing";
import { parseCheckoutResult, subscriptionActive, subscriptionTone, type CheckoutResult } from "@/lib/billing-ui";
import { Alert, Badge, Button, Card } from "@/components/ui";
import { BackLink, type FormMode } from "@/components/form-footer";
import { CheckoutButton, RefreshStatusButton } from "@/components/forms/billing-buttons";

export { parseCheckoutResult };

function money(p: PlanPrice | null, fallback: string): string {
  if (!p) return fallback;
  const amount = formatUsd(p.amount / 100);
  return p.interval ? `${amount} / ${p.interval}` : amount;
}

/** Step 8 / Settings → Billing. Plan summary, subscription status, and the hand-off to hosted Checkout. */
export async function PaymentStep({ account, mode, checkout = null, backHref }: { account: AccountView; mode: FormMode; checkout?: CheckoutResult; backHref?: string }) {
  const configured = stripeConfigured() && stripePricesConfigured();
  const prices = configured ? await getPlanPrices() : null;
  const active = subscriptionActive(account);
  const periodEnd = account.subscriptionCurrentPeriodEnd ? formatDateLong(new Date(account.subscriptionCurrentPeriodEnd), account.timeZone) : null;
  const setupFeeLabel = account.setupFeePaidAt ? "Paid" : money(prices?.setupFee ?? null, process.env.STRIPE_PRICE_SETUP_FEE ? "Set in Stripe" : "None");
  const reactivating = account.subscriptionStatus === "past_due" || account.subscriptionStatus === "cancelled";

  return (
    <div className="space-y-4">
      {checkout === "success" && !active ? (
        <Alert kind="success">
          Payment received. Your subscription activates as soon as Stripe confirms it — usually within a few seconds.
          <div className="mt-2">
            <RefreshStatusButton />
          </div>
        </Alert>
      ) : null}
      {checkout === "success" && active ? <Alert kind="success">You&apos;re all set — your subscription is active.</Alert> : null}
      {checkout === "cancelled" ? <Alert kind="info">Checkout was cancelled. Nothing was charged.</Alert> : null}

      <Card title="Plan">
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span>One-time setup fee</span>
            <span className="font-semibold">{setupFeeLabel}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Monthly subscription</span>
            <span className="font-semibold">{money(prices?.monthly ?? null, "Set in Stripe")}</span>
          </div>
          <div className="flex items-center justify-between border-t border-gray-100 pt-2">
            <span>Status</span>
            <Badge tone={subscriptionTone[account.subscriptionStatus]}>{humanize(account.subscriptionStatus)}</Badge>
          </div>
          {active && periodEnd ? (
            <div className="flex items-center justify-between">
              <span>{account.subscriptionCancelAtPeriodEnd ? "Ends on" : "Renews on"}</span>
              <span className="font-semibold">{periodEnd}</span>
            </div>
          ) : null}
        </div>

        {!configured ? (
          <p className="mt-3 text-sm text-gray-500">Stripe isn&apos;t configured on this deployment yet. You can finish setup now and add payment later.</p>
        ) : active ? (
          <p className="mt-3 text-sm text-gray-500">
            {account.subscriptionCancelAtPeriodEnd
              ? "Your plan is set to end at the close of this billing period. Reactivate any time from the billing portal."
              : "Secure billing through Stripe. Change your card or cancel from the billing portal in Settings → Billing."}
          </p>
        ) : (
          <p className="mt-3 text-sm text-gray-500">Secure checkout with Stripe. You&apos;ll be taken to Stripe&apos;s hosted page and brought straight back here.</p>
        )}

        {!active ? (
          <div className="mt-4">
            <CheckoutButton mode={mode} disabled={!configured} label={reactivating ? "Reactivate with Stripe" : "Pay with Stripe"} />
          </div>
        ) : null}
      </Card>

      {mode === "onboarding" ? (
        <form action={completePaymentStep} data-guided="3" className="space-y-3 pt-2">
          <Button type="submit" size="lg" full variant={active ? "primary" : "secondary"}>
            {active ? "Go to my dashboard" : "Skip for now and go to my dashboard"}
          </Button>
          {backHref ? <BackLink href={backHref} /> : null}
        </form>
      ) : null}
    </div>
  );
}
