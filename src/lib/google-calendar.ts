import type { Account, GoogleCalendarConnection, Job, Property, Reservation, Unit } from "@prisma/client";
import { prisma } from "./prisma";
import { decrypt, encrypt, signState, verifyState } from "./crypto";
import { appUrl } from "./env";
import { formatUsPhone } from "./form";

/**
 * Google Calendar sync. The built-in book stays the source of truth: every active reservation and
 * every Job with a time on it is mirrored as an event on the connected calendar, and the calendar's
 * *other* events count as busy time when computing availability. Uses fetch against Google's REST
 * APIs — no googleapis package.
 */

const OAUTH_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN = "https://oauth2.googleapis.com/token";
const OAUTH_REVOKE = "https://oauth2.googleapis.com/revoke";
const CAL = "https://www.googleapis.com/calendar/v3";
// The narrowest set that works: event read/write on the chosen calendar (which also covers reading
// its busy times), the *list* of calendars for the picker — not their contents, which is what the
// broader calendar.readonly would have granted — and the address shown as "Signed in as".
export const CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.calendarlist.readonly", "https://www.googleapis.com/auth/userinfo.email"];
const OURS = "frontdesk_reservation_id"; // private extended property marking events we created
const OURS_JOB = "frontdesk_job_id"; // same marker for Job events, so our own work never counts as busy

export function googleCalendarCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}
export const googleCalendarConfigured = () => googleCalendarCredentials() !== null;
export function redirectUri(): string {
  return process.env.GOOGLE_CALENDAR_REDIRECT_URI || `${appUrl()}/api/google-calendar/callback`;
}

export class GoogleError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "GoogleError";
    this.status = status;
  }
}

// ---------- OAuth ----------

export function buildConnectUrl(accountId: string, returnTo = "/settings?tab=reservations"): string {
  const creds = googleCalendarCredentials();
  if (!creds) throw new Error("Google Calendar is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).");
  const p = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: CALENDAR_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent", // guarantees a refresh_token
    include_granted_scopes: "true",
    state: signState({ accountId, returnTo }),
  });
  return `${OAUTH_AUTH}?${p}`;
}

export function parseState(state: string | null): { accountId: string; returnTo: string } | null {
  const s = verifyState<{ accountId?: string; returnTo?: string }>(state);
  return s?.accountId ? { accountId: s.accountId, returnTo: s.returnTo || "/settings?tab=reservations" } : null;
}

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string; scope?: string; token_type: string; id_token?: string };

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const creds = googleCalendarCredentials();
  if (!creds) throw new Error("Google Calendar is not configured.");
  const res = await fetch(OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: creds.clientId, client_secret: creds.clientSecret, ...params }),
  });
  const data = (await res.json().catch(() => ({}))) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok) throw new GoogleError(data.error_description || data.error || `Token request failed (${res.status})`, res.status);
  return data;
}

/** Exchange the OAuth code, look up the Google account email + primary calendar, and store the connection. */
export async function completeConnection(accountId: string, code: string): Promise<GoogleCalendarConnection> {
  const tok = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri() });
  if (!tok.refresh_token) throw new GoogleError("Google didn't return a refresh token — remove FrontDesk AI from your Google account's third-party access and connect again.", 400);
  const expiresAt = new Date(Date.now() + (tok.expires_in - 60) * 1000);

  let email: string | null = null;
  let calendarName: string | null = null;
  try {
    const me = (await gfetch(tok.access_token, "https://www.googleapis.com/oauth2/v3/userinfo")) as { email?: string };
    email = me.email ?? null;
  } catch {}
  try {
    // The calendarList entry, not the Calendars resource: reading calendar metadata directly needs
    // a scope we deliberately no longer ask for, and the list entry carries the same display name.
    const primary = (await gfetch(tok.access_token, `${CAL}/users/me/calendarList/primary`)) as { summary?: string };
    calendarName = primary.summary ?? null;
  } catch {}

  return prisma.googleCalendarConnection.upsert({
    where: { accountId },
    create: { accountId, accessToken: encrypt(tok.access_token), refreshToken: encrypt(tok.refresh_token), expiresAt, calendarId: "primary", calendarName, email, scope: tok.scope ?? null },
    update: { accessToken: encrypt(tok.access_token), refreshToken: encrypt(tok.refresh_token), expiresAt, calendarName, email, scope: tok.scope ?? null, lastError: null },
  });
}

