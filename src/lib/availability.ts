import type { Account, BusinessHours } from "@prisma/client";
import { prisma } from "./prisma";
import { dayBoundsUtc, dayOfWeekOf, formatClock, minutesToTime, timeToMinutes, toDateString, toTimeString, zonedToUtc } from "./time";

/**
 * Built-in reservation book: availability engine.
 * Used by the manual reservation form now and by the Retell `get_available_times` function in Phase 2.
 */

export type Slot = {
  time: string; // "HH:MM" local
  label: string; // "6:30 PM"
  startUtc: Date;
  endUtc: Date;
  available: boolean;
  reason?: "past" | "slot_full" | "capacity";
  coversBooked: number; // covers starting in this exact slot
  coversSeated: number; // covers overlapping this slot's turn window
};

export type AvailabilityResult = {
  date: string;
  partySize: number;
  closed: boolean;
  requiresManager: boolean; // party larger than threshold — do not book, escalate
  slots: Slot[];
};

/** Statuses that hold a table. */
export const ACTIVE_RESERVATION_STATUSES = ["booked", "confirmed", "seated"] as const;

/** Minutes before close at which the last seating is offered. */
const LAST_SEATING_BEFORE_CLOSE_MIN = 30;

/** Default hours used when an account has not configured any (AI must still work after steps 1, 2 and 7). */
export const DEFAULT_OPEN = "11:00";
export const DEFAULT_CLOSE = "21:00";

type AccountSettings = Pick<
  Account,
  "id" | "timeZone" | "tableTurnMinutes" | "reservationIntervalMinutes" | "maxCoversPerSlot" | "seatingCapacity" | "largePartyThreshold"
>;

/** Service periods for a given day, falling back to sensible defaults when none are configured. */
export function periodsForDay(hours: BusinessHours[], dayOfWeek: number): { open: string; close: string; periodName: string }[] {
  if (hours.length === 0) return [{ open: DEFAULT_OPEN, close: DEFAULT_CLOSE, periodName: "All day" }];
  return hours
    .filter((h) => h.dayOfWeek === dayOfWeek && !h.isClosed)
    .sort((a, b) => timeToMinutes(a.open) - timeToMinutes(b.open))
    .map((h) => ({ open: h.open, close: h.close, periodName: h.periodName }));
}

/** Today's service periods plus whether the restaurant is open at this moment (restaurant local time). */
export function todayServiceStatus(hours: BusinessHours[], timeZone: string): { periods: { open: string; close: string; periodName: string }[]; openNow: boolean; current?: string } {
  const now = new Date();
  const dateStr = toDateString(now, timeZone);
  const periods = periodsForDay(hours, dayOfWeekOf(dateStr));
  const nowMin = timeToMinutes(toTimeString(now, timeZone));
  const current = periods.find((p) => {
    const o = timeToMinutes(p.open);
    let c = timeToMinutes(p.close);
    if (c <= o) c += 24 * 60;
    return nowMin >= o && nowMin < c;
  });
  return { periods, openNow: !!current, current: current?.periodName };
}

export async function getAvailableTimes(
  account: AccountSettings,
  date: string,
  partySize: number,
  opts: { now?: Date; excludeReservationId?: string } = {},
): Promise<AvailabilityResult> {
  const now = opts.now ?? new Date();
  const hours = await prisma.businessHours.findMany({ where: { accountId: account.id } });
  const periods = periodsForDay(hours, dayOfWeekOf(date));
  const requiresManager = partySize > account.largePartyThreshold;

  if (periods.length === 0) {
    return { date, partySize, closed: true, requiresManager, slots: [] };
  }

  const turnMs = account.tableTurnMinutes * 60_000;
  const { start: dayStart, end: dayEnd } = dayBoundsUtc(date, account.timeZone);

  // Anything that could overlap this day's slots.
  const reservations = await prisma.reservation.findMany({
    where: {
      accountId: account.id,
      isWaitlist: false,
      status: { in: [...ACTIVE_RESERVATION_STATUSES] },
      startTime: { lt: new Date(dayEnd.getTime() + turnMs) },
      endTime: { gt: new Date(dayStart.getTime() - turnMs) },
      ...(opts.excludeReservationId ? { id: { not: opts.excludeReservationId } } : {}),
    },
    select: { startTime: true, endTime: true, partySize: true },
  });

  const slots: Slot[] = [];
  for (const period of periods) {
    const openMin = timeToMinutes(period.open);
    let closeMin = timeToMinutes(period.close);
    if (closeMin <= openMin) closeMin += 24 * 60; // closes after midnight
    const lastSeating = closeMin - LAST_SEATING_BEFORE_CLOSE_MIN;

    for (let m = openMin; m <= lastSeating; m += account.reservationIntervalMinutes) {
      const time = minutesToTime(m);
      const startUtc = m >= 24 * 60
        ? new Date(zonedToUtc(date, minutesToTime(m - 24 * 60), account.timeZone).getTime() + 24 * 60 * 60_000)
        : zonedToUtc(date, time, account.timeZone);
      const endUtc = new Date(startUtc.getTime() + turnMs);

      let coversBooked = 0;
      let coversSeated = 0;
      for (const r of reservations) {
        if (r.startTime.getTime() === startUtc.getTime()) coversBooked += r.partySize;
        if (r.startTime < endUtc && r.endTime > startUtc) coversSeated += r.partySize;
      }

      let available = true;
      let reason: Slot["reason"];
      if (startUtc <= now) {
        available = false;
        reason = "past";
      } else if (account.maxCoversPerSlot != null && coversBooked + partySize > account.maxCoversPerSlot) {
        available = false;
        reason = "slot_full";
      } else if (account.seatingCapacity != null && coversSeated + partySize > account.seatingCapacity) {
        available = false;
        reason = "capacity";
      }

      slots.push({ time, label: formatClock(minutesToTime(m % (24 * 60))), startUtc, endUtc, available, reason, coversBooked, coversSeated });
    }
  }

  return { date, partySize, closed: false, requiresManager, slots };
}

/**
 * When the requested time is unavailable, offer the nearest open times on either side.
 * Returns up to `count` earlier and `count` later options.
 */
export function nearestAlternatives(slots: Slot[], requestedTime: string, count = 2): { earlier: Slot[]; later: Slot[] } {
  const req = timeToMinutes(requestedTime);
  const open = slots.filter((s) => s.available);
  const earlier = open.filter((s) => timeToMinutes(s.time) < req).slice(-count);
  const later = open.filter((s) => timeToMinutes(s.time) > req).slice(0, count);
  return { earlier, later };
}
