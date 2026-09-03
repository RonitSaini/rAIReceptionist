"use client";

import { useActionState } from "react";
import { applyReferralCode } from "@/actions/referrals";
import { Alert, Button, Card, Field, Input } from "@/components/ui";

/**
 * "Got a referral code?" — the payment step's one extra field.
 *
 * Pending state dims the label and nothing else (motion spec rule 11): the server's answer is the
 * confirmation. There is no optimistic "applied!" here, because the code might not be a real one.
 */
export function ReferralClaimForm({ creditLabel }: { creditLabel: string }) {
  const [state, action, pending] = useActionState(applyReferralCode, null);

  return (
    <Card title="Referral code">
      <form action={action} className="space-y-3">
        <p className="text-sm text-gray-500">
          Were you sent here by another business? Enter their code and {creditLabel} comes off your first invoice. They get the same off their next
          one once you&apos;re paid up.
        </p>
        {state && !state.ok && state.error ? <Alert>{state.error}</Alert> : null}
        {state?.ok && state.message ? <Alert kind="success">{state.message}</Alert> : null}
        <Field label="Code" htmlFor="referralCode" hint="Eight letters and numbers. Pasting the whole invite link works too.">
          <Input
            id="referralCode"
            name="code"
            required
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="K7QM2XPD"
            className="font-mono uppercase tracking-widest"
          />
        </Field>
        <Button type="submit" variant="secondary" disabled={pending || !!state?.ok}>
          {pending ? "Checking…" : "Apply code"}
        </Button>
      </form>
    </Card>
  );
}