/** Valid access token for the account, refreshing (and persisting) when within a minute of expiry. */
export async function accessTokenFor(conn: GoogleCalendarConnection): Promise<string> {
  if (conn.expiresAt.getTime() > Date.now() + 60_000) return decrypt(conn.accessToken);
  const tok = await tokenRequest({ refresh_token: decrypt(conn.refreshToken), grant_type: "refresh_token" });
  const expiresAt = new Date(Date.now() + (tok.expires_in - 60) * 1000);
  await prisma.googleCalendarConnection.update({ where: { id: conn.id }, data: { accessToken: encrypt(tok.access_token), expiresAt, lastError: null } });
  return tok.access_token;
}

export async function disconnect(accountId: string): Promise<void> {
  const conn = await prisma.googleCalendarConnection.findUnique({ where: { accountId } });
  if (!conn) return;
  try {
    await fetch(`${OAUTH_REVOKE}?token=${encodeURIComponent(decrypt(conn.refreshToken))}`, { method: "POST" });
  } catch {}
  await prisma.googleCalendarConnection.delete({ where: { id: conn.id } });
}

// ---------- Calendar API ----------

async function gfetch(token: string, url: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) } });
  if (res.status === 204) return null;
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = typeof data === "object" && data && "error" in data ? String((data as { error: { message?: string } }).error?.message ?? res.status) : `Google API ${res.status}`;
    throw new GoogleError(msg, res.status);
  }
  return data;
}

export type CalendarSummary = { id: string; name: string; primary: boolean; accessRole: string };

export async function listCalendars(conn: GoogleCalendarConnection): Promise<CalendarSummary[]> {
  const token = await accessTokenFor(conn);
  const data = (await gfetch(token, `${CAL}/users/me/calendarList?minAccessRole=writer`)) as { items?: { id: string; summary: string; primary?: boolean; accessRole: string }[] };
  return (data.items ?? []).map((c) => ({ id: c.id, name: c.summary, primary: !!c.primary, accessRole: c.accessRole }));
}

function eventBody(account: Pick<Account, "businessName" | "timeZone">, r: Reservation) {
  const bits = [`Party of ${r.partySize}`, r.guestPhone ? formatUsPhone(r.guestPhone) : null, r.seatingPreference, r.specialRequests, r.isWaitlist ? "WAITLIST" : null, `Booked via FrontDesk AI (${r.source === "ai" ? "phone" : "staff"})`].filter(Boolean);
  return {
    summary: `${r.isWaitlist ? "Waitlist: " : ""}${r.guestName} · ${r.partySize} — ${account.businessName}`,
    description: bits.join("\n"),
    start: { dateTime: r.startTime.toISOString(), timeZone: account.timeZone },
    end: { dateTime: r.endTime.toISOString(), timeZone: account.timeZone },
    status: r.status === "cancelled" || r.status === "no_show" ? "cancelled" : "confirmed",
    transparency: r.isWaitlist ? "transparent" : "opaque",
    extendedProperties: { private: { [OURS]: r.id } },
    reminders: { useDefault: false },
  };
}

/**
 * Mirror one reservation onto the connected calendar (create, update, or remove when cancelled).
 * Best-effort: failures are recorded on the connection, never thrown into the request that changed the booking.
 */
