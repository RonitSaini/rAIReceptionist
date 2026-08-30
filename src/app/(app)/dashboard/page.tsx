import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRightIcon } from "@/components/icons";
import { requireAccount } from "@/lib/current-account";
import { prisma } from "@/lib/prisma";
import { dayBoundsUtc, formatDateLong, formatDateTime, formatDuration, formatTime, nowUtc, timeAgo, todayString } from "@/lib/time";
import { formatUsPhone } from "@/lib/form";
import { humanize } from "@/lib/constants";
import { CALL_SERIES, loadDashboard } from "@/lib/dashboard";
import { setReservationStatus } from "@/actions/reservations";
import { setTakeoutStatus } from "@/actions/takeout";
import { Badge, Card, LinkButton, PageHeader, classificationTone, reservationTone, takeoutTone } from "@/components/ui";
import { NotificationList } from "@/components/notification-list";
import { RESERVATION_TRANSITIONS, StatusButtons, TAKEOUT_TRANSITIONS } from "@/components/status-buttons";
import { Reveal } from "@/components/reveal";
import { CountUp } from "@/components/count-up";
import { StatTile } from "@/components/stat-tile";
import { Columns, StackedColumns } from "@/components/charts";

export const metadata = { title: "Home" };

/** Quiet text link used for card actions — the page keeps a single primary button (the header CTA). */
function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
      {children} <ArrowRightIcon size={16} />
    </Link>
  );
}

