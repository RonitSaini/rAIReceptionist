import Link from "next/link";
import { ArrowLeftIcon, ArrowRightIcon } from "@/components/icons";
import { requireAccount } from "@/lib/current-account";
import { prisma } from "@/lib/prisma";
import { addDays, dayBoundsUtc, formatDateString, formatTime, isValidDateString, startOfWeek, toDateString, todayString } from "@/lib/time";

import { humanize } from "@/lib/constants";
import { verticalFor, vocabularyFor } from "@/verticals";
import { cx } from "@/lib/cx";
import { Badge, LinkButton, PageHeader } from "@/components/ui";
import { JOB_STATUS_TONE } from "@/lib/jobs-ui";
import { getGoogleCalendarStatus } from "@/lib/google-calendar-view";
import { calendarBlurbFor, calendarSettingsHref } from "@/lib/calendar-sync-ui";
import { CalendarSyncPrompt } from "@/components/calendar-sync-prompt";
import { RunningLateButton } from "@/components/running-late-button";

export const metadata = { title: "Schedule" };

/**
 * How many visits a day shows before the rest fold behind "+N more". Four keeps the busiest day
 * inside one screen at 1280 px (a card is about 98 px tall). A day exactly one past the cap shows
 * everything: a fold that hides a single card costs a click to save one card of height.
 */
const VISIBLE_PER_DAY = 4;

/** The focus ring every link in the grid shares with the app's buttons (baseButton in ui.tsx). */
const focusRing = "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2";

/**
 * The week's work, as a diary.
 *
 * Same shape as the restaurant's book — seven columns, round arrows, Monday to Sunday — because the
 * question an owner opens it with is identical: what is happening this week, and where are the gaps.
 * What differs is what fills a column: a visit with an address rather than a table with a party.
 *
 * Each column is the height of its own day. The grid aligns at the top (`items-start`) instead of
 * stretching every column to the busiest one, so a quiet Tuesday is a header and one empty cell —
 * the size of one visit, which keeps the first row of cells level across the week — and never a
 * void the height of Saturday. The empty cell is also the way to fill it: "+ Add" lives inside it,
 * so the only day that carries a separate Add line is one that already has visits to add to.
 */
