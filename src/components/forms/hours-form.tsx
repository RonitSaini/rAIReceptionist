"use client";

import { useActionState, useState } from "react";
import type { BusinessHours } from "@prisma/client";
import { saveHours } from "@/actions/onboarding";
import { DAYS_OF_WEEK } from "@/lib/constants";
import { leaveGuided } from "@/lib/motion";
import { Button, inputClass } from "@/components/ui";
import { FormFooter, type FormMode } from "@/components/form-footer";
import { ActionForm } from "@/components/action-form";
import { Disclosure } from "@/components/disclosure";
import { MotionList } from "@/components/motion-list";

type Period = { id: number; periodName: string; open: string; close: string };

let seq = 0;
/** Local row identity, so a removed period can leave (MotionList keys) — never an index, never sent to the server. */
const nextId = () => ++seq;
type DayState = { isClosed: boolean; periods: Period[] };

function buildDays(hours: BusinessHours[]): DayState[] {
  return DAYS_OF_WEEK.map((_, day) => {
    const rows = hours.filter((h) => h.dayOfWeek === day).sort((a, b) => a.sortOrder - b.sortOrder);
    if (rows.length === 0) return { isClosed: false, periods: [{ id: nextId(), periodName: "Service Hours", open: "11:00", close: "21:00" }] };
    if (rows.every((r) => r.isClosed)) return { isClosed: true, periods: [{ id: nextId(), periodName: "Service Hours", open: "11:00", close: "21:00" }] };
    return { isClosed: false, periods: rows.filter((r) => !r.isClosed).map((r) => ({ id: nextId(), periodName: r.periodName, open: r.open, close: r.close })) };
  });
}

export function HoursForm({ hours, mode, backHref, nextHref }: { hours: BusinessHours[]; mode: FormMode; backHref?: string; nextHref?: string }) {
  const [state, action, pending] = useActionState(saveHours, null);
  const [days, setDays] = useState<DayState[]>(() => buildDays(hours));

  function updateDay(day: number, patch: Partial<DayState>) {
    setDays((prev) => prev.map((d, i) => (i === day ? { ...d, ...patch } : d)));
  }
  function updatePeriod(day: number, idx: number, patch: Partial<Period>) {
    setDays((prev) => prev.map((d, i) => (i === day ? { ...d, periods: d.periods.map((p, j) => (j === idx ? { ...p, ...patch } : p)) } : d)));
  }
  function addPeriod(day: number) {
    // One new period, name left blank for the owner to fill in; what's already there stays put.
    setDays((prev) => prev.map((d, i) => (i === day ? { ...d, periods: [...d.periods, { id: nextId(), periodName: "", open: "21:00", close: "23:00" }] } : d)));
  }
  function removePeriod(day: number, idx: number) {
    setDays((prev) => prev.map((d, i) => (i === day ? { ...d, periods: d.periods.filter((_, j) => j !== idx) } : d)));
  }
  function copyToAll(day: number) {
    setDays((prev) => prev.map((d, i) => (i === day ? d : { isClosed: prev[day].isClosed, periods: prev[day].periods.map((p) => ({ ...p, id: nextId() })) })));
  }

  const hoursJson = JSON.stringify(
    days.flatMap((d, dayOfWeek) => (d.isClosed ? [{ dayOfWeek, periodName: "Closed", open: "00:00", close: "00:00", isClosed: true }] : d.periods.map((p) => ({ dayOfWeek, periodName: p.periodName, open: p.open, close: p.close, isClosed: false })))),
  );

  return (
    <ActionForm action={action} className="space-y-6">
      <input type="hidden" name="hours" value={hoursJson} />

      <section className="space-y-3">
        <h2 className="text-base font-bold">Weekly hours</h2>
        {days.map((d, day) => (
          <div key={day} className="rounded-2xl border border-gray-200 bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold">{DAYS_OF_WEEK[day]}</span>
              <label className="press-soft flex items-center gap-2 text-sm">
                <input type="checkbox" checked={d.isClosed} onChange={(e) => updateDay(day, { isClosed: e.target.checked })} className="h-5 w-5 accent-brand-600" />
                Closed
              </label>
            </div>
            <Disclosure open={!d.isClosed}>
              <MotionList as="div" className="mt-3 space-y-2">
                {d.periods.map((p, idx) => (
                  <div key={p.id} className="grid grid-cols-12 items-center gap-2">
                    <input aria-label="Period name" value={p.periodName} onChange={(e) => updatePeriod(day, idx, { periodName: e.target.value })} className={`${inputClass} col-span-12 min-h-11 sm:col-span-4`} />
                    <input aria-label="Opens" type="time" value={p.open} onChange={(e) => updatePeriod(day, idx, { open: e.target.value })} className={`${inputClass} col-span-5 min-h-11 px-2 sm:col-span-3`} required />
                    <input aria-label="Closes" type="time" value={p.close} onChange={(e) => updatePeriod(day, idx, { close: e.target.value })} className={`${inputClass} col-span-5 min-h-11 px-2 sm:col-span-3`} required />
                    <button type="button" onClick={() => removePeriod(day, idx)} disabled={d.periods.length === 1} className="press col-span-2 min-h-11 rounded-xl text-sm font-semibold text-red-600 disabled:text-gray-300" aria-label="Remove period">
                      ✕
                    </button>
                  </div>
                ))}
                <div key="actions" className="flex flex-wrap gap-3 pt-1">
                  <button type="button" onClick={() => addPeriod(day)} className="press-soft text-sm font-semibold text-brand-700">
                    + Add service period
                  </button>
                  <button type="button" onClick={() => copyToAll(day)} className="press-soft text-sm font-semibold text-gray-500">
                    Copy to all days
                  </button>
                </div>
              </MotionList>
            </Disclosure>
          </div>
        ))}
      </section>

      <FormFooter state={state} pending={pending} mode={mode} backHref={backHref} />
      {mode === "onboarding" && nextHref ? <Skip href={nextHref} /> : null}
    </ActionForm>
  );
}

/** Skip saves nothing, so it is the one forward move that can honestly leave before the server answers (spec §8.3). */
function Skip({ href }: { href: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      full
      onClick={(e) => {
        leaveGuided(e.currentTarget, "forward");
        window.location.href = href;
      }}
    >
      Skip for now (uses 11 AM – 9 PM daily)
    </Button>
  );
}
