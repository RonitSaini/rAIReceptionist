import { prisma } from "./prisma";
import { googleCalendarConfigured, listCalendars, type CalendarSummary } from "./google-calendar";

/** Serializable connection summary for the settings / onboarding UI. */
export type GoogleCalendarView = {
  configured: boolean;
  connected: boolean;
  email: string | null;
  calendarId: string | null;
  calendarName: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  calendars: CalendarSummary[];
};

/** Just enough to offer the connection and say whether it is live. No calendar list. */
export type GoogleCalendarStatus = {
  configured: boolean;
  connected: boolean;
  calendarName: string | null;
  lastError: string | null;
};

/**
 * The cheap read, for pages whose job is something else.
 *
 * getGoogleCalendarView() calls listCalendars() over the network so the settings card can offer a
 * picker. A diary page only needs to know whether to show "Connect", and must not pay a round trip
 * to Google on every render to find that out — so this stops at the row.
 */
export async function getGoogleCalendarStatus(accountId: string): Promise<GoogleCalendarStatus> {
  const configured = googleCalendarConfigured();
  const conn = await prisma.googleCalendarConnection.findUnique({
    where: { accountId },
    select: { calendarId: true, calendarName: true, lastError: true },
  });
  return {
    configured,
    connected: !!conn,
    calendarName: conn?.calendarName ?? conn?.calendarId ?? null,
    lastError: conn?.lastError ?? null,
  };
}

export async function getGoogleCalendarView(accountId: string): Promise<GoogleCalendarView> {
  const configured = googleCalendarConfigured();
  const conn = await prisma.googleCalendarConnection.findUnique({ where: { accountId } });
  if (!conn) return { configured, connected: false, email: null, calendarId: null, calendarName: null, lastSyncedAt: null, lastError: null, calendars: [] };
  let calendars: CalendarSummary[] = [];
  if (configured) {
    try {
      calendars = await listCalendars(conn);
    } catch {
      calendars = [];
    }
  }
  return {
    configured,
    connected: true,
    email: conn.email,
    calendarId: conn.calendarId,
    calendarName: conn.calendarName ?? calendars.find((c) => c.id === conn.calendarId)?.name ?? null,
    lastSyncedAt: conn.lastSyncedAt?.toISOString() ?? null,
    lastError: conn.lastError,
    calendars,
  };
}
