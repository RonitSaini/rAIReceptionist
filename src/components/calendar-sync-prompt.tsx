import Link from "next/link";
import type { GoogleCalendarStatus } from "@/lib/google-calendar-view";
import { googleCalendarBanner, needsCalendarReconnect } from "@/lib/calendar-sync-ui";
import { Alert, LinkButton, StatusDot } from "@/components/ui";
import { DrawIcon } from "@/components/draw-icon";

/**
 * The offer to link Google Calendar, on the page where the diary actually is.
 *
 * The thought "these should be on my phone's calendar" happens while looking at the week, not while
 * in Settings — so every profession's schedule page makes the offer here. This is the offer and a
 * status line, deliberately not a second manager: <GoogleCalendarCard> in Settings stays the one
 * place to switch calendars, resync or disconnect, and once connected this shrinks to a line that
 * links there.
 *
 * Server component: a diary page should not ship a client bundle to render a link, and it reads the
 * cheap status (getGoogleCalendarStatus) rather than the one that calls Google.
 */
export function CalendarSyncPrompt({
  status,
  returnTo,
  manageHref,
  blurb,
  itemsLabel,
  googleStatus,
  googleMessage,
}: {
  status: GoogleCalendarStatus;
  returnTo: string;
  manageHref: string;
  blurb: string;
  itemsLabel: string;
  googleStatus?: string;
  googleMessage?: string;
}) {
  // Nothing to offer on a deployment without Google credentials, and no point saying so here —
  // the settings card is where that diagnosis belongs.
  if (!status.configured) return null;

  const banner = googleCalendarBanner(googleStatus, itemsLabel);
  const connectHref = `/api/google-calendar/connect?returnTo=${encodeURIComponent(returnTo)}`;
  const reconnect = needsCalendarReconnect(status.lastError);

  if (status.connected && !reconnect) {
    return (
      <div className="space-y-3">
        {banner ? (
          <Alert kind={banner.kind}>
            {banner.text}
            {googleStatus === "error" && googleMessage ? ` ${googleMessage}` : ""}
          </Alert>
        ) : null}
        <p className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
          <span className="text-brand-600">
            <StatusDot />
          </span>
          Syncing to {status.calendarName ? <span className="font-semibold text-gray-700">{status.calendarName}</span> : "Google Calendar"}
          <Link href={manageHref} className="font-semibold text-brand-700 hover:underline">
            Manage
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {banner ? (
        <Alert kind={banner.kind}>
          {banner.text}
          {googleStatus === "error" && googleMessage ? ` ${googleMessage}` : ""}
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-surface p-4">
        <div className="flex min-w-0 items-start gap-3">
          <DrawIcon name="calendar" size={20} draw={false} className="mt-0.5 shrink-0 text-gray-400" />
          <div className="min-w-0">
            <p className="font-semibold">{reconnect ? "Reconnect Google Calendar" : "Also sync to Google Calendar"}</p>
            <p className="mt-1 text-sm text-gray-500">
              {reconnect ? "Google is no longer accepting this connection, so new bookings are not reaching your calendar." : blurb}
            </p>
          </div>
        </div>
        <LinkButton href={connectHref} variant="secondary" size="sm" prefetch={false} className="shrink-0">
          {reconnect ? "Reconnect" : "Connect"}
        </LinkButton>
      </div>
    </div>
  );
}
