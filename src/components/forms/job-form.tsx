"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createJob } from "@/actions/field-service";
import type { AccountView } from "@/lib/serialize";
import { Alert, Button, Field, Input, Textarea, Toggle } from "@/components/ui";
import { ActionForm } from "@/components/action-form";

/**
 * Booking work by hand, for whoever is at the desk when the phone is answered by a person.
 *
 * A time is optional on purpose: half the jobs a trade takes are "we'll call you back to arrange
 * it", and forcing a slot would either invent one or lose the enquiry. Without a time the job is
 * saved as `requested` and shows up on the Jobs list rather than the schedule.
 */
export function JobForm({ account, defaultDate }: { account: AccountView; defaultDate: string | null }) {
  const [state, action, pending] = useActionState(createJob, null);
  const router = useRouter();

  useEffect(() => {
    const id = (state as { id?: string } | null)?.id;
    if (state?.ok && id) router.push(`/jobs/${id}`);
  }, [state, router]);

  return (
    <ActionForm action={action} className="space-y-4">
      {state && !state.ok && state.error ? <Alert>{state.error}</Alert> : null}

      <Field label="Customer name" htmlFor="customerName">
        <Input id="customerName" name="customerName" required autoComplete="off" />
      </Field>
      <Field label="Phone" htmlFor="customerPhone" hint="Used for the confirmation text.">
        <Input id="customerPhone" name="customerPhone" type="tel" inputMode="tel" placeholder="(555) 123-4567" />
      </Field>
      <Field label="Address" htmlFor="address">
        <Input id="address" name="address" autoComplete="off" placeholder="12 Oak Street" />
      </Field>
      <Field label="What's wrong" htmlFor="description">
        <Textarea id="description" name="description" placeholder="Leaking under the kitchen sink" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" htmlFor="date" hint="Leave blank to arrange later.">
          <Input id="date" name="date" type="date" defaultValue={defaultDate ?? ""} />
        </Field>
        <Field label="Start time" htmlFor="time">
          <Input id="time" name="time" type="time" step={900} />
        </Field>
      </div>

      <Field label="Assigned to" htmlFor="assignedTo">
        <Input id="assignedTo" name="assignedTo" defaultValue={account.technicianName ?? ""} placeholder="Mike" />
      </Field>

      <Toggle name="isEmergency" label="Emergency" description="Flags it as urgent in the list and on the schedule." />

      <input type="hidden" name="mode" value="settings" />
      <Button type="submit" size="lg" full disabled={pending || !!state?.ok}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </ActionForm>
  );
}
