import Link from "next/link";
import { completePaymentStep } from "@/actions/onboarding";
import type { AccountView } from "@/lib/serialize";
import { humanize } from "@/lib/constants";
import { Badge, Button, Card } from "@/components/ui";
import type { FormMode } from "@/components/form-footer";

/** Placeholder until Stripe checkout lands in Phase 4. */
export function PaymentStep({ account, mode }: { account: AccountView; mode: FormMode }) {
  return (
    <div className="space-y-4">
      <Card title="Plan">
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span>One-time setup fee</span>
            <span className="font-semibold">Set in Stripe</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Monthly subscription</span>
            <span className="font-semibold">Set in Stripe</span>
          </div>
          <div className="flex items-center justify-between border-t border-gray-100 pt-2">
            <span>Status</span>
            <Badge tone={account.subscriptionStatus === "active" ? "green" : "gray"}>{humanize(account.subscriptionStatus)}</Badge>
          </div>
        </div>
        <p className="mt-3 text-sm text-gray-500">Secure checkout with Stripe is coming in a later release. You can finish setup now and add payment later.</p>
        <Button type="button" className="mt-4" full disabled>
          Pay with Stripe (coming soon)
        </Button>
      </Card>

      {mode === "onboarding" ? (
        <form action={completePaymentStep} className="space-y-3 pt-2">
          <Button type="submit" size="lg" full variant="secondary">
            Skip for now and go to my dashboard
          </Button>
          <Link href="/onboarding/7" className="block text-center text-sm font-semibold text-gray-500 hover:text-ink">
            Back
          </Link>
        </form>
      ) : null}
    </div>
  );
}
