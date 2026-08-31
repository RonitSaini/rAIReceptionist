import Link from "next/link";
import { ArrowLeftIcon, ArrowRightIcon } from "@/components/icons";
import { requireAccount } from "@/lib/current-account";
import { prisma } from "@/lib/prisma";
import { addDays, dayBoundsUtc, formatDateString, formatTime, isValidDateString, startOfWeek, toDateString, todayString } from "@/lib/time";

import { humanize } from "@/lib/constants";
import { vocabularyFor } from "@/verticals";
import { Badge, LinkButton, PageHeader } from "@/components/ui";
import { Reveal } from "@/components/reveal";
import { JOB_STATUS_TONE } from "@/lib/jobs-ui";

export const metadata = { title: "Schedule" };

/**
 * The week's work, as a diary.
 *
 * Same shape as the restaurant's book — seven columns, round arrows, Monday to Sunday — because the
 * question an owner opens it with is identical: what is happening this week, and where are the gaps.
 * What differs is what fills a column: a visit with an address rather than a table with a party.
 */
export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { account } = await requireAccount();
  const tz = account.timeZone;
  const sp = await searchParams;
  const today = todayString(tz);
  const date = isValidDateString(sp.date) ? sp.date : today;
  const words = vocabularyFor(account);

  const rangeStart = startOfWeek(date);
  const days = Array.from({ length: 7 }, (_, i) => addDays(rangeStart, i));
  const { start } = dayBoundsUtc(rangeStart, tz);
  const { start: end } = dayBoundsUtc(addDays(rangeStart, 7), tz);

  const jobs = await prisma.job.findMany({
    where: { accountId: account.id, scheduledStart: { gte: start, lt: end }, status: { notIn: ["cancelled"] } },
    orderBy: { scheduledStart: "asc" },
  });

  const byDay = new Map(days.map((d) => [d, [] as typeof jobs]));
  for (const j of jobs) if (j.scheduledStart) byDay.get(toDateString(j.scheduledStart, tz))?.push(j);

  const href = (d: string) => `/schedule?date=${d}`;
  const weekEnd = addDays(rangeStart, 6);
  const onToday = rangeStart === startOfWeek(today);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Schedule"
        action={
          <LinkButton href="/jobs/new" size="sm">
            + New
          </LinkButton>
        }
      />

      <div className="flex items-center justify-between gap-3">
        <Link href={href(addDays(date, -7))} className="lift flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-surface shadow-sm hover:bg-gray-50" aria-label="Previous week">
          <ArrowLeftIcon size={20} />
        </Link>
        <div className="min-w-0 text-center">
          <p className="truncate text-lg font-bold tracking-tight">
            {formatDateString(rangeStart, { month: "short", day: "numeric" })} – {formatDateString(weekEnd, { month: "short", day: "numeric", year: "numeric" })}
          </p>
          {onToday ? (
            <span className="text-xs font-semibold text-brand-700">This week</span>
          ) : (
            <Link href={href(today)} className="text-xs font-semibold text-brand-700 hover:underline">
              This week
            </Link>
          )}
        </div>
        <Link href={href(addDays(date, 7))} className="lift flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-surface shadow-sm hover:bg-gray-50" aria-label="Next week">
          <ArrowRightIcon size={20} />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-7 md:gap-3">
        {days.map((d, i) => {
          const items = byDay.get(d) ?? [];
          const isToday = d === today;
          return (
            <Reveal key={d} index={i} className="flex flex-col gap-3">
              <div className="flex items-baseline gap-1.5 px-0.5">
                <span className={`text-xs font-semibold uppercase tracking-wide ${isToday ? "text-brand-700" : "text-gray-500"}`}>{formatDateString(d, { weekday: "short" })}</span>
                <span className={`text-lg font-bold leading-none ${isToday ? "text-brand-700" : "text-ink"}`}>{formatDateString(d, { day: "numeric" })}</span>
                {items.length > 0 ? <span className="ml-auto text-xs text-gray-500">{items.length}</span> : null}
              </div>

              {items.length === 0 ? (
                <div className={`flex min-h-16 flex-1 items-center justify-center rounded-xl border border-dashed px-2 text-sm text-gray-400 ${isToday ? "border-brand-300" : "border-gray-300"}`}>Nothing booked</div>
              ) : (
                <ul className="flex flex-1 flex-col gap-1.5">
                  {items.map((j) => (
                    <li key={j.id}>
                      <Link href={`/jobs/${j.id}`} className={`lift block rounded-xl border bg-surface px-2.5 py-2 text-sm shadow-sm hover:bg-gray-50 ${j.isEmergency ? "border-red-300" : isToday ? "border-brand-200" : "border-gray-200"}`}>
                        <span className="block font-semibold">{j.scheduledStart ? formatTime(j.scheduledStart, tz) : "TBC"}</span>
                        <span className="block truncate text-gray-700">{j.customerName}</span>
                        {j.address ? <span className="block truncate text-xs text-gray-500">{j.address.split(",")[0]}</span> : null}
                        <Badge tone={j.isEmergency ? "red" : JOB_STATUS_TONE[j.status]} className="mt-1">
                          {j.isEmergency ? "Emergency" : humanize(j.status)}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}

              <LinkButton href={`/jobs/new?date=${d}`} variant="secondary" size="sm" full className="shadow-sm">
                + Add
              </LinkButton>
            </Reveal>
          );
        })}
      </div>

      <p className="text-sm text-gray-500">
        Unscheduled {words.booking.many} (including emergencies waiting on a time) are in{" "}
        <Link href="/jobs?status=requested" className="font-semibold text-brand-700">
          {words.booking.Many}
        </Link>
        .
      </p>
    </div>
  );
}
