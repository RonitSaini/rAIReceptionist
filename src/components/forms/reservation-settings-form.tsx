"use client";

import { useActionState } from "react";
import { saveReservationSettings } from "@/actions/onboarding";
import type { AccountView } from "@/lib/serialize";
import { Button, Field, Input, Select } from "@/components/ui";
import { FormFooter, type FormMode } from "@/components/form-footer";

export function ReservationSettingsForm({ account, mode, googleConnected = false }: { account: AccountView; mode: FormMode; googleConnected?: boolean }) {
  const [state, action, pending] = useActionState(saveReservationSettings, null);

  return (
    <form action={action} className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-base font-bold">Reservation book</h2>
        <div className="rounded-2xl border-2 border-brand-600 bg-brand-50 p-4">
          <p className="font-semibold text-brand-900">Built-in book (default)</p>
          <p className="text-sm text-brand-800">Reservations live in CallCover. You manage them on the Reservations page.</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="font-semibold">Also sync to Google Calendar</p>
          <p className="text-sm text-gray-500">Optional. Reservations also appear on your calendar, and busy times block availability. The built-in book stays the source of truth.</p>
          <Button type="button" variant="secondary" className="mt-3" disabled title="Available in a later release">
            {googleConnected ? "Connected" : "Connect Google Calendar (coming soon)"}
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold">Booking rules</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Table turn (minutes)" htmlFor="tableTurnMinutes" hint="How long a table is held.">
            <Input id="tableTurnMinutes" name="tableTurnMinutes" type="number" min={15} max={360} step={15} inputMode="numeric" defaultValue={account.tableTurnMinutes} />
          </Field>
          <Field label="Reservation interval" htmlFor="reservationIntervalMinutes" hint="Times offered to callers.">
            <Select id="reservationIntervalMinutes" name="reservationIntervalMinutes" defaultValue={String(account.reservationIntervalMinutes)}>
              <option value="15">Every 15 min</option>
              <option value="30">Every 30 min</option>
              <option value="45">Every 45 min</option>
              <option value="60">Every hour</option>
            </Select>
          </Field>
          <Field label="Seating capacity" htmlFor="seatingCapacity" hint="Total seats. Blank = unlimited.">
            <Input id="seatingCapacity" name="seatingCapacity" type="number" min={1} inputMode="numeric" defaultValue={account.seatingCapacity ?? ""} placeholder="e.g. 60" />
          </Field>
          <Field label="Max covers per slot" htmlFor="maxCoversPerSlot" hint="Guests seated at one time slot. Blank = unlimited.">
            <Input id="maxCoversPerSlot" name="maxCoversPerSlot" type="number" min={1} inputMode="numeric" defaultValue={account.maxCoversPerSlot ?? ""} placeholder="e.g. 20" />
          </Field>
        </div>
      </section>

      <FormFooter state={state} pending={pending} mode={mode} backHref="/onboarding/4" />
    </form>
  );
}