export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ date?: string; google?: string; message?: string }> }) {
  const { account } = await requireAccount();
  const tz = account.timeZone;
  const sp = await searchParams;
  const today = todayString(tz);
  const date = isValidDateString(sp.date) ? sp.date : today;
  const words = vocabularyFor(account);
  const archetype = verticalFor(account).archetype;

  const rangeStart = startOfWeek(date);
  const days = Array.from({ length: 7 }, (_, i) => addDays(rangeStart, i));
  const { start } = dayBoundsUtc(rangeStart, tz);
  const { start: end } = dayBoundsUtc(addDays(rangeStart, 7), tz);

  const [jobs, calendar] = await Promise.all([
    prisma.job.findMany({
      where: { accountId: account.id, scheduledStart: { gte: start, lt: end }, status: { notIn: ["cancelled"] } },
      orderBy: { scheduledStart: "asc" },
    }),
    getGoogleCalendarStatus(account.id),
  ]);

  const byDay = new Map(days.map((d) => [d, [] as typeof jobs]));
  for (const j of jobs) if (j.scheduledStart) byDay.get(toDateString(j.scheduledStart, tz))?.push(j);

  const href = (d: string) => `/schedule?date=${d}`;
  const weekEnd = addDays(rangeStart, 6);
  const onToday = rangeStart === startOfWeek(today);
  const article = /^[aeiou]/i.test(words.booking.one) ? "an" : "a";

  const card = (j: (typeof jobs)[number], isToday: boolean) => (
    <li key={j.id}>
      <Link href={`/jobs/${j.id}`} className={cx("lift block rounded-xl border bg-surface px-2.5 py-2 text-sm shadow-sm hover:bg-gray-50", j.isEmergency ? "border-red-300" : isToday ? "border-brand-300" : "border-gray-200")}>
        <span className="block font-semibold">{j.scheduledStart ? formatTime(j.scheduledStart, tz) : "TBC"}</span>
        <span className="block truncate text-gray-700">{j.customerName}</span>
        {j.address ? <span className="block truncate text-xs text-gray-500">{j.address.split(",")[0]}</span> : null}
        <Badge tone={j.isEmergency ? "red" : JOB_STATUS_TONE[j.status]} className="mt-1">
          {j.isEmergency ? "Emergency" : humanize(j.status)}
        </Badge>
      </Link>
    </li>
  );

  return (
    <div data-floor className="flex grow flex-col">
      {/* Block flow inside (the header's margin collapses as it always has); the footnotes below are
          the second flex child and stand on the floor (data-floor, see template.tsx). */}
      <div className="space-y-5">
      <PageHeader
        title="Schedule"
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <RunningLateButton />
            <LinkButton href="/jobs/new" size="sm">
              + New
            </LinkButton>
          </div>
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

      {/* The diary arrives BY DAY COLUMN: each day is one arriving element and its visits come with it,
          so a week reads left to right rather than as fifty separate rows (motion spec §10.2). */}
      <div data-arrival="columns" className="grid grid-cols-1 gap-4 md:grid-cols-7 md:items-start md:gap-3">
        {days.map((d) => {
          const items = byDay.get(d) ?? [];
          const isToday = d === today;
          const folded = items.length > VISIBLE_PER_DAY + 1;
          const shown = folded ? items.slice(0, VISIBLE_PER_DAY) : items;
          const rest = folded ? items.slice(VISIBLE_PER_DAY) : [];
          const addHref = `/jobs/new?date=${d}`;
          const addTitle = `Add ${article} ${words.booking.one} on ${formatDateString(d, { weekday: "long", month: "long", day: "numeric" })}`;
          return (
            <div key={d} className="flex flex-col gap-2">
              {/* The count sits with the date it counts. Pushed to the column's far edge it landed 14 px
                  from the NEXT day's label and 100 px from its own, and read as the next day's badge. */}
              <div data-day-head className="flex items-baseline gap-1.5 px-0.5">
                <span className={cx("text-xs font-semibold uppercase tracking-wide", isToday ? "text-brand-700" : "text-gray-500")}>{formatDateString(d, { weekday: "short" })}</span>
                <span data-day-num className={cx("text-lg font-bold leading-none", isToday ? "text-brand-700" : "text-ink")}>
                  {formatDateString(d, { day: "numeric" })}
                </span>
                {items.length > 0 ? (
                  <span data-day-count className="rounded-full bg-gray-100 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-gray-600">
                    {items.length}
                    <span className="sr-only"> booked</span>
                  </span>
                ) : null}
              </div>

              {items.length === 0 ? (
                <Link
                  data-day-empty
                  href={addHref}
                  title={addTitle}
                  className={cx(
                    "group press-soft flex min-h-12 items-center justify-center gap-2 rounded-xl border border-dashed px-2 text-xs hover:border-brand-300 hover:bg-brand-50 md:min-h-24 md:flex-col md:gap-0.5",
                    isToday ? "border-brand-300" : "border-gray-300",
                    focusRing,
                  )}
                >
                  <span className="text-gray-400">Nothing booked</span>
                  <span className="font-semibold text-gray-500 group-hover:text-brand-700">+ Add</span>
                </Link>
              ) : (
                <>
                  <ul className="flex flex-col gap-1.5">
                    {shown.map((j) => card(j, isToday))}
                    {rest.length > 0 ? (
                      <li>
                        {/* A native <details>: the rest of the day is simply there when opened (nothing
                            enters on an on-page interaction, spec rule 31), and the toggle stays where
                            it is, still under the pointer, to fold the day again. */}
                        <details className="day-more">
                          <summary className={cx("press-soft inline-flex min-h-8 items-center rounded-lg px-0.5 text-xs font-semibold text-brand-700 hover:underline", focusRing)}>
                            <span className="when-closed">+{rest.length} more</span>
                            <span className="when-open">Show fewer</span>
                          </summary>
                          <ul className="mt-1.5 flex flex-col gap-1.5">{rest.map((j) => card(j, isToday))}</ul>
                        </details>
                      </li>
                    ) : null}
                  </ul>
                  <Link href={addHref} title={addTitle} className={cx("press-soft inline-flex min-h-8 items-center self-start rounded-lg px-0.5 text-xs font-semibold text-gray-500 hover:text-brand-700", focusRing)}>
                    + Add
                  </Link>
                </>
              )}
            </div>
          );
        })}
      </div>

      </div>

      {/* On a short week the footnotes sit at the bottom of the screen rather than directly under the
          grid; on a long one they simply follow it. The top padding is the gap they keep from the grid. */}
      <div className="mt-auto space-y-5 pt-5">
        <p className="text-sm text-gray-500">
          Unscheduled {words.booking.many} (including emergencies waiting on a time) are in{" "}
          <Link href="/jobs?status=requested" className="font-semibold text-brand-700">
            {words.booking.Many}
          </Link>
          .
        </p>

        <CalendarSyncPrompt
          status={calendar}
          returnTo={`/schedule?date=${date}`}
          manageHref={calendarSettingsHref(archetype)}
          blurb={calendarBlurbFor(archetype)}
          itemsLabel={words.booking.many}
          googleStatus={sp.google}
          googleMessage={sp.message}
          quiet
        />
      </div>
    </div>
  );
}
