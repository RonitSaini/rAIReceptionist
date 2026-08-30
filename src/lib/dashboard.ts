import type { Account, Call, CallClassification } from "@prisma/client";
import { prisma } from "./prisma";
import { addDays, dayBoundsUtc, dayOfWeekOf, formatDateString, getParts, toDateString, todayString } from "./time";
import { DAYS_SHORT } from "./constants";
import { liveCallCutoff } from "./calls";

/** Everything the Home page needs, gathered in one place (keeps the page lint-pure and readable). */

export const CALL_SERIES = [
  { key: "booked", label: "Reservations", color: "var(--viz-series-1)" },
  { key: "orders", label: "Takeout", color: "var(--viz-series-2)" },
  { key: "questions", label: "Questions & messages", color: "var(--viz-series-3)" },
  { key: "attention", label: "Escalations & missed", color: "var(--viz-series-4)" },
] as const;

export function seriesKeyFor(c: CallClassification): (typeof CALL_SERIES)[number]["key"] {
  switch (c) {
    case "reservation":
    case "waitlist":
      return "booked";
    case "takeout":
      return "orders";
    case "escalation":
    case "missed":
      return "attention";
    default:
      return "questions";
  }
}

export async function loadDashboard(account: Account) {
  const tz = account.timeZone;
  const today = todayString(tz);
  const yesterday = addDays(today, -1);
  const weekAgo = addDays(today, -6);
  const { start: todayStart, end: todayEnd } = dayBoundsUtc(today, tz);
  const { start: yStart } = dayBoundsUtc(yesterday, tz);
  const { start: weekStart } = dayBoundsUtc(weekAgo, tz);
  const { end: weekAheadEnd } = dayBoundsUtc(addDays(today, 6), tz);
  const { start: monthStart } = dayBoundsUtc(addDays(today, -29), tz);
  const liveSince = liveCallCutoff();

  const [callsWeek, callsMonthHours, resTodayAndAhead, resYesterday, openOrders, unread, callbacks, liveCalls] = await Promise.all([
    prisma.call.findMany({
      where: { accountId: account.id, startedAt: { gte: weekStart, lt: todayEnd } },
      select: { id: true, startedAt: true, classification: true, duration: true, sentiment: true, callbackRequested: true, isTest: true },
    }),
    prisma.call.findMany({ where: { accountId: account.id, startedAt: { gte: monthStart } }, select: { startedAt: true } }),
    prisma.reservation.findMany({
      where: { accountId: account.id, startTime: { gte: todayStart, lt: weekAheadEnd }, isWaitlist: false, status: { notIn: ["cancelled", "no_show"] } },
      select: { startTime: true, partySize: true, source: true },
    }),
    prisma.reservation.findMany({ where: { accountId: account.id, startTime: { gte: yStart, lt: todayStart }, isWaitlist: false, status: { notIn: ["cancelled", "no_show"] } }, select: { partySize: true } }),
    prisma.takeoutOrder.count({ where: { accountId: account.id, status: { in: ["new", "confirmed", "ready"] } } }),
    prisma.notification.count({ where: { accountId: account.id, readAt: null } }),
    prisma.call.findMany({
      where: { accountId: account.id, callbackRequested: true, startedAt: { gte: weekStart } },
      orderBy: { startedAt: "desc" },
      take: 5,
      select: { id: true, callerName: true, callerPhone: true, messageText: true, escalationReason: true, startedAt: true, classification: true },
    }),
    prisma.call.count({ where: { accountId: account.id, callStatus: { in: ["ongoing", "registered"] }, startedAt: { gte: liveSince } } }),
  ]);

  // Calls per day (last 7 days) split into 4 series
  const dayKeys = Array.from({ length: 7 }, (_, i) => addDays(weekAgo, i));
  const perDay = new Map(dayKeys.map((d) => [d, { booked: 0, orders: 0, questions: 0, attention: 0 } as Record<string, number>]));
  for (const c of callsWeek) {
    const d = toDateString(c.startedAt, tz);
    const bucket = perDay.get(d);
    if (bucket) bucket[seriesKeyFor(c.classification)] += 1;
  }
  const callsByDay = dayKeys.map((d) => ({ label: DAYS_SHORT[dayOfWeekOf(d)], sublabel: formatDateString(d, { month: "short", day: "numeric" }), values: perDay.get(d)!, highlight: d === today }));

  const callsToday = callsWeek.filter((c) => c.startedAt >= todayStart).length;
  const callsYesterday = callsWeek.filter((c) => c.startedAt >= yStart && c.startedAt < todayStart).length;

  // Covers today + next 6 days
  const aheadKeys = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const coversByDay = new Map(aheadKeys.map((d) => [d, { covers: 0, count: 0 }]));
  let aiBookedAhead = 0;
  for (const r of resTodayAndAhead) {
    const d = toDateString(r.startTime, tz);
    const b = coversByDay.get(d);
    if (b) {
      b.covers += r.partySize;
      b.count += 1;
    }
    if (r.source === "ai") aiBookedAhead += 1;
  }
  const coversAhead = aheadKeys.map((d) => ({ label: DAYS_SHORT[dayOfWeekOf(d)], sublabel: `${formatDateString(d, { month: "short", day: "numeric" })} · ${coversByDay.get(d)!.count} reservations`, value: coversByDay.get(d)!.covers, highlight: d === today }));
  const todayCovers = coversByDay.get(today)!.covers;
  const todayCount = coversByDay.get(today)!.count;
  const yesterdayCovers = resYesterday.reduce((s, r) => s + r.partySize, 0);

  // AI host performance (last 7 days, excluding browser test calls)
  const real = callsWeek.filter((c) => !c.isTest);
  const answered = real.filter((c) => c.classification !== "missed");
  const handled = answered.filter((c) => !c.callbackRequested && c.classification !== "escalation");
  const durations = answered.map((c) => c.duration ?? 0).filter((d) => d > 0);
  const avgDuration = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
  const sentiment = { positive: 0, neutral: 0, negative: 0 };
  for (const c of answered) {
    if (c.sentiment === "Positive") sentiment.positive++;
    else if (c.sentiment === "Negative") sentiment.negative++;
    else if (c.sentiment) sentiment.neutral++;
  }
  const hourCounts = Array.from({ length: 24 }, () => 0);
  for (const c of callsMonthHours) hourCounts[getParts(c.startedAt, tz).hour] += 1;

  return {
    today,
    tiles: {
      callsToday,
      callsDelta: callsToday - callsYesterday,
      reservationsToday: todayCount,
      coversToday: todayCovers,
      coversDelta: todayCovers - yesterdayCovers,
      openOrders,
      unread,
      liveCalls,
      aiBookedAhead,
    },
    callsByDay,
    coversAhead,
    ai: {
      totalCalls: real.length,
      answered: answered.length,
      handledPct: answered.length ? Math.round((handled.length / answered.length) * 100) : null,
      avgDuration,
      sentiment,
      hourCounts,
      peakHour: hourCounts.some((c) => c > 0) ? hourCounts.indexOf(Math.max(...hourCounts)) : null,
    },
    callbacks: callbacks as Pick<Call, "id" | "callerName" | "callerPhone" | "messageText" | "escalationReason" | "startedAt" | "classification">[],
  };
}