export async function syncReservationToGoogle(reservationId: string): Promise<{ synced: boolean; reason?: string }> {
  const r = await prisma.reservation.findUnique({ where: { id: reservationId }, include: { account: { include: { googleCalendar: true } } } });
  if (!r) return { synced: false, reason: "reservation not found" };
  const conn = r.account.googleCalendar;
  if (!conn) return { synced: false, reason: "not connected" };
  if (!googleCalendarConfigured()) return { synced: false, reason: "not configured" };
  const calendarId = encodeURIComponent(conn.calendarId);
  try {
    const token = await accessTokenFor(conn);
    const gone = r.status === "cancelled" || r.status === "no_show";
    if (r.googleEventId) {
      if (gone) {
        await gfetch(token, `${CAL}/calendars/${calendarId}/events/${encodeURIComponent(r.googleEventId)}`, { method: "DELETE" }).catch((e: unknown) => {
          if (!(e instanceof GoogleError && (e.status === 404 || e.status === 410))) throw e;
        });
        await prisma.reservation.update({ where: { id: r.id }, data: { googleEventId: null } });
      } else {
        await gfetch(token, `${CAL}/calendars/${calendarId}/events/${encodeURIComponent(r.googleEventId)}`, { method: "PATCH", body: JSON.stringify(eventBody(r.account, r)) });
      }
    } else if (!gone) {
      const ev = (await gfetch(token, `${CAL}/calendars/${calendarId}/events`, { method: "POST", body: JSON.stringify(eventBody(r.account, r)) })) as { id: string };
      await prisma.reservation.update({ where: { id: r.id }, data: { googleEventId: ev.id } });
    }
    await prisma.googleCalendarConnection.update({ where: { id: conn.id }, data: { lastSyncedAt: new Date(), lastError: null } });
    return { synced: true };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.warn("[google-calendar] sync failed", reservationId, reason);
    await prisma.googleCalendarConnection.update({ where: { id: conn.id }, data: { lastError: reason.slice(0, 300) } }).catch(() => {});
    return { synced: false, reason };
  }
}

// ---------- Jobs ----------

/** What the event is called, per kind of work. The kind *is* the booking noun: a roofer's estimate
 *  and a vet's appointment should not both land on a calendar as "Job". */
const JOB_NOUN: Record<Job["kind"], string> = {
  service_call: "Service call",
  estimate: "Estimate",
  dispatch: "Dispatch",
  shop_visit: "Appointment",
  work_order: "Work order",
};

type JobForSync = Job & { property: Property | null; unit: Unit | null };

/**
 * The stretch of calendar a job occupies, or null when it occupies none (a work order waiting for a
 * time). Scheduled work uses its slot. A dispatch with no slot is promised "someone within the
 * response window", so that window — from the moment of the request — is what shows as active.
 */
export function jobEventWindow(
  job: Pick<Job, "kind" | "scheduledStart" | "scheduledEnd" | "createdAt">,
  account: Pick<Account, "jobSlotMinutes" | "responseTimeMaxMinutes">,
): { start: Date; end: Date } | null {
  if (job.scheduledStart) {
    const minutes = Math.max(15, account.jobSlotMinutes || 120);
    return { start: job.scheduledStart, end: job.scheduledEnd ?? new Date(job.scheduledStart.getTime() + minutes * 60_000) };
  }
  if (job.kind === "dispatch") {
    const minutes = account.responseTimeMaxMinutes ?? 60;
    return { start: job.createdAt, end: new Date(job.createdAt.getTime() + minutes * 60_000) };
  }
  return null;
}

/**
 * Whether the job's mirrored event should be REMOVED from the calendar. Two ways out: the job was
 * cancelled, or it no longer occupies any window (a work order whose time was taken away).
 *
 * A COMPLETED job's event deliberately stays. The visit happened; the calendar is the record of the
 * day, and deleting history the moment a tap marks it done would make every operator's afternoon
 * silently vanish. This is locked by tests/job-google-sync.test.mjs — it is not a bug to fix.
 */
export function jobEventGone(job: Pick<Job, "kind" | "status" | "scheduledStart" | "scheduledEnd" | "createdAt">, account: Pick<Account, "jobSlotMinutes" | "responseTimeMaxMinutes">): boolean {
  return job.status === "cancelled" || jobEventWindow(job, account) === null;
}

