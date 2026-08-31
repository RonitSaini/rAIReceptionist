"use client";

import { useActionState, useState } from "react";
import { saveDispatch } from "@/actions/field-service";
import type { AccountView } from "@/lib/serialize";
import { Field, Input, Toggle } from "@/components/ui";
import { FormFooter, type FormMode } from "@/components/form-footer";
import { ActionForm } from "@/components/action-form";

/**
 * How fast, and what the caller is told when nobody answers.
 *
 * The response range is quoted as an estimate and only ever as a range — the agent is instructed
 * never to give a single number — because "forty minutes" is what gets repeated back to a company
 * afterwards, and a tow at 2am depends on where the truck already is.
 *
 * The last field is the one worth reading twice. It is what a caller receives when nobody in the
 * business acknowledged their request inside the window above: not silence, and not a cheerful
 * "we'll be in touch", but the truth, so somebody standing at the roadside can decide to ring
 * someone else. It is editable because the honest sentence differs by business, and it is not
 * optional.
 */
export function DispatchForm({
  account,
  defaultResponse,
  defaultAckMinutes,
  defaultUnacknowledged,
  mode,
}: {
  account: AccountView;
  defaultResponse: [number, number] | null;
  defaultAckMinutes: number;
  defaultUnacknowledged: string;
  mode: FormMode;
}) {
  const [state, action, pending] = useActionState(saveDispatch, null);
  const [scheduled, setScheduled] = useState(account.takesScheduledWork);

  return (
    <ActionForm action={action} className="space-y-5">
      <Toggle
        name="takesScheduledWork"
        label="We also book scheduled work"
        description="Off means everything is taken as it comes in. The AI is not given the booking tools at all, and the Schedule page is hidden."
        checked={scheduled}
        onChange={setScheduled}
      />

      <section className="space-y-3">
        <p className="text-sm font-semibold text-gray-800">Typical response time</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From (minutes)" htmlFor="responseTimeMinMinutes">
            <Input
              id="responseTimeMinMinutes"
              name="responseTimeMinMinutes"
              inputMode="numeric"
              placeholder={defaultResponse ? String(defaultResponse[0]) : "30"}
              defaultValue={account.responseTimeMinMinutes ?? ""}
            />
          </Field>
          <Field label="To (minutes)" htmlFor="responseTimeMaxMinutes">
            <Input
              id="responseTimeMaxMinutes"
              name="responseTimeMaxMinutes"
              inputMode="numeric"
              placeholder={defaultResponse ? String(defaultResponse[1]) : "60"}
              defaultValue={account.responseTimeMaxMinutes ?? ""}
            />
          </Field>
        </div>
        <p className="text-xs text-gray-500">
          Quoted as an estimate and only as a range. Leave both blank and the AI quotes no time at all, and says the office will call straight back.
        </p>
      </section>

      <Field
        label="Call back within (minutes)"
        htmlFor="escalationAckMinutes"
        hint={`How long you have to acknowledge a request before the caller is texted. Default for this trade is ${defaultAckMinutes}.`}
      >
        <Input id="escalationAckMinutes" name="escalationAckMinutes" inputMode="numeric" placeholder={String(defaultAckMinutes)} defaultValue={account.escalationAckMinutes ?? ""} className="max-w-32" />
      </Field>

      <Field
        label="If nobody acknowledges in time, text the caller"
        htmlFor="unacknowledgedMessage"
        hint="Sent once, automatically. Say something true — a stranded caller can act on the truth and cannot act on silence."
      >
        <textarea
          id="unacknowledgedMessage"
          name="unacknowledgedMessage"
          rows={3}
          defaultValue={account.unacknowledgedMessage ?? defaultUnacknowledged}
          className="w-full rounded-xl border border-gray-300 bg-surface px-3 py-2 text-sm text-ink placeholder:text-gray-400 focus:border-brand-600 focus:outline-none"
        />
      </Field>

      <FormFooter state={state} pending={pending} mode={mode} backHref="/onboarding/4" />
    </ActionForm>
  );
}
