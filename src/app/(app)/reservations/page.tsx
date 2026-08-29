import Link from "next/link";
import { ArrowLeftIcon, ArrowRightIcon } from "@/components/icons";
import { requireAccount } from "@/lib/current-account";
import { prisma } from "@/lib/prisma";
import { addDays, dayBoundsUtc, formatDateString, formatTime, isValidDateString, startOfWeek, toDateString, todayString } from "@/lib/time";
import { humanize } from "@/lib/constants";
import { setReservationStatus } from "@/actions/reservations";
import { Badge, EmptyState, LinkButton, PageHeader, reservationTone } from "@/components/ui";
import { RESERVATION_TRANSITIONS, StatusButtons } from "@/components/status-buttons";

export const metadata = { title: "Reservations" };

export default async function ReservationsPage({ searchParams }: { searchParams: Promise<{ date?: string; view?: string; show?: string }> }) {
  const { account } = await requireAccount();
  const tz = account.timeZone;
  const sp = await searchParams;
  const today = todayString(tz);
  const date = isValidDateString(sp.date) ? sp.date : today;
  const view = sp.view === "week" ? "week" : "day";
  const showAll = sp.show === "all";

  const rangeStart = view === "week" ? startOfWeek(date) : date;
  const rangeEnd = view === "week" ? addDays(rangeStart, 7) : addDays(date, 1);
  const { start } = dayBoundsUtc(rangeStart, tz);
  const { start: end } = dayBoundsUtc(rangeEnd, tz);

  const reservations = await prisma.reservation.findMany({
    where: { accountId: account.id, startTime: { gte: start, lt: end }, ...(showAll ? {} : { status: { notIn: ["cancelled", "no_show"] } }) },
    orderBy: { startTime: "asc" },
  });

  const href = (d: string, v: string = view) => `/reservations?date=${d}&view=${v}${showAll ? "&show=all" : ""}`;
  const step = view === "week" ? 7 : 1;
  const days = view === "week" ? Array.from({ length: 7 }, (_, i) => addDays(rangeStart, i)) : [date];
  const byDay = new Map(days.map((d) => [d, [] as typeof reservations]));
  for (const r of reservations) byDay.get(toDateString(r.startTime, tz))?.push(r);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reservations"
        action={
          <LinkButton href={`/reservations/new?date=${date}`} size="sm">
            + New
          </LinkButton>
        }
      />

      <div className="flex items-center justify-between gap-2 rounded-2xl border border-gray-200 bg-surface p-2">
        <Link href={href(addDays(date, -step))} className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-gray-100" aria-label="Previous">
          <ArrowLeftIcon size={22} />
        </Link>
        <div className="text-center">
          <p className="font-bold">{view === "week" ? `${formatDateString(rangeStart, { month: "short", day: "numeric" })} – ${formatDateString(addDays(rangeStart, 6), { month: "short", day: "numeric" })}` : formatDateString(date, { weekday: "long", month: "long", day: "numeric" })}</p>
          {date !== today ? (
            <Link href={href(today)} className="text-xs font-semibold text-brand-700">
              Jump to today
            </Link>
          ) : (
            <span className="text-xs text-gray-500">Today</span>
          )}
        </div>
        <Link href={href(addDays(date, step))} className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-gray-100" aria-label="Next">
          <ArrowRightIcon size={22} />
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-xl border border-gray-300 bg-surface">
          <Link href={href(date, "day")} className={`px-4 py-2 text-sm font-semibold ${view === "day" ? "bg-brand-600 text-white" : "text-gray-700"}`}>
            Day
          </Link>
          <Link href={href(date, "week")} className={`px-4 py-2 text-sm font-semibold ${view === "week" ? "bg-brand-600 text-white" : "text-gray-700"}`}>
            Week
          </Link>
        </div>
        <Link href={`/reservations?date=${date}&view=${view}${showAll ? "" : "&show=all"}`} className="text-sm font-semibold text-gray-500">
          {showAll ? "Hide cancelled / no-shows" : "Show cancelled / no-shows"}
        </Link>
      </div>

      {reservations.length === 0 ? (
        <EmptyState title={view === "week" ? "No reservations this week" : "No reservations this day"} action={<LinkButton href={`/reservations/new?date=${date}`}>Add a reservation</LinkButton>} />
      ) : (
        <div className={view === "week" ? "grid grid-cols-1 gap-3 md:grid-cols-7 md:gap-2" : "space-y-3"}>
          {days.map((d) => {
            const items = byDay.get(d) ?? [];
            if (view === "day") {
              return (
                <ul key={d} className="grid gap-3 xl:grid-cols-2 3xl:grid-cols-3">
                  {items.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-surface p-4">
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
                        <Badge tone={reservationTone[r.status]}>{humanize(r.status)}</Badge>
                        <StatusButtons id={r.id} current={r.status} transitions={RESERVATION_TRANSITIONS[r.status].slice(0, 2)} action={setReservationStatus} returnTo={href(date)} size="sm" />
                      </div>
                    </li>
                  ))}
                </ul>
              );
            }
            const covers = items.filter((r) => !r.isWaitlist).reduce((s, r) => s + r.partySize, 0);
            return (
              <div key={d} className={`rounded-2xl border bg-surface p-3 ${d === today ? "border-brand-400" : "border-gray-200"}`}>
                <Link href={href(d, "day")} className="flex items-baseline justify-between">
                  <span className="font-bold">{formatDateString(d, { weekday: "short", day: "numeric" })}</span>
                  <span className="text-xs text-gray-500">{covers} covers</span>
                </Link>
                {items.length === 0 ? (
                  <p className="mt-2 text-xs text-gray-400">—</p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {items.map((r) => (
                      <li key={r.id}>
                        <Link href={`/reservations/${r.id}`} className="block rounded-lg bg-gray-50 px-2 py-1.5 text-sm hover:bg-gray-100">
                          <span className="font-semibold">{formatTime(r.startTime, tz)}</span> {r.guestName} <span className="text-gray-500">({r.partySize})</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
