"use client";

import { useActionState, useState, useTransition } from "react";
import { saveReservationSettings } from "@/actions/onboarding";
import { chooseGoogleCalendar, disconnectGoogleCalendar, resyncGoogleCalendar } from "@/actions/google-calendar";
import type { AccountView } from "@/lib/serialize";
import type { GoogleCalendarView } from "@/lib/google-calendar-view";
import type { ActionState } from "@/lib/form";
import { Alert, Badge, Button, Field, Input, LinkButton, Select, StatusDot } from "@/components/ui";
import { FormFooter, type FormMode } from "@/components/form-footer";
import { ActionForm } from "@/components/action-form";

const GOOGLE_MESSAGES: Record<string, { kind: "success" | "error" | "info"; text: string }> = {
  connected: { kind: "success", text: "Google Calendar connected. Upcoming reservations were added to your calendar." },
  denied: { kind: "info", text: "Google access was cancelled. Nothing changed." },
  not_configured: { kind: "info", text: "Google Calendar isn't set up on this deployment yet (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)." },
  invalid_state: { kind: "error", text: "That connection link expired. Please try again." },
  wrong_account: { kind: "error", text: "That link was started from a different account. Please try again." },
  missing_code: { kind: "error", text: "Google didn't return an authorization code. Please try again." },
  error: { kind: "error", text: "Connecting to Google failed." },
};

export function ReservationSettingsForm({ account, mode, google, googleStatus, googleMessage }: { account: AccountView; mode: FormMode; google?: GoogleCalendarView; googleStatus?: string; googleMessage?: string }) {
  const [state, action, pending] = useActionState(saveReservationSettings, null);
  const [calState, calAction, calPending] = useActionState(chooseGoogleCalendar, null);
  const [result, setResult] = useState<ActionState>(null);
  const [busy, startTransition] = useTransition();
  const run = (fn: () => Promise<ActionState>) => startTransition(async () => setResult(await fn()));
  const returnTo = mode === "onboarding" ? "/onboarding/5" : "/settings?tab=reservations";
  const banner = googleStatus ? GOOGLE_MESSAGES[googleStatus] : null;

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-base font-bold">Reservation book</h2>
        <div className="rounded-2xl border-2 border-brand-600 bg-brand-50 p-4">
          <p className="font-semibold text-brand-900">Built-in book (default)</p>
          <p className="text-sm text-brand-800">Reservations live in FrontDesk AI. You manage them on the Reservations page.</p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">Also sync to Google Calendar</p>
            {google?.connected ? (
              <Badge tone="green" className="gap-1.5">
                <StatusDot /> Connected
              </Badge>
            ) : (
              <Badge tone="gray">Not connected</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500">Optional. Every reservation also appears on your calendar, and anything else on that calendar blocks those times for phone bookings. The built-in book stays the source of truth.</p>

          {banner ? (
            <div className="mt-3">
              <Alert kind={banner.kind}>
                {banner.text}
                {googleStatus === "error" && googleMessage ? ` ${googleMessage}` : ""}
              </Alert>
            </div>
          ) : null}

          {!google?.connected ? (
            <div className="mt-3">
              {google?.configured ? (
                <LinkButton href={`/api/google-calendar/connect?returnTo=${encodeURIComponent(returnTo)}`} variant="secondary" prefetch={false}>
                  Connect Google Calendar
                </LinkButton>
              ) : (
                <Button type="button" variant="secondary" disabled title="Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable">
                  Connect Google Calendar
                </Button>
              )}
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <p className="text-sm text-gray-700">
                {google.email ? (
                  <>
                    Signed in as <span className="font-semibold">{google.email}</span> ·{" "}
                  </>
                ) : null}
                Writing to <span className="font-semibold">{google.calendarName ?? google.calendarId}</span>
                {google.lastSyncedAt ? <span className="text-gray-500"> · last synced {new Date(google.lastSyncedAt).toLocaleString("en-US")}</span> : null}
              </p>
              {google.lastError ? <Alert>Last sync problem: {google.lastError}</Alert> : null}

              {google.calendars.length > 1 ? (
                <ActionForm action={calAction} className="flex flex-wrap items-end gap-2">
                  <Field label="Calendar" htmlFor="calendarId" className="min-w-56 flex-1">
                    <Select id="calendarId" name="calendarId" defaultValue={google.calendarId ?? "primary"}>
                      {google.calendars.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {c.primary ? " (primary)" : ""}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Button type="submit" variant="secondary" disabled={calPending}>
                    {calPending ? "Saving…" : "Use this calendar"}
                  </Button>
                  {calState && !calState.ok && calState.error ? <Alert>{calState.error}</Alert> : null}
                  {calState?.ok && calState.message ? <Alert kind="success">{calState.message}</Alert> : null}
                </ActionForm>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => run(resyncGoogleCalendar)}>
                  Sync upcoming reservations now
                </Button>
                <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => run(disconnectGoogleCalendar)}>
                  Disconnect
                </Button>
              </div>
              {result && !result.ok && result.error ? <Alert>{result.error}</Alert> : null}
              {result?.ok && result.message ? <Alert kind="success">{result.message}</Alert> : null}
            </div>
          )}
        </div>
      </section>

      <ActionForm action={action} className="space-y-6">
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
      </ActionForm>
    </div>
  );
}
