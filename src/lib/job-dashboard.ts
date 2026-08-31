import type { Account } from "@prisma/client";
import { prisma } from "./prisma";
import { addDays, dayBoundsUtc, dayOfWeekOf, formatDateString, toDateString, todayString } from "./time";
import { DAYS_SHORT } from "./constants";
import { ACTIVE_JOB_STATUSES } from "./job-availability";

/**
 * The job-shaped half of a field-service home page.
 *
 * Deliberately separate from loadDashboard() rather than bolted onto it: a restaurant counts covers
 * and open orders, a trade counts visits and emergencies, and the two have no column in common. The
 * shared half — calls, notifications, callbacks, how the AI is doing — still comes from
 * loadDashboard, which is why this only computes what is genuinely different.
 */
export async function loadJobDashboard(account: Account) {
  const tz = account.timeZone;
  const today = todayString(tz);
  const yesterday = addDays(today, -1);
  const { start: todayStart, end: todayEnd } = dayBoundsUtc(today, tz);
  const { start: yStart } = dayBoundsUtc(yesterday, tz);
  const { end: weekAheadEnd } = dayBoundsUtc(addDays(today, 6), tz);

  const [todaysJobs, jobsAheadRows, yesterdayCount, unscheduled, openEmergencies] = await Promise.all([
    prisma.job.findMany({
      where: { accountId: account.id, scheduledStart: { gte: todayStart, lt: todayEnd }, status: { notIn: ["cancelled"] } },
      orderBy: { scheduledStart: "asc" },
    }),
    prisma.job.findMany({
      where: { accountId: account.id, scheduledStart: { gte: todayStart, lt: weekAheadEnd }, status: { notIn: ["cancelled"] } },
      select: { scheduledStart: true, source: true },
    }),
    prisma.job.count({ where: { accountId: account.id, scheduledStart: { gte: yStart, lt: todayStart }, status: { notIn: ["cancelled"] } } }),
    // A job the agent took but could not place in a slot. These are the ones that quietly rot.
    prisma.job.findMany({
      where: { accountId: account.id, scheduledStart: null, status: { in: [...ACTIVE_JOB_STATUSES] } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.job.count({ where: { accountId: account.id, isEmergency: true, status: { in: [...ACTIVE_JOB_STATUSES] } } }),
  ]);

  const aheadKeys = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const byDay = new Map(aheadKeys.map((d) => [d, 0]));
  let aiBookedAhead = 0;
  for (const j of jobsAheadRows) {
    if (!j.scheduledStart) continue;
    const d = toDateString(j.scheduledStart, tz);
    if (byDay.has(d)) byDay.set(d, byDay.get(d)! + 1);
    if (j.source === "ai") aiBookedAhead += 1;
  }

  const jobsAhead = aheadKeys.map((d) => ({
    label: DAYS_SHORT[dayOfWeekOf(d)],
    sublabel: formatDateString(d, { month: "short", day: "numeric" }),
    value: byDay.get(d)!,
    highlight: d === today,
  }));

  return {
    today,
    todaysJobs,
    unscheduled,
    jobsAhead,
    tiles: {
      jobsToday: todaysJobs.length,
      jobsDelta: todaysJobs.length - yesterdayCount,
      openEmergencies,
      unscheduled: unscheduled.length,
      aiBookedAhead,
    },
  };
}
