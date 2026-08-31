import type { Account, BusinessHours } from "@prisma/client";
import { prisma } from "./prisma";
import { DEFAULT_CLOSE, DEFAULT_OPEN, periodsForDay } from "./availability";
import { googleBusyBlocks, overlapsBusy } from "./google-calendar";
import { dayBoundsUtc, dayOfWeekOf, formatClock, timeToMinutes, zonedToUtc } from "./time";

/**
 * When a trade can actually come out.
 *
 * Deliberately not the restaurant availability engine. A table is a scarce resource with covers
 * and turn times; a service call is a van and a person, so what limits it is how many visits fit
 * in a working day and whether one is already booked over the same window. Sharing one function
 * would mean threading party sizes and seating capacity through code that has no use for them.
 *
 * Emergencies do not come through here at all — an emergency is dispatched, not slotted.
 */

/** Statuses that still occupy the calendar. A cancelled or completed job frees its window. */
export const ACTIVE_JOB_STATUSES = ["requested", "scheduled", "dispatched", "en_route", "in_progress"] as const;

export type JobSlot = {
  /** "HH:MM" in the account's time zone. */
  time: string;
  /** "9:00 AM" */
  label: string;
  startUtc: Date;
  endUtc: Date;
  available: boolean;
  reason?: "past" | "taken" | "day_full" | "calendar_busy";
};

export type JobAvailability = {
  date: string;
  closed: boolean;
  slots: JobSlot[];
  /** How many bookable jobs are already on this day. */
  booked: number;
  /** Null when the account has not set a cap. */
  maxPerDay: number | null;
};

const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) => aStart < bEnd && bStart < aEnd;

export async function getAvailableJobSlots(account: Account, date: string, hours?: BusinessHours[]): Promise<JobAvailability> {
  const tz = account.timeZone;
  const slotMinutes = Math.max(15, account.jobSlotMinutes || 120);
  const maxPerDay = account.maxJobsPerDay ?? null;

  const businessHours = hours ?? (await prisma.businessHours.findMany({ where: { accountId: account.id }, orderBy: [{ dayOfWeek: "asc" }, { sortOrder: "asc" }] }));
  const periods = periodsForDay(businessHours, dayOfWeekOf(date));
  if (periods.length === 0) return { date, closed: true, slots: [], booked: 0, maxPerDay };

  const { start, end } = dayBoundsUtc(date, tz);
  // Anything else on a connected Google calendar blocks its window, same as for reservations. Our
  // own mirrored events are filtered out inside googleBusyBlocks, and a Google failure returns []
  // rather than blocking the phone line — the built-in book stays the source of truth.
  const [existing, busy] = await Promise.all([
    prisma.job.findMany({
      where: { accountId: account.id, status: { in: [...ACTIVE_JOB_STATUSES] }, scheduledStart: { gte: start, lt: end } },
      select: { scheduledStart: true, scheduledEnd: true },
    }),
    googleBusyBlocks(account.id, start, end),
  ]);

  const booked = existing.length;
  const dayFull = maxPerDay != null && booked >= maxPerDay;
  const now = Date.now();

  const slots: JobSlot[] = [];
  for (const period of periods) {
    const openMin = timeToMinutes(period.open || DEFAULT_OPEN);
    const closeMin = timeToMinutes(period.close || DEFAULT_CLOSE);
    // A visit must finish before closing time: a two-hour job at half an hour to close is a promise
    // the trade cannot keep.
    for (let m = openMin; m + slotMinutes <= closeMin; m += slotMinutes) {
      const time = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      const startUtc = zonedToUtc(date, time, tz);
      const endUtc = new Date(startUtc.getTime() + slotMinutes * 60_000);

      let reason: JobSlot["reason"];
      if (startUtc.getTime() < now) reason = "past";
      else if (dayFull) reason = "day_full";
      else if (existing.some((j) => j.scheduledStart && overlaps(startUtc, endUtc, j.scheduledStart, j.scheduledEnd ?? new Date(j.scheduledStart.getTime() + slotMinutes * 60_000)))) reason = "taken";
      else if (overlapsBusy(busy, startUtc, endUtc)) reason = "calendar_busy";

      slots.push({ time, label: formatClock(time), startUtc, endUtc, available: !reason, reason });
    }
  }

  return { date, closed: false, slots, booked, maxPerDay };
}

/** The next few open windows on a day, for reading back to a caller. */
export function openSlotLabels(availability: JobAvailability, limit = 6): string[] {
  return availability.slots
    .filter((s) => s.available)
    .slice(0, limit)
    .map((s) => s.label);
}