function jobEventBody(account: Pick<Account, "businessName" | "timeZone">, job: JobForSync, window: { start: Date; end: Date }) {
  const place = job.property ? [[job.property.name, job.unit?.label].filter(Boolean).join(" "), job.property.address].filter(Boolean).join(" — ") : job.address;
  // Job.details is whatever the handler deliberately kept (category, vehicle, pet, preferred times…),
  // different per archetype. Primitive entries are rendered as-is rather than schema'd per vertical.
  const details = job.details && typeof job.details === "object" && !Array.isArray(job.details) ? Object.entries(job.details as Record<string, unknown>) : [];
  const bits = [
    place,
    job.customerPhone ? formatUsPhone(job.customerPhone) : null,
    job.description,
    ...details.filter(([, v]) => ["string", "number", "boolean"].includes(typeof v) && String(v).length <= 200).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`),
    job.assignedTo ? `Assigned to ${job.assignedTo}` : null,
    `Booked via FrontDesk AI (${job.source === "ai" ? "phone" : "staff"})`,
  ].filter(Boolean);
  return {
    summary: `${job.isEmergency ? "EMERGENCY " : ""}${JOB_NOUN[job.kind] ?? "Job"}: ${job.customerName} — ${account.businessName}`,
    description: bits.join("\n"),
    start: { dateTime: window.start.toISOString(), timeZone: account.timeZone },
    end: { dateTime: window.end.toISOString(), timeZone: account.timeZone },
    status: "confirmed",
    transparency: "opaque",
    extendedProperties: { private: { [OURS_JOB]: job.id } },
    reminders: { useDefault: false },
  };
}

/**
 * Mirror one job onto the connected calendar: create when it gains a window, patch when it moves,
 * delete when it is cancelled (or loses its window). Best-effort, same contract as reservations —
 * a failure is recorded on the Job (and retried by the escalation sweep) rather than thrown into
 * the booking or dispatch that caused it.
 */
export async function syncJobToGoogle(jobId: string): Promise<{ synced: boolean; reason?: string }> {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: { account: { include: { googleCalendar: true } }, property: true, unit: true } });
  if (!job) return { synced: false, reason: "job not found" };
  const conn = job.account.googleCalendar;
  if (!conn) return { synced: false, reason: "not connected" };
  if (!googleCalendarConfigured()) return { synced: false, reason: "not configured" };
  const calendarId = encodeURIComponent(conn.calendarId);
  const window = jobEventWindow(job, job.account);
  const gone = jobEventGone(job, job.account);
  try {
    const token = await accessTokenFor(conn);
    if (job.googleEventId) {
      if (gone) {
        await gfetch(token, `${CAL}/calendars/${calendarId}/events/${encodeURIComponent(job.googleEventId)}`, { method: "DELETE" }).catch((e: unknown) => {
          if (!(e instanceof GoogleError && (e.status === 404 || e.status === 410))) throw e;
        });
        await prisma.job.update({ where: { id: job.id }, data: { googleEventId: null, googleSyncError: null } });
      } else {
        await gfetch(token, `${CAL}/calendars/${calendarId}/events/${encodeURIComponent(job.googleEventId)}`, { method: "PATCH", body: JSON.stringify(jobEventBody(job.account, job, window!)) });
        if (job.googleSyncError) await prisma.job.update({ where: { id: job.id }, data: { googleSyncError: null } });
      }
    } else if (!gone) {
      const ev = (await gfetch(token, `${CAL}/calendars/${calendarId}/events`, { method: "POST", body: JSON.stringify(jobEventBody(job.account, job, window!)) })) as { id: string };
      await prisma.job.update({ where: { id: job.id }, data: { googleEventId: ev.id, googleSyncError: null } });
    } else if (job.googleSyncError) {
      await prisma.job.update({ where: { id: job.id }, data: { googleSyncError: null } }); // nothing left to sync
    }
    await prisma.googleCalendarConnection.update({ where: { id: conn.id }, data: { lastSyncedAt: new Date(), lastError: null } });
    return { synced: true };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.warn("[google-calendar] job sync failed", jobId, reason);
    await prisma.job.update({ where: { id: job.id }, data: { googleSyncError: reason.slice(0, 300) } }).catch(() => {});
    await prisma.googleCalendarConnection.update({ where: { id: conn.id }, data: { lastError: reason.slice(0, 300) } }).catch(() => {});
    return { synced: false, reason };
  }
}

/** Re-run every job sync that failed, oldest first. Called from the escalation sweep. */
export async function retryFailedJobSyncs(limit = 20): Promise<{ attempted: number; synced: number }> {
  if (!googleCalendarConfigured()) return { attempted: 0, synced: 0 };
  const failed = await prisma.job.findMany({
    where: { googleSyncError: { not: null }, account: { googleCalendar: { isNot: null } } },
    orderBy: { updatedAt: "asc" },
    take: limit,
    select: { id: true },
  });
  let synced = 0;
  for (const j of failed) if ((await syncJobToGoogle(j.id)).synced) synced++;
  return { attempted: failed.length, synced };
}

export type BusyBlock = { start: Date; end: Date; title?: string };

/**
 * Busy periods on the connected calendar within [start, end) that were NOT created by FrontDesk AI
 * (our own reservation and job events are already counted by the built-in book). All-day events are ignored.
 */
export async function googleBusyBlocks(accountId: string, start: Date, end: Date): Promise<BusyBlock[]> {
  const conn = await prisma.googleCalendarConnection.findUnique({ where: { accountId } });
  if (!conn || !googleCalendarConfigured()) return [];
  try {
    const token = await accessTokenFor(conn);
    const p = new URLSearchParams({ timeMin: start.toISOString(), timeMax: end.toISOString(), singleEvents: "true", maxResults: "250", orderBy: "startTime" });
    const data = (await gfetch(token, `${CAL}/calendars/${encodeURIComponent(conn.calendarId)}/events?${p}`)) as {
      items?: { status?: string; transparency?: string; summary?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string }; extendedProperties?: { private?: Record<string, string> } }[];
    };
    return (data.items ?? [])
      .filter((ev) => ev.status !== "cancelled" && ev.transparency !== "transparent" && ev.start?.dateTime && ev.end?.dateTime && !ev.extendedProperties?.private?.[OURS] && !ev.extendedProperties?.private?.[OURS_JOB])
      .map((ev) => ({ start: new Date(ev.start!.dateTime!), end: new Date(ev.end!.dateTime!), title: ev.summary }));
  } catch (e) {
    console.warn("[google-calendar] busy lookup failed", e instanceof Error ? e.message : e);
    await prisma.googleCalendarConnection.update({ where: { id: conn.id }, data: { lastError: (e instanceof Error ? e.message : String(e)).slice(0, 300) } }).catch(() => {});
    return []; // never block the phone line because Google is down
  }
}

/** True when [slotStart, slotEnd) overlaps any busy block. */
export function overlapsBusy(blocks: BusyBlock[], slotStart: Date, slotEnd: Date): boolean {
  return blocks.some((b) => b.start < slotEnd && b.end > slotStart);
}

/** Push every upcoming active reservation and scheduled job to the calendar (used right after connecting). */
export async function backfillUpcoming(accountId: string, limit = 200): Promise<{ attempted: number; synced: number }> {
  const upcoming = await prisma.reservation.findMany({
    where: { accountId, startTime: { gte: new Date() }, status: { in: ["booked", "confirmed", "seated"] }, googleEventId: null },
    orderBy: { startTime: "asc" },
    take: limit,
    select: { id: true },
  });
  const jobs = await prisma.job.findMany({
    where: { accountId, scheduledStart: { gte: new Date() }, status: { notIn: ["cancelled", "completed"] }, googleEventId: null },
    orderBy: { scheduledStart: "asc" },
    take: limit,
    select: { id: true },
  });
  let synced = 0;
  for (const r of upcoming) if ((await syncReservationToGoogle(r.id)).synced) synced++;
  for (const j of jobs) if ((await syncJobToGoogle(j.id)).synced) synced++;
  return { attempted: upcoming.length + jobs.length, synced };
}
