"use client";

import { useActionState, useState } from "react";
import type { BusinessHours } from "@prisma/client";
import { saveHours } from "@/actions/onboarding";
import { DAYS_OF_WEEK } from "@/lib/constants";
import { ALL_DAY_CLOSE, ALL_DAY_OPEN, isAllDay } from "@/lib/time";
import { leaveGuided } from "@/lib/motion";
import { Button, Checkbox, inputClass } from "@/components/ui";
import { FormFooter, type FormMode } from "@/components/form-footer";
import { ActionForm } from "@/components/action-form";
import { Disclosure } from "@/components/disclosure";
import { MotionList, useRowFocus } from "@/components/motion-list";

type Period = { id: number; periodName: string; open: string; close: string };

let seq = 0;
/** Local row identity, so a removed period can leave (MotionList keys) — never an index, never sent to the server. */
const nextId = () => ++seq;
/**
 * `isAllDay` is a day that never closes. It is a third state alongside open-with-periods and closed,
 * not a fourth period: a business open round the clock has no service windows to describe, so the
 * period rows are put away while it is on (the same treatment Closed already gets).
 *
 * The periods are KEPT in state underneath rather than cleared, so turning 24 hours back off returns
 * the day to whatever it said before instead of a blank pair of time inputs.
 */
type DayState = { isClosed: boolean; isAllDay: boolean; periods: Period[] };

const defaultPeriod = () => ({ id: nextId(), periodName: "Service Hours", open: "11:00", close: "21:00" });

function buildDays(hours: BusinessHours[]): DayState[] {
  return DAYS_OF_WEEK.map((_, day) => {
    const rows = hours.filter((h) => h.dayOfWeek === day).sort((a, b) => a.sortOrder - b.sortOrder);
    if (rows.length === 0) return { isClosed: false, isAllDay: false, periods: [defaultPeriod()] };
    if (rows.every((r) => r.isClosed)) return { isClosed: true, isAllDay: false, periods: [defaultPeriod()] };
    const open = rows.filter((r) => !r.isClosed);
    // One period covering midnight to midnight is what a saved 24-hour day looks like coming back.
    if (open.length === 1 && isAllDay(open[0].open, open[0].close)) return { isClosed: false, isAllDay: true, periods: [defaultPeriod()] };
    return { isClosed: false, isAllDay: false, periods: open.map((r) => ({ id: nextId(), periodName: r.periodName, open: r.open, close: r.close })) };
  });
}

/**
 * Three <MotionList>s, one per level that grows when a period is added (motion spec §12): the period
 * rows enter and leave in their day's list, where the add/copy row already slid; the day cards below
 * slide in the week's list; the footer (and Skip) slide in the form. The new period is scrolled into
 * view and its name field takes focus as it arrives (`useRowFocus`).
 */
export function HoursForm({ hours, mode, backHref, nextHref }: { hours: BusinessHours[]; mode: FormMode; backHref?: string; nextHref?: string }) {
  const [state, action, pending] = useActionState(saveHours, null);
  const [days, setDays] = useState<DayState[]>(() => buildDays(hours));
  const { focusRow, rowRef } = useRowFocus<number>();

  function updateDay(day: number, patch: Partial<DayState>) {
    setDays((prev) => prev.map((d, i) => (i === day ? { ...d, ...patch } : d)));
  }
  function updatePeriod(day: number, idx: number, patch: Partial<Period>) {
    setDays((prev) => prev.map((d, i) => (i === day ? { ...d, periods: d.periods.map((p, j) => (j === idx ? { ...p, ...patch } : p)) } : d)));
  }
  function addPeriod(day: number) {
    // One new period, name left blank for the owner to fill in; what's already there stays put.
    const period = { id: nextId(), periodName: "", open: "21:00", close: "23:00" };
    setDays((prev) => prev.map((d, i) => (i === day ? { ...d, periods: [...d.periods, period] } : d)));
    focusRow(period.id);
  }
  function removePeriod(day: number, idx: number) {
    setDays((prev) => prev.map((d, i) => (i === day ? { ...d, periods: d.periods.filter((_, j) => j !== idx) } : d)));
  }
  function copyToAll(day: number) {
    setDays((prev) => prev.map((d, i) => (i === day ? d : { isClosed: prev[day].isClosed, isAllDay: prev[day].isAllDay, periods: prev[day].periods.map((p) => ({ ...p, id: nextId() })) })));
  }

  const hoursJson = JSON.stringify(
    days.flatMap((d, dayOfWeek) => {
      if (d.isClosed) return [{ dayOfWeek, periodName: "Closed", open: "00:00", close: "00:00", isClosed: true }];
      // Midnight to midnight is the convention every engine already reads as "never closes"
      // (src/lib/time.ts). saveHours recognises this exact pair and lets it past the guard that
      // otherwise refuses an open and close at the same time.
      if (d.isAllDay) return [{ dayOfWeek, periodName: "Open 24 hours", open: ALL_DAY_OPEN, close: ALL_DAY_CLOSE, isClosed: false }];
      return d.periods.map((p) => ({ dayOfWeek, periodName: p.periodName, open: p.open, close: p.close, isClosed: false }));
    }),
  );

  return (
    <ActionForm action={action}>
      <MotionList as="div" className="space-y-6">
        <input key="hours" type="hidden" name="hours" value={hoursJson} />

        <MotionList key="week" as="section" className="space-y-3">
          <h2 key="title" className="text-base font-bold">Weekly hours</h2>
          {days.map((d, day) => (
            <div key={day} className="rounded-2xl border border-gray-200 bg-surface p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">{DAYS_OF_WEEK[day]}</span>
                {/* Mutually exclusive by construction: a day cannot be shut and open round the clock,
                    so ticking either one clears the other rather than leaving both on. */}
                <div className="flex items-center gap-4">
                  <Checkbox variant="inline" label="24 hours" checked={d.isAllDay} onChange={(v) => updateDay(day, { isAllDay: v, isClosed: v ? false : d.isClosed })} className="text-sm" />
                  <Checkbox variant="inline" label="Closed" checked={d.isClosed} onChange={(v) => updateDay(day, { isClosed: v, isAllDay: v ? false : d.isAllDay })} className="text-sm" />
                </div>
              </div>
              {d.isAllDay ? <p className="mt-2 text-sm text-gray-500">Open all day and all night — {DAYS_OF_WEEK[day]} has no opening or closing time.</p> : null}
              <Disclosure open={!d.isClosed && !d.isAllDay}>
                <MotionList as="div" className="mt-3 space-y-2">
                  {d.periods.map((p, idx) => (
                    <div key={p.id} ref={rowRef(p.id)} className="grid grid-cols-12 items-center gap-2">
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
        </MotionList>

        <FormFooter key="footer" state={state} pending={pending} mode={mode} backHref={backHref} />
        {mode === "onboarding" && nextHref ? <Skip key="skip" href={nextHref} /> : null}
      </MotionList>
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
