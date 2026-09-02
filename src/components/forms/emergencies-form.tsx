"use client";

import { useActionState, useState } from "react";
import { saveEmergencies } from "@/actions/field-service";
import type { AccountView } from "@/lib/serialize";
import type { ClassifiedReason } from "@/verticals/types";
import { customEmergencyLabel, isCustomEmergency } from "@/lib/custom-emergencies";
import { Button, Checkbox, Field, Input } from "@/components/ui";
import { FormFooter, type FormMode } from "@/components/form-footer";
import { ActionForm } from "@/components/action-form";
import { MotionList } from "@/components/motion-list";

let seq = 0;
/** Local row identity, so a removed emergency can leave (MotionList keys) — never an index. */
const nextId = () => ++seq;

/**
 * What counts as an emergency, who attends, and how much work fits in a day.
 *
 * Ticking a situation here changes what the agent does when it hears it: instead of offering a slot
 * it takes the address, logs the job, alerts the owner by phone and promises a call back in 15
 * minutes. Leaving them all unticked is allowed — the agent then treats the whole list as urgent
 * rather than none of it, because the failure mode of under-reacting to a burst pipe is worse.
 */
export function EmergenciesForm({ account, emergencyTypes, defaultSlotMinutes, mode, backHref }: { account: AccountView; emergencyTypes: readonly ClassifiedReason[]; defaultSlotMinutes: number; mode: FormMode; backHref?: string }) {
  const [state, action, pending] = useActionState(saveEmergencies, null);
  const [custom, setCustom] = useState<{ id: number; label: string }[]>(() => account.emergencyTypes.filter(isCustomEmergency).map((t) => ({ id: nextId(), label: customEmergencyLabel(t) })));

  return (
    <ActionForm action={action} className="space-y-5">
      <Field label="Treat these as emergencies">
        <div className="space-y-2">
          {emergencyTypes.map((t) => (
            <Checkbox key={t.key} name="emergencyTypes" value={t.key} label={t.label} defaultChecked={account.emergencyTypes.includes(t.key)} />
          ))}
        </div>
      </Field>

      <Field label="Your own emergencies" hint="Anything else the AI should treat as an emergency, in your own words.">
        <MotionList as="div" className="space-y-2">
          {custom.map(({ id, label }) => (
            <div key={id} className="flex items-center gap-2">
              <Input aria-label="Emergency description" name="customEmergencies" value={label} onChange={(e) => setCustom((prev) => prev.map((c) => (c.id === id ? { ...c, label: e.target.value } : c)))} maxLength={60} />
              <button type="button" onClick={() => setCustom((prev) => prev.filter((c) => c.id !== id))} className="press-soft shrink-0 text-xs font-semibold text-red-600">
                Remove
              </button>
            </div>
          ))}
          <Button key="add" type="button" variant="secondary" size="sm" onClick={() => setCustom((prev) => [...prev, { id: nextId(), label: "" }])}>
            + Add an emergency
          </Button>
        </MotionList>
      </Field>

      <Field label="Who attends" htmlFor="technicianName" hint="Used when the AI says who is coming. Leave blank if it varies.">
        <Input id="technicianName" name="technicianName" defaultValue={account.technicianName ?? ""} placeholder="Mike" autoComplete="name" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="How long a visit takes" htmlFor="jobSlotMinutes" hint="Minutes. Used to lay out the day.">
          <Input id="jobSlotMinutes" name="jobSlotMinutes" type="number" min={15} max={480} step={15} defaultValue={account.jobSlotMinutes || defaultSlotMinutes} />
        </Field>
        <Field label="Most jobs in a day" htmlFor="maxJobsPerDay" hint="Blank for no limit.">
          <Input id="maxJobsPerDay" name="maxJobsPerDay" type="number" min={1} max={50} defaultValue={account.maxJobsPerDay ?? ""} placeholder="6" />
        </Field>
      </div>

      <FormFooter state={state} pending={pending} mode={mode} backHref={backHref} />
    </ActionForm>
  );
}
