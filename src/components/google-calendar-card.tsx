"use client";

import { useActionState, useState, useTransition } from "react";
import { chooseGoogleCalendar, disconnectGoogleCalendar, resyncGoogleCalendar } from "@/actions/google-calendar";
import type { GoogleCalendarView } from "@/lib/google-calendar-view";
import type { ActionState } from "@/lib/form";
import { Alert, Badge, Button, Field, LinkButton, Select, StatusDot } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { friendlyProviderError } from "@/lib/provider-errors";
import { googleCalendarBanner, needsCalendarReconnect } from "@/lib/calendar-sync-ui";

/**
 * The "Connected calendar" card: connect, pick a calendar, resync, disconnect. Extracted from
 * ReservationSettingsForm so every profession gets the same one — restaurants keep rendering it
 * inside their reservations form, everyone else gets it on a Settings tab. The two copy props
 * default to the restaurant wording so that extraction changed nothing there.
 *
 * This is the full manager. Each profession's diary page also offers the connection, through the
 * lighter <CalendarSyncPrompt>, and links here for everything beyond connecting; the wording both
 * show comes from @/lib/calendar-sync-ui so the two cannot drift.
 */

export function GoogleCalendarCard({
  google,
  googleStatus,
  googleMessage,
  returnTo,
  blurb = "Optional. Every reservation also appears on your calendar, and anything else on that calendar blocks those times for phone bookings. The built-in book stays the source of truth.",
  itemsLabel = "reservations",
}: {
  google?: GoogleCalendarView;
  googleStatus?: string;
  googleMessage?: string;
  returnTo: string;
  blurb?: string;
  itemsLabel?: string;
}) {
  const [calState, calAction, calPending] = useActionState(chooseGoogleCalendar, null);
  const [result, setResult] = useState<ActionState>(null);
  const [busy, startTransition] = useTransition();
  const run = (fn: () => Promise<ActionState>) => startTransition(async () => setResult(await fn()));
  const banner = googleCalendarBanner(googleStatus, itemsLabel);
  const connectHref = `/api/google-calendar/connect?returnTo=${encodeURIComponent(returnTo)}`;

  return (
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
      <p className="mt-1 text-sm text-gray-500">{blurb}</p>

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
            <LinkButton href={connectHref} variant="secondary" prefetch={false}>
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
          {google.lastError ? (
            needsCalendarReconnect(google.lastError) ? (
              <Alert>
                Reconnect needed — Google is no longer accepting this connection, so new bookings are not reaching your calendar.{" "}
                <a href={connectHref} className="font-semibold underline">
                  Reconnect Google Calendar
                </a>
              </Alert>
            ) : (
              <Alert>Last sync problem: {friendlyProviderError("calendar", google.lastError)}.</Alert>
            )
          ) : null}

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
              Sync upcoming {itemsLabel} now
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
  );
}
