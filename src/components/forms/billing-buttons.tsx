"use client";

import { useActionState } from "react";
import { openBillingPortal, refreshBillingStatus, startCheckout } from "@/actions/billing";
import type { ActionState } from "@/lib/form";
import { Alert, Button } from "@/components/ui";
import type { FormMode } from "@/components/form-footer";

/*
 * Buttons that hand off to Stripe (Checkout, Customer Portal) or re-sync from it.
 * Pending state only dims the label (motion spec rule 11): the redirect or the server's
 * response is the confirmation, never an animation.
 */

function Feedback({ state }: { state: ActionState }) {
  if (!state) return null;
  if (!state.ok && state.error) return <Alert>{state.error}</Alert>;
  if (state.ok && state.message) return <Alert kind="success">{state.message}</Alert>;
  return null;
}

export function CheckoutButton({ mode, disabled, label = "Pay with Stripe" }: { mode: FormMode; disabled?: boolean; label?: string }) {
  const [state, action, pending] = useActionState(startCheckout, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="mode" value={mode} />
      <Feedback state={state} />
      <Button type="submit" size="lg" full disabled={disabled || pending}>
        {pending ? "Taking you to Stripe…" : label}
      </Button>
    </form>
  );
}

export function PortalButton({ disabled }: { disabled?: boolean }) {
  const [state, action, pending] = useActionState(openBillingPortal, null);
  return (
    <form action={action} className="space-y-3">
      <Feedback state={state} />
      <Button type="submit" variant="secondary" disabled={disabled || pending}>
        {pending ? "Opening…" : "Open billing portal"}
      </Button>
    </form>
  );
}

export function RefreshStatusButton({ disabled }: { disabled?: boolean }) {
  const [state, action, pending] = useActionState(refreshBillingStatus, null);
  return (
    <form action={action} className="space-y-3">
      <Feedback state={state} />
      <Button type="submit" variant="ghost" size="sm" disabled={disabled || pending}>
        {pending ? "Checking…" : "Refresh status"}
      </Button>
    </form>
  );
}
