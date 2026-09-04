/**
 * Time-zone helpers built on the Intl API (no external dependency).
 * Everything is stored in UTC; these convert to/from a restaurant's local time zone.
 */

export type DateParts = {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday ... 6 = Saturday
};

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsFormatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    partsFormatterCache.set(timeZone, f);
  }
  return f;
}

/** Break a UTC instant into its calendar parts in the given time zone. */
export function getParts(date: Date, timeZone: string): DateParts {
  const parts = partsFormatter(timeZone).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
  };
}

/** Offset (ms) of the time zone from UTC at the given instant. Positive = ahead of UTC. */
export function tzOffsetMs(date: Date, timeZone: string): number {
  const p = getParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * Convert a local wall-clock date + time ("YYYY-MM-DD", "HH:MM") in a time zone to a UTC Date.
 */
export function zonedToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mm, 0);
  const guess = new Date(naive - tzOffsetMs(new Date(naive), timeZone));
  // Second pass corrects instants near a DST transition.
  const corrected = new Date(naive - tzOffsetMs(guess, timeZone));
  return corrected;
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "YYYY-MM-DD" for the given instant in the time zone. */
export function toDateString(date: Date, timeZone: string): string {
  const p = getParts(date, timeZone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** "HH:MM" (24h) for the given instant in the time zone. */
export function toTimeString(date: Date, timeZone: string): string {
  const p = getParts(date, timeZone);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** Today's "YYYY-MM-DD" in the time zone. */
export function todayString(timeZone: string): string {
  return toDateString(new Date(), timeZone);
}

/** Add whole days to a "YYYY-MM-DD" string (calendar math, no time zone involved). */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/** Day of week (0 = Sunday) for a "YYYY-MM-DD" string. */
export function dayOfWeekOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Start of the week (Sunday) containing the date. */
/** Monday of the week containing the date (the book runs Mon → Sun). */
export function startOfWeek(dateStr: string): string {
  return addDays(dateStr, -((dayOfWeekOf(dateStr) + 6) % 7));
}

/** UTC bounds [start, end) for a local calendar day. */
export function dayBoundsUtc(dateStr: string, timeZone: string): { start: Date; end: Date } {
  return { start: zonedToUtc(dateStr, "00:00", timeZone), end: zonedToUtc(addDays(dateStr, 1), "00:00", timeZone) };
}

export function isValidDateString(s: string | null | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

export function isValidTimeString(s: string | null | undefined): s is string {
  return !!s && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

// ---------- Display formatting ----------

export function formatTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(date);
}

export function formatDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" }).format(date);
}

export function formatDateLong(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(date);
}

export function formatDateTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** Format a "HH:MM" 24h string as "6:30 PM". */
export function formatClock(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${pad2(m)} ${suffix}`;
}

/**
 * A day that never closes, written as midnight to midnight.
 *
 * This is not a new idea in the schema, it is the existing one made explicit. Every engine that
 * reads business hours already treats a close that is not after its open as running past midnight
 * (`if (closeMin <= openMin) closeMin += 24 * 60`), so 00:00 to 00:00 has always described a full
 * twenty-four hours. The constants exist so the hours form, the save action and the prompt builders
 * all agree on WHICH pair of times means it, rather than each recognising its own.
 *
 * Deliberately not a column on BusinessHours: a boolean would be a second source of truth for
 * something the times already say, and the two would drift the first time anyone edited one.
 */
export const ALL_DAY_OPEN = "00:00";
export const ALL_DAY_CLOSE = "00:00";

/** Whether a period runs round the clock. Only the canonical pair counts — see saveHours. */
export function isAllDay(open: string, close: string): boolean {
  return open === ALL_DAY_OPEN && close === ALL_DAY_CLOSE;
}

/**
 * "11:00 AM–9:00 PM", or "24 hours" for a day that never closes.
 *
 * Without this, every display and every agent prompt renders a round-the-clock day as
 * "12:00 AM–12:00 AM", which reads as a mistake and, spoken down a phone line, is one.
 */
export function formatHourRange(open: string, close: string, dash = "–"): string {
  return isAllDay(open, close) ? "24 hours" : `${formatClock(open)}${dash}${formatClock(close)}`;
}

/** Format a "YYYY-MM-DD" string as "Sat, Aug 29" (no time zone conversion). */
export function formatDateString(dateStr: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "5 min ago", "2 hr ago", "3 days ago" */
export function timeAgo(date: Date, now: Date = new Date()): string {
  const s = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds && seconds !== 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${pad2(s)}`;
}

/** Current instant. Kept in a helper so server components stay lint-pure (no bare Date.now()/new Date() in render). */
export function nowUtc(): Date {
  return new Date();
}
