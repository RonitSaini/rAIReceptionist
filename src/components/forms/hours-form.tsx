"use client";

import { useActionState, useState } from "react";
import type { BusinessHours, ManagerAvailability } from "@prisma/client";
import { saveHours } from "@/actions/onboarding";
import type { AccountView } from "@/lib/serialize";
import { DAYS_OF_WEEK } from "@/lib/constants";
import type { ClassifiedReason } from "@/verticals/types";
import { Button, Checkbox, Field, Toggle, inputClass } from "@/components/ui";
import { FormFooter, type FormMode } from "@/components/form-footer";
import { ActionForm } from "@/components/action-form";

type Period = { periodName: string; open: string; close: string };
type DayState = { isClosed: boolean; periods: Period[] };
type ManagerRow = { dayOfWeek: number; start: string; end: string };

function buildDays(hours: BusinessHours[]): DayState[] {
  return DAYS_OF_WEEK.map((_, day) => {
    const rows = hours.filter((h) => h.dayOfWeek === day).sort((a, b) => a.sortOrder - b.sortOrder);
    if (rows.length === 0) return { isClosed: false, periods: [{ periodName: "All day", open: "11:00", close: "21:00" }] };
    if (rows.every((r) => r.isClosed)) return { isClosed: true, periods: [{ periodName: "All day", open: "11:00", close: "21:00" }] };
    return { isClosed: false, periods: rows.filter((r) => !r.isClosed).map((r) => ({ periodName: r.periodName, open: r.open, close: r.close })) };
  });
}

/** `escalationTypes` is passed in rather than imported: it is per-vertical, and a client bundle
 * has no business pulling in the whole vertical registry (prompt text, Zod schemas) to read a label. */
