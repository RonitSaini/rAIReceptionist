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
