import Link from "next/link";
import { ArrowLeftIcon, ArrowRightIcon } from "@/components/icons";
import { requireAccount } from "@/lib/current-account";
import { prisma } from "@/lib/prisma";
import { addDays, dayBoundsUtc, formatDateString, formatTime, isValidDateString, startOfWeek, toDateString, todayString } from "@/lib/time";
import { humanize } from "@/lib/constants";
import { setReservationStatus } from "@/actions/reservations";
import { Badge, EmptyState, LinkButton, PageHeader, reservationTone } from "@/components/ui";
import { RESERVATION_TRANSITIONS, StatusButtons } from "@/components/status-buttons";
import { getGoogleCalendarStatus } from "@/lib/google-calendar-view";
import { calendarBlurbFor, calendarSettingsHref } from "@/lib/calendar-sync-ui";
import { CalendarSyncPrompt } from "@/components/calendar-sync-prompt";

export const metadata = { title: "Book" };

export default async function ReservationsPage({ searchParams }: { searchParams: Promise<{ date?: string; view?: string; show?: string; changed?: string; google?: string; message?: string }> }) {
  const { account } = await requireAccount();
  const tz = account.timeZone;
  const sp = await searchParams;
  const today = todayString(tz);
  const date = isValidDateString(sp.date) ? sp.date : today;
  const view = sp.view === "day" ? "day" : "week"; // the week calendar is the book's home view
  const showAll = sp.show === "all";

  const rangeStart = view === "week" ? startOfWeek(date) : date;
  const rangeEnd = view === "week" ? addDays(rangeStart, 7) : addDays(date, 1);
  const { start } = dayBoundsUtc(rangeStart, tz);
  const { start: end } = dayBoundsUtc(rangeEnd, tz);

  const [reservations, calendar] = await Promise.all([
    prisma.reservation.findMany({
      where: { accountId: account.id, startTime: { gte: start, lt: end }, ...(showAll ? {} : { status: { notIn: ["cancelled", "no_show"] } }) },
      orderBy: { startTime: "asc" },
    }),
    getGoogleCalendarStatus(account.id),
  ]);

  const href = (d: string, v: string = view) => `/reservations?date=${d}${v === "day" ? "&view=day" : ""}${showAll ? "&show=all" : ""}`;
  const step = view === "week" ? 7 : 1;
  const days = view === "week" ? Array.from({ length: 7 }, (_, i) => addDays(rangeStart, i)) : [date];
  const byDay = new Map(days.map((d) => [d, [] as typeof reservations]));
  for (const r of reservations) byDay.get(toDateString(r.startTime, tz))?.push(r);

  const weekEnd = addDays(rangeStart, 6);
  const title =
    view === "week"
      ? `${formatDateString(rangeStart, { month: "short", day: "numeric" })} – ${formatDateString(weekEnd, { month: "short", day: "numeric", year: "numeric" })}`
      : formatDateString(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const onToday = view === "week" ? rangeStart === startOfWeek(today) : date === today;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Book"
        action={
          <LinkButton href={`/reservations/new?date=${date === today || view === "day" ? date : rangeStart}`} size="sm">
            + New
          </LinkButton>
        }
      />

      {/* Period navigator: round arrows either side, the range centred, Today underneath */}
      <div className="flex items-center justify-between gap-3">
        <Link href={href(addDays(date, -step))} className="lift flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-surface shadow-sm hover:bg-gray-50" aria-label={view === "week" ? "Previous week" : "Previous day"}>
          <ArrowLeftIcon size={20} />
        </Link>
        <div className="min-w-0 text-center">
          <p className="truncate text-lg font-bold tracking-tight">{title}</p>
          {onToday ? (
            <span className="text-xs font-semibold text-brand-700">Today</span>
          ) : (
            <Link href={href(today)} className="text-xs font-semibold text-brand-700 hover:underline">
              Today
            </Link>
          )}
        </div>
        <Link href={href(addDays(date, step))} className="lift flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-surface shadow-sm hover:bg-gray-50" aria-label={view === "week" ? "Next week" : "Next day"}>
          <ArrowRightIcon size={20} />
        </Link>
      </div>

      {view === "week" ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-7 md:gap-3">
          {days.map((d) => {
            const items = byDay.get(d) ?? [];
            const isToday = d === today;
            const covers = items.filter((r) => !r.isWaitlist).reduce((s, r) => s + r.partySize, 0);
            return (
              <div key={d} className="flex flex-col gap-3">
                <Link href={href(d, "day")} className="flex items-baseline gap-1.5 px-0.5" title={`Open ${formatDateString(d, { weekday: "long", month: "long", day: "numeric" })}`}>
                  <span className={`text-xs font-semibold uppercase tracking-wide ${isToday ? "text-brand-700" : "text-gray-500"}`}>{formatDateString(d, { weekday: "short" })}</span>
                  <span className={`text-lg font-bold leading-none ${isToday ? "text-brand-700" : "text-ink"}`}>{formatDateString(d, { day: "numeric" })}</span>
                  {covers > 0 ? <span className="ml-auto text-xs text-gray-500">{covers} covers</span> : null}
                </Link>

                {items.length === 0 ? (
                  <div className={`flex min-h-16 flex-1 items-center justify-center rounded-xl border border-dashed px-2 text-sm text-gray-400 ${isToday ? "border-brand-300" : "border-gray-300"}`}>No reservations</div>
                ) : (
                  <ul className="flex flex-1 flex-col gap-1.5">
                    {items.map((r) => (
                      <li key={r.id}>
                        <Link href={`/reservations/${r.id}`} className={`lift block rounded-xl border bg-surface px-2.5 py-2 text-sm shadow-sm hover:bg-gray-50 ${isToday ? "border-brand-300" : "border-gray-200"}`}>
                          <span className="block font-semibold">{formatTime(r.startTime, tz)}</span>
                          <span className="block truncate text-gray-700">{r.guestName}</span>
                          <span className="text-xs text-gray-500">
                            Party of {r.partySize}
                            {r.isWaitlist ? " · waitlist" : ""}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}

                <LinkButton href={`/reservations/new?date=${d}`} variant="secondary" size="sm" full className="shadow-sm">
                  + Add
                </LinkButton>
              </div>
            );
          })}
        </div>
      ) : reservations.length === 0 ? (
        <EmptyState title="No reservations this day" action={<LinkButton href={`/reservations/new?date=${date}`}>Add a reservation</LinkButton>} />
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2 3xl:grid-cols-3">
          {(byDay.get(date) ?? []).map((r) => (
            <li key={r.id} className="lift flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-surface p-4">
              <div className="min-w-0">
                <Link href={`/reservations/${r.id}`} className="block font-semibold">
                  {formatTime(r.startTime, tz)} · {r.guestName}
                </Link>
                <p className="text-sm text-gray-500">
                  Party of {r.partySize}
                  {r.isWaitlist ? " · waitlist" : ""}
                  {r.seatingPreference ? ` · ${r.seatingPreference}` : ""}
                  {r.source === "ai" ? " · booked by AI" : ""}
                </p>
                {r.specialRequests ? <p className="text-sm text-gray-600">“{r.specialRequests}”</p> : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge tone={reservationTone[r.status]} className={sp.changed === r.id ? "badge-pop" : undefined}>{humanize(r.status)}</Badge>
                <StatusButtons id={r.id} current={r.status} transitions={RESERVATION_TRANSITIONS[r.status].slice(0, 2)} action={setReservationStatus} returnTo={href(date)} size="sm" />
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-4 text-sm">
        {view === "day" ? (
          <Link href={href(date, "week")} className="font-semibold text-brand-700">
            ← Back to week
          </Link>
        ) : null}
        <Link href={`/reservations?date=${date}${view === "day" ? "&view=day" : ""}${showAll ? "" : "&show=all"}`} className="font-semibold text-gray-500 hover:text-ink">
          {showAll ? "Hide cancelled / no-shows" : "Show cancelled / no-shows"}
        </Link>
      </div>

      <CalendarSyncPrompt
        status={calendar}
        returnTo={href(date)}
        manageHref={calendarSettingsHref("restaurant")}
        blurb={calendarBlurbFor("restaurant")}
        itemsLabel="reservations"
        googleStatus={sp.google}
        googleMessage={sp.message}
      />
    </div>
  );
}