function Quiet({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-gray-500">{children}</p>;
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-xl font-black tabular-nums">{value}</p>
      {sub ? <p className="text-xs text-gray-500">{sub}</p> : null}
    </div>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ changed?: string }> }) {
  const { account, previousSeenAt } = await requireAccount();
  const { changed } = await searchParams; // id whose status just changed → its badge pops
  const tz = account.timeZone;
  const today = todayString(tz);
  const now = nowUtc();
  const { start, end } = dayBoundsUtc(today, tz);

  const [sinceItems, unacknowledged, todaysReservations, openOrders, dash] = await Promise.all([
    prisma.notification.findMany({
      where: { accountId: account.id, ...(previousSeenAt ? { createdAt: { gt: previousSeenAt } } : { readAt: null }) },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.notification.findMany({ where: { accountId: account.id, priority: "urgent", acknowledgedAt: null }, orderBy: { createdAt: "desc" } }),
    prisma.reservation.findMany({
      where: { accountId: account.id, startTime: { gte: start, lt: end }, status: { notIn: ["cancelled"] } },
      orderBy: { startTime: "asc" },
    }),
    prisma.takeoutOrder.findMany({ where: { accountId: account.id, status: { in: ["new", "confirmed", "ready"] } }, orderBy: { pickupTime: "asc" }, take: 20 }),
    loadDashboard(account),
  ]);

  const t = dash.tiles;
  const urgentIds = new Set(unacknowledged.map((n) => n.id));
  const fresh = sinceItems.filter((n) => !urgentIds.has(n.id));
  const hasNews = unacknowledged.length > 0 || fresh.length > 0;
  const hasCallbacks = dash.callbacks.length > 0;
  const weekCalls = dash.callsByDay.reduce((sum, d) => sum + Object.values(d.values as Record<string, number>).reduce((a, b) => a + b, 0), 0);
  const coversAhead = dash.coversAhead.reduce((sum, d) => sum + d.value, 0);
  const showWeek = weekCalls > 0 || coversAhead > 0;
  const fmtHour = (hr: number) => `${hr % 12 === 0 ? 12 : hr % 12} ${hr < 12 ? "AM" : "PM"}`;
  const s = dash.ai.sentiment;
  const sentimentTotal = s.positive + s.neutral + s.negative;
  const mood = sentimentTotal === 0 ? null : s.positive >= s.neutral && s.positive >= s.negative ? "Positive" : s.negative > s.neutral ? "Negative" : "Neutral";
  const moodPct = mood ? Math.round(((mood === "Positive" ? s.positive : mood === "Negative" ? s.negative : s.neutral) / sentimentTotal) * 100) : null;

  return (
    <div className="space-y-5">
      <PageHeader title="Home" subtitle={formatDateLong(now, tz)} action={<LinkButton href="/reservations/new" size="sm">+ Reservation</LinkButton>} />

      {/* KPI row */}
      <Reveal index={0} className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Calls today" value={t.callsToday} icon="phone" live href="/calls" delta={{ value: t.callsDelta, label: "vs yesterday" }} note={t.liveCalls > 0 ? `${t.liveCalls} live now` : undefined} />
        <StatTile label="Covers today" value={t.coversToday} icon="utensils" href={`/reservations?date=${today}`} delta={{ value: t.coversDelta, label: "vs yesterday" }} />
        <StatTile label="Open orders" value={t.openOrders} icon="bag" href="/takeout" />
        <StatTile label="Unread" value={t.unread} icon="bell" live href="/notifications" note={t.unread === 0 ? "All caught up" : undefined} />
      </Reveal>

      {/* What needs you — only rendered when there is something to act on */}
      {hasNews || hasCallbacks ? (
        <div className={`grid gap-5 ${hasNews && hasCallbacks ? "lg:grid-cols-2 lg:items-start" : ""}`}>
          {hasNews ? (
            <Reveal index={1}>
              <Card title={unacknowledged.length > 0 ? "Needs your attention" : "Since you last signed in"} className={unacknowledged.length > 0 ? "border-red-200" : undefined} action={<CardLink href="/notifications">Inbox</CardLink>}>
                <NotificationList items={[...unacknowledged, ...fresh].slice(0, 6)} compact />
                {unacknowledged.length + fresh.length > 6 ? (
                  <Link href="/notifications" className="mt-3 flex items-center justify-center gap-1 text-sm font-semibold text-brand-700">
                    See all {unacknowledged.length + fresh.length} <ArrowRightIcon size={16} />
                  </Link>
                ) : null}
              </Card>
            </Reveal>
          ) : null}

          {hasCallbacks ? (
            <Reveal index={hasNews ? 2 : 1}>
              <Card
                title={
                  <>
                    Callbacks owed · <CountUp to={dash.callbacks.length} />
                  </>
                }
                action={<CardLink href="/calls?type=message">Messages</CardLink>}
              >
                <ul className="divide-y divide-gray-100">
                  {dash.callbacks.map((c, i) => (
                    <Reveal as="li" index={i + 1} key={c.id} className="py-2.5">
                      <Link href={`/calls/${c.id}`} className="lift -mx-2 flex items-start justify-between gap-3 rounded-lg px-2 py-1 hover:bg-gray-50">
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">
                            {c.callerName ?? "Unknown caller"}
                            {c.callerPhone ? <span className="font-normal text-gray-500"> · {formatUsPhone(c.callerPhone)}</span> : null}
                          </span>
                          {c.messageText ? <span className="line-clamp-1 text-sm text-gray-600">{c.messageText}</span> : null}
                          <span className="text-xs text-gray-500">{timeAgo(c.startedAt, now)}</span>
                        </span>
                        <Badge tone={c.escalationReason ? "red" : classificationTone[c.classification]} className="shrink-0">
                          {c.escalationReason ? humanize(c.escalationReason) : humanize(c.classification)}
                        </Badge>
                      </Link>
                    </Reveal>
                  ))}
                </ul>
              </Card>
            </Reveal>
          ) : null}
        </div>
      ) : (
        <Reveal index={1}>
          <p className="text-sm text-gray-500">
            Nothing new since you last signed in{previousSeenAt ? ` (${formatDateTime(previousSeenAt, tz)})` : ""}.{" "}
            <Link href="/notifications" className="font-semibold text-brand-700">
              Inbox
            </Link>
          </p>
        </Reveal>
      )}

      {/* Today */}
      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <Reveal index={2}>
          <Card
            title={
              <>
                Today&apos;s reservations · <CountUp to={t.coversToday} /> covers
              </>
            }
            action={<CardLink href={`/reservations?date=${today}`}>Book</CardLink>}
          >
            {todaysReservations.length === 0 ? (
              <Quiet>
                No reservations today.{" "}
                <Link href="/reservations/new" className="font-semibold text-brand-700">
                  Add one
                </Link>
              </Quiet>
            ) : (
              <ul className="divide-y divide-gray-100">
                {todaysReservations.map((r, i) => (
                  <Reveal as="li" index={i + 1} key={r.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <Link href={`/reservations/${r.id}`} className="block font-semibold">
                        {formatTime(r.startTime, tz)} · {r.guestName}
                      </Link>
                      <p className="text-sm text-gray-500">
                        Party of {r.partySize}
                        {r.isWaitlist ? " · waitlist" : ""}
                        {r.seatingPreference ? ` · ${r.seatingPreference}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone={reservationTone[r.status]} className={changed === r.id ? "badge-pop" : undefined}>{humanize(r.status)}</Badge>
                      <StatusButtons id={r.id} current={r.status} transitions={RESERVATION_TRANSITIONS[r.status].slice(0, 1)} action={setReservationStatus} returnTo="/dashboard" size="sm" />
                    </div>
                  </Reveal>
                ))}
              </ul>
            )}
          </Card>
        </Reveal>

        <Reveal index={3}>
          <Card
            title={
              <>
                Takeout orders · <CountUp to={openOrders.length} /> open
              </>
            }
            action={<CardLink href="/takeout">Takeout</CardLink>}
          >
            {openOrders.length === 0 ? (
              <Quiet>
                No open orders.{" "}
                <Link href="/takeout/new" className="font-semibold text-brand-700">
                  Add one
                </Link>
              </Quiet>
            ) : (
              <ul className="divide-y divide-gray-100">
                {openOrders.map((o, i) => (
                  <Reveal as="li" index={i + 1} key={o.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <Link href={`/takeout/${o.id}`} className="block font-semibold">
                        {formatDateTime(o.pickupTime, tz)} · {o.guestName}
                      </Link>
                      <p className="line-clamp-1 text-sm text-gray-500">
                        {o.isDelivery ? "Delivery" : "Pickup"}
                        {o.guestPhone ? ` · ${formatUsPhone(o.guestPhone)}` : ""} · {o.items}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone={takeoutTone[o.status]} className={changed === o.id ? "badge-pop" : undefined}>{humanize(o.status)}</Badge>
                      <StatusButtons id={o.id} current={o.status} transitions={TAKEOUT_TRANSITIONS[o.status].slice(0, 1)} action={setTakeoutStatus} returnTo="/dashboard" size="sm" />
                    </div>
                  </Reveal>
                ))}
              </ul>
            )}
          </Card>
        </Reveal>
      </div>

      {/* The week — hidden until there is something to chart */}
      {showWeek ? (
        <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
          <Reveal index={4}>
            <Card title="Calls this week" action={<span className="text-xs text-gray-500">Last 7 days · by outcome</span>}>
              <StackedColumns days={dash.callsByDay} series={[...CALL_SERIES]} title="Calls per day, last 7 days, by outcome" />
              {dash.ai.answered > 0 ? (
                <div className="mt-4 grid grid-cols-2 gap-4 border-t border-gray-100 pt-4 sm:grid-cols-4">
                  <Stat label={`${account.hostName} answered`} value={<CountUp to={dash.ai.answered} />} />
                  <Stat label="Handled solo" value={dash.ai.handledPct != null ? `${dash.ai.handledPct}%` : "—"} sub="no callback needed" />
                  <Stat label="Avg length" value={formatDuration(dash.ai.avgDuration)} />
                  <Stat label="Caller mood" value={mood ?? "—"} sub={[moodPct != null ? `${moodPct}% of calls` : null, dash.ai.peakHour != null ? `busiest ${fmtHour(dash.ai.peakHour)}` : null].filter(Boolean).join(" · ") || undefined} />
                </div>
              ) : null}
            </Card>
          </Reveal>
          <Reveal index={5}>
            <Card
              title="Covers ahead"
              action={
                <span className="text-xs text-gray-500">
                  Next 7 days{t.aiBookedAhead > 0 ? ` · ${t.aiBookedAhead} booked by ${account.hostName}` : ""}
                </span>
              }
            >
              <Columns items={dash.coversAhead} title="Covers booked per day, next 7 days" unit=" covers" />
            </Card>
          </Reveal>
        </div>
      ) : null}
    </div>
  );
}