export function HoursForm({ account, hours, managerHours, mode, escalationTypes }: { account: AccountView; hours: BusinessHours[]; managerHours: ManagerAvailability[]; mode: FormMode; escalationTypes: readonly ClassifiedReason[] }) {
  const [state, action, pending] = useActionState(saveHours, null);
  const [days, setDays] = useState<DayState[]>(() => buildDays(hours));
  const [escalates, setEscalates] = useState(account.escalatesToManager);
  const [manager, setManager] = useState<ManagerRow[]>(() =>
    managerHours.length > 0 ? managerHours.map((m) => ({ dayOfWeek: m.dayOfWeek, start: m.start, end: m.end })) : DAYS_OF_WEEK.map((_, d) => ({ dayOfWeek: d, start: "10:00", end: "22:00" })),
  );

  function updateDay(day: number, patch: Partial<DayState>) {
    setDays((prev) => prev.map((d, i) => (i === day ? { ...d, ...patch } : d)));
  }
  function updatePeriod(day: number, idx: number, patch: Partial<Period>) {
    setDays((prev) => prev.map((d, i) => (i === day ? { ...d, periods: d.periods.map((p, j) => (j === idx ? { ...p, ...patch } : p)) } : d)));
  }
  function addPeriod(day: number) {
    setDays((prev) =>
      prev.map((d, i) => {
        if (i !== day) return d;
        const first = d.periods[0];
        const isSingle = d.periods.length === 1 && first.periodName === "All day";
        const periods = isSingle
          ? [
              { periodName: "Lunch", open: first.open, close: "14:30" },
              { periodName: "Dinner", open: "17:00", close: first.close },
            ]
          : [...d.periods, { periodName: "Late night", open: "21:00", close: "23:00" }];
        return { ...d, periods };
      }),
    );
  }
  function removePeriod(day: number, idx: number) {
    setDays((prev) => prev.map((d, i) => (i === day ? { ...d, periods: d.periods.filter((_, j) => j !== idx) } : d)));
  }
  function copyToAll(day: number) {
    setDays((prev) => prev.map(() => ({ isClosed: prev[day].isClosed, periods: prev[day].periods.map((p) => ({ ...p })) })));
  }

  const hoursJson = JSON.stringify(
    days.flatMap((d, dayOfWeek) => (d.isClosed ? [{ dayOfWeek, periodName: "Closed", open: "00:00", close: "00:00", isClosed: true }] : d.periods.map((p) => ({ dayOfWeek, ...p, isClosed: false })))),
  );

  return (
    <ActionForm action={action} className="space-y-6">
      <input type="hidden" name="hours" value={hoursJson} />
      <input type="hidden" name="managerHours" value={JSON.stringify(escalates ? manager : [])} />

      <section className="space-y-3">
        <h2 className="text-base font-bold">Weekly hours</h2>
        <p className="text-sm text-gray-500">Add a second period for split service (lunch and dinner). The AI only books during these hours.</p>
        {days.map((d, day) => (
          <div key={day} className="rounded-2xl border border-gray-200 bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold">{DAYS_OF_WEEK[day]}</span>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={d.isClosed} onChange={(e) => updateDay(day, { isClosed: e.target.checked })} className="h-5 w-5 accent-brand-600" />
                Closed
              </label>
            </div>
            {!d.isClosed ? (
              <div className="mt-3 space-y-2">
                {d.periods.map((p, idx) => (
                  <div key={idx} className="grid grid-cols-12 items-center gap-2">
                    <input aria-label="Period name" value={p.periodName} onChange={(e) => updatePeriod(day, idx, { periodName: e.target.value })} className={`${inputClass} col-span-12 min-h-11 sm:col-span-4`} placeholder="Lunch" />
                    <input aria-label="Opens" type="time" value={p.open} onChange={(e) => updatePeriod(day, idx, { open: e.target.value })} className={`${inputClass} col-span-5 min-h-11 px-2 sm:col-span-3`} required />
                    <input aria-label="Closes" type="time" value={p.close} onChange={(e) => updatePeriod(day, idx, { close: e.target.value })} className={`${inputClass} col-span-5 min-h-11 px-2 sm:col-span-3`} required />
                    <button type="button" onClick={() => removePeriod(day, idx)} disabled={d.periods.length === 1} className="col-span-2 min-h-11 rounded-xl text-sm font-semibold text-red-600 disabled:text-gray-300" aria-label="Remove period">
                      ✕
                    </button>
                  </div>
                ))}
                <div className="flex flex-wrap gap-3 pt-1">
                  <button type="button" onClick={() => addPeriod(day)} className="text-sm font-semibold text-brand-700">
                    + Add service period
                  </button>
                  <button type="button" onClick={() => copyToAll(day)} className="text-sm font-semibold text-gray-500">
                    Copy to all days
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold">Manager escalation</h2>
        <Toggle name="escalatesToManager" label="Escalate to a manager" description="The AI takes the caller's details and calls the manager's cell." checked={escalates} onChange={setEscalates} />
        {escalates ? (
          <>
            <Field label="When can a manager be reached?" hint="The AI promises a call-back within 15 minutes during these hours.">
              <div className="space-y-2">
                {manager.map((m, i) => (
                  <div key={m.dayOfWeek} className="grid grid-cols-12 items-center gap-2">
                    <span className="col-span-4 text-sm font-medium sm:col-span-3">{DAYS_OF_WEEK[m.dayOfWeek]}</span>
                    <input aria-label="Reachable from" type="time" value={m.start} onChange={(e) => setManager((prev) => prev.map((r, j) => (j === i ? { ...r, start: e.target.value } : r)))} className={`${inputClass} col-span-4 min-h-11 px-2`} />
                    <input aria-label="Reachable until" type="time" value={m.end} onChange={(e) => setManager((prev) => prev.map((r, j) => (j === i ? { ...r, end: e.target.value } : r)))} className={`${inputClass} col-span-4 min-h-11 px-2`} />
                  </div>
                ))}
              </div>
            </Field>
            <Field label="Escalate these situations">
              <div className="space-y-2">
                {escalationTypes.map((t) => (
                  <Checkbox key={t.key} name="escalationTypes" value={t.key} label={t.label} defaultChecked={account.escalationTypes.includes(t.key)} />
                ))}
              </div>
            </Field>
          </>
        ) : null}
      </section>

      <FormFooter state={state} pending={pending} mode={mode} backHref="/onboarding/2" />
      {mode === "onboarding" ? <Skip href="/onboarding/4" /> : null}
    </ActionForm>
  );
}

function Skip({ href }: { href: string }) {
  return (
    <Button type="button" variant="ghost" full onClick={() => (window.location.href = href)}>
      Skip for now (uses 11 AM – 9 PM daily)
    </Button>
  );
}
