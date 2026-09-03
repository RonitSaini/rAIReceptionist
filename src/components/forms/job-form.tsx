"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createJob } from "@/actions/field-service";
import type { AccountView } from "@/lib/serialize";
import { accountCountry } from "@/lib/locale";
import { Alert, Button, Field, Input, Textarea, Toggle } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { AddressAutocomplete } from "@/components/forms/address-autocomplete";

/** What the service-area check came back with, or why there is nothing to show. */
type AreaState = { kind: "none" } | { kind: "checking" } | { kind: "result"; covered: boolean; uncertain?: boolean; reason: string };

/**
 * Booking work by hand, for whoever is at the desk when the phone is answered by a person.
 *
 * A time is optional on purpose: half the jobs a trade takes are "we'll call you back to arrange
 * it", and forcing a slot would either invent one or lose the enquiry. Without a time the job is
 * saved as `requested` and shows up on the Jobs list rather than the schedule.
 *
 * The address field suggests via <AddressAutocomplete> (the same combobox the onboarding business
 * address uses, talking to the same server routes, so the Google key stays out of the bundle). The
 * address stays FREE TEXT: dispatch callers give locations that are not addresses — "the Shell on
 * Highway 7" — and the field must take that and submit it, so nothing here requires a pick.
 *
 * On a pick, and only when a service radius is configured, the same check the AI runs mid-call
 * (`check_service_area`) runs here and the answer is shown inline. It is advisory: whoever is at the
 * desk may have a good reason to take a job outside the area, so it never blocks the save.
 */
export function JobForm({ account, defaultDate }: { account: AccountView; defaultDate: string | null }) {
  const [state, action, pending] = useActionState(createJob, null);
  const router = useRouter();
  const [address, setAddress] = useState("");
  const [area, setArea] = useState<AreaState>({ kind: "none" });
  const areaRun = useRef(0);
  const hasServiceArea = account.serviceAreaRadiusMiles != null;

  async function checkArea(picked: string) {
    if (!hasServiceArea || !picked.trim()) return;
    const run = ++areaRun.current; // a later pick wins, so a slow answer cannot overwrite a newer one
    setArea({ kind: "checking" });
    try {
      const res = await fetch(`/api/service-area/check?address=${encodeURIComponent(picked)}`);
      if (run !== areaRun.current) return;
      if (!res.ok) return setArea({ kind: "none" });
      const d = (await res.json()) as { configured: boolean; covered?: boolean; uncertain?: boolean; reason?: string };
      if (run !== areaRun.current) return;
      setArea(d.configured && d.reason ? { kind: "result", covered: !!d.covered, uncertain: d.uncertain, reason: d.reason } : { kind: "none" });
    } catch {
      if (run === areaRun.current) setArea({ kind: "none" }); // degrade quietly, exactly like the suggestions
    }
  }

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
        <AddressAutocomplete
          id="address"
          name="address"
          value={address}
          onChange={(text) => {
            setAddress(text);
            if (area.kind !== "none") setArea({ kind: "none" }); // the answer belonged to the old address
          }}
          onPick={(a) => {
            const formatted = a.formatted || [a.addressLine1, a.city, a.state].filter(Boolean).join(", ");
            setAddress(formatted);
            void checkArea(formatted);
          }}
          country={accountCountry(account)}
          biasToAccount
          placeholder="12 Oak Street — or describe the spot"
        />
        {area.kind === "checking" ? (
          <p className="content-in mt-1.5 text-xs text-gray-500">Checking the service area…</p>
        ) : area.kind === "result" ? (
          <p className={`content-in mt-1.5 text-xs font-semibold ${area.uncertain ? "text-gray-500" : area.covered ? "text-green-700" : "text-amber-700"}`}>
            {area.uncertain ? "Could not confirm" : area.covered ? "In your service area" : "Outside your service area"} <span className="font-normal text-gray-500">— {area.reason}</span>
          </p>
        ) : null}
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

      <Toggle tone="brand" name="isEmergency" label="Emergency" description="Flags it as urgent in the list and on the schedule." />

      <input type="hidden" name="mode" value="settings" />
      <Button type="submit" size="lg" full disabled={pending || !!state?.ok}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </ActionForm>
  );
}
