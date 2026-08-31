"use client";

import { useActionState } from "react";
import { saveShopHandoffs } from "@/actions/shop";
import type { AccountView } from "@/lib/serialize";
import type { ClassifiedReason } from "@/verticals/types";
import { Checkbox, Field, Input } from "@/components/ui";
import { FormFooter, type FormMode } from "@/components/form-footer";
import { ActionForm } from "@/components/action-form";

type Referral = { field: string; nameField?: string; label: string; hint: string; required: boolean };

/**
 * Where this business sends the callers it cannot help itself.
 *
 * The number below is the most consequential field in the whole onboarding flow for a clinic. It is
 * what a frightened owner is given at eleven at night when the practice is shut, and it is required
 * for exactly that reason: an account that finishes setup without one has a hole in it that only
 * shows up on the worst call it will ever take.
 */
export function ShopHandoffForm({
  account,
  emergencyTypes,
  referral,
  defaultSlotMinutes,
  mode,
}: {
  account: AccountView;
  emergencyTypes: readonly ClassifiedReason[];
  referral: Referral;
  defaultSlotMinutes: number;
  mode: FormMode;
}) {
  const [state, action, pending] = useActionState(saveShopHandoffs, null);
  const current = (account as unknown as Record<string, string | null>)[referral.field] ?? "";
  const currentName = referral.nameField ? ((account as unknown as Record<string, string | null>)[referral.nameField] ?? "") : "";

  return (
    <ActionForm action={action} className="space-y-5">
      <Field label="Treat these as urgent">
        <div className="space-y-2">
          {emergencyTypes.map((t) => (
            <Checkbox key={t.key} name="emergencyTypes" value={t.key} label={t.label} defaultChecked={account.emergencyTypes.includes(t.key)} />
          ))}
        </div>
        <p className="mt-2 text-xs text-gray-500">Leave them all unticked and the AI treats the whole list as urgent rather than none of it.</p>
      </Field>

      <section className="space-y-3">
        <p className="text-sm font-semibold text-gray-800">{referral.label}{referral.required ? " (required)" : ""}</p>
        {referral.nameField ? (
          <Field label="Name" htmlFor="referralName">
            <Input id="referralName" name="referralName" defaultValue={currentName} placeholder="Ridgeway Towing" />
          </Field>
        ) : null}
        <Field label="Phone" htmlFor="referralPhone" hint={referral.hint}>
          <Input id="referralPhone" name="referralPhone" type="tel" inputMode="tel" defaultValue={current} placeholder="(555) 123-4567" required={referral.required} />
        </Field>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="How long is one appointment?" htmlFor="jobSlotMinutes" hint="Minutes.">
          <Input id="jobSlotMinutes" name="jobSlotMinutes" inputMode="numeric" defaultValue={account.jobSlotMinutes || defaultSlotMinutes} />
        </Field>
        <Field label="Most per day" htmlFor="maxJobsPerDay" hint="Leave blank for no limit.">
          <Input id="maxJobsPerDay" name="maxJobsPerDay" inputMode="numeric" defaultValue={account.maxJobsPerDay ?? ""} />
        </Field>
      </div>

      <FormFooter state={state} pending={pending} mode={mode} />
    </ActionForm>
  );
}
