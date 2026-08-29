"use client";

import { useActionState, useEffect, useState } from "react";
import type { ActionState } from "@/lib/form";
import { SEATING_PREFERENCES } from "@/lib/constants";
import { Field, Input, Select, Textarea, Toggle } from "@/components/ui";
import { FormFooter } from "@/components/form-footer";

type Slot = { time: string; label: string; available: boolean; reason?: string; coversSeated: number };
type Availability = { closed: boolean; requiresManager: boolean; slots: Slot[] };

export type ReservationFormValues = {
  id?: string;
  guestName: string;
  guestPhone: string;
  partySize: number;
  date: string;
  time: string;
  seatingPreference: string;
  specialRequests: string;
  isWaitlist: boolean;
};

export function ReservationForm({ action, initial, largePartyThreshold }: { action: (prev: ActionState, fd: FormData) => Promise<ActionState>; initial: ReservationFormValues; largePartyThreshold: number }) {
  const [state, formAction, pending] = useActionState(action, null);
  const [date, setDate] = useState(initial.date);
  const [partySize, setPartySize] = useState(initial.partySize);
  const [time, setTime] = useState(initial.time);
  // Availability is keyed by the date/party it was fetched for; "loading" is derived, not stored.
  const [result, setResult] = useState<{ key: string; data: Availability | null } | null>(null);
  const key = `${date}|${partySize}`;
  const availability = result?.key === key ? result.data : null;
  const loading = !!date && partySize >= 1 && result?.key !== key;

  useEffect(() => {
    if (!date || partySize < 1) return;
    let cancelled = false;
    const q = new URLSearchParams({ date, partySize: String(partySize) });
    if (initial.id) q.set("exclude", initial.id);
    fetch(`/api/availability?${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Availability | null) => {
        if (!cancelled) setResult({ key: `${date}|${partySize}`, data });
      })
      .catch(() => {
        if (!cancelled) setResult({ key: `${date}|${partySize}`, data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [date, partySize, initial.id]);

  const slots = availability?.slots ?? [];
  const selectedSlot = slots.find((s) => s.time === time);
  const timeInList = !!selectedSlot;

  return (
    <form action={formAction} className="space-y-4">
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      <Field label="Guest name" htmlFor="guestName">
        <Input id="guestName" name="guestName" defaultValue={initial.guestName} required autoComplete="off" />
      </Field>
      <Field label="Guest phone" htmlFor="guestPhone" hint="Used for the confirmation text.">
        <Input id="guestPhone" name="guestPhone" type="tel" inputMode="tel" defaultValue={initial.guestPhone} placeholder="(555) 123-4567" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Party size" htmlFor="partySize">
          <Input id="partySize" name="partySize" type="number" min={1} max={500} inputMode="numeric" value={partySize} onChange={(e) => setPartySize(Number(e.target.value) || 0)} required />
        </Field>
        <Field label="Date" htmlFor="date">
          <Input id="date" name="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
      </div>
      {partySize > largePartyThreshold ? <p className="text-sm font-semibold text-amber-700">Party of {partySize} is above your large-party threshold ({largePartyThreshold}). The AI would escalate this to a manager; you can still book it manually.</p> : null}

      <Field label="Time" htmlFor="time" hint={loading ? "Checking availability…" : availability?.closed ? "You're closed that day. You can still enter a time manually." : "Full slots are marked; you can still override manually."}>
        {slots.length > 0 ? (
          <Select id="time" name="time" value={timeInList ? time : "__custom"} onChange={(e) => setTime(e.target.value === "__custom" ? "" : e.target.value)} required>
            {slots.map((s) => (
              <option key={s.time} value={s.time}>
                {s.label}
                {!s.available ? (s.reason === "past" ? " (past)" : " (full)") : ""}
                {s.coversSeated > 0 ? ` · ${s.coversSeated} seated` : ""}
              </option>
            ))}
            <option value="__custom">Other time…</option>
          </Select>
        ) : null}
        {slots.length === 0 || !timeInList ? <Input id="time-custom" name={slots.length === 0 || !timeInList ? "time" : "time-ignored"} type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-2" required /> : null}
      </Field>
      {selectedSlot && !selectedSlot.available && selectedSlot.reason !== "past" ? <p className="text-sm font-semibold text-amber-700">That slot is full for a party of {partySize}. Booking anyway will exceed your limits.</p> : null}

      <Field label="Seating preference" htmlFor="seatingPreference">
        <Select id="seatingPreference" name="seatingPreference" defaultValue={initial.seatingPreference}>
          <option value="">None</option>
          {SEATING_PREFERENCES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Special requests" htmlFor="specialRequests">
        <Textarea id="specialRequests" name="specialRequests" defaultValue={initial.specialRequests} rows={2} placeholder="Birthday, allergy, stroller…" />
      </Field>
      <Toggle name="isWaitlist" label="Waitlist entry" description="Not a confirmed booking — call the guest if a table opens." defaultChecked={initial.isWaitlist} />

      <FormFooter state={state} pending={pending} mode="settings" submitLabel={initial.id ? "Save changes" : "Book it"} />
    </form>
  );
}
