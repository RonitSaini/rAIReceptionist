import Link from "next/link";
import { ArrowRightIcon } from "@/components/icons";
import { requireAccount } from "@/lib/current-account";
import { prisma } from "@/lib/prisma";
import { dayBoundsUtc, formatDateLong, formatDateTime, formatDuration, formatTime, nowUtc, timeAgo, todayString } from "@/lib/time";
import { formatUsPhone } from "@/lib/form";
import { humanize } from "@/lib/constants";
import { NOTIFICATION_TYPE_LABEL } from "@/lib/notifications";
import { CALL_SERIES, loadDashboard } from "@/lib/dashboard";
import { setReservationStatus } from "@/actions/reservations";
import { setTakeoutStatus } from "@/actions/takeout";
import { Badge, Card, EmptyState, LinkButton, PageHeader, StatusDot, classificationTone, reservationTone, takeoutTone } from "@/components/ui";
import { NotificationList } from "@/components/notification-list";
import { RESERVATION_TRANSITIONS, StatusButtons, TAKEOUT_TRANSITIONS } from "@/components/status-buttons";
import { Reveal } from "@/components/reveal";
import { CountUp } from "@/components/count-up";
import { StatTile } from "@/components/stat-tile";
import { Columns, HourBars, SegmentBar, StackedColumns } from "@/components/charts";

export const metadata = { title: "Home" };

export default async function DashboardPage() {
  const { account, previousSeenAt } = await requireAccount();
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

  const counts = sinceItems.reduce<Record<string, number>>((acc, n) => {
    acc[n.type] = (acc[n.type] ?? 0) + 1;
    return acc;
  }, {});
  const t = dash.tiles;
  const fmtHour = (hr: number) => `${hr % 12 === 0 ? 12 : hr % 12} ${hr < 12 ? "AM" : "PM"}`;

  return (
    <div className="space-y-5">
      <PageHeader title="Home" subtitle={formatDateLong(now, tz)} action={<LinkButton href="/reservations/new" size="sm">+ Reservation</LinkButton>} />

      {/* KPI row */}
      <Reveal index={0} className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Calls today" value={t.callsToday} icon="📞" href="/calls" delta={{ value: t.callsDelta, label: "vs yesterday" }} />
        <StatTile label="Covers today" value={t.coversToday} icon="🍽️" href={`/reservations?date=${today}`} delta={{ value: t.coversDelta, label: "vs yesterday" }} />
        <StatTile label="Open orders" value={t.openOrders} icon="🥡" href="/takeout" note={t.openOrders === 0 ? "Nothing waiting" : "New · confirmed · ready"} />
        <StatTile label="Unread" value={t.unread} icon="🔔" href="/notifications" note={t.liveCalls > 0 ? `${t.liveCalls} call${t.liveCalls === 1 ? "" : "s"} live now` : "All caught up"} />
      </Reveal>

      <div className="grid gap-5 2xl:grid-cols-2 2xl:items-start">
        <Reveal className="space-y-5" index={1}>
          {unacknowledged.length > 0 ? (
            <Card title="Needs your attention" className="border-red-200">
              <NotificationList items={unacknowledged} compact />
            </Card>
          ) : null}

          <Card
            title={previousSeenAt ? `Since you last signed in (${formatDateTime(previousSeenAt, tz)})` : "Since you last signed in"}
            action={
              <Link href="/notifications" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
                Inbox <ArrowRightIcon size={16} />
              </Link>
            }
          >
            {sinceItems.length === 0 ? (
              <p className="text-sm text-gray-500">Nothing new. You&apos;re all caught up.</p>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap gap-2">
                  {Object.entries(counts).map(([type, n]) => (
                    <Badge key={type} tone="brand">
                      {n} {NOTIFICATION_TYPE_LABEL[type as keyof typeof NOTIFICATION_TYPE_LABEL] ?? humanize(type)}
                      {n === 1 ? "" : "s"}
                    </Badge>
                  ))}
                </div>
                <NotificationList items={sinceItems.slice(0, 6)} compact />
                {sinceItems.length > 6 ? (
                  <Link href="/notifications" className="mt-3 flex items-center justify-center gap-1 text-sm font-semibold text-brand-700">
                    See all {sinceItems.length} <ArrowRightIcon size={16} />
                  </Link>
                ) : null}
              </>
            )}
          </Card>

          <Card
            title="Callbacks owed"
            action={
              <Link href="/calls?type=message" className="text-sm font-semibold text-brand-700">
                Messages
              </Link>
            }
          >
            {dash.callbacks.length === 0 ? (
              <p className="text-sm text-gray-500">No one is waiting on a call back. Nice.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {dash.callbacks.map((c) => (
                  <li key={c.id} className="py-2.5">
                    <Link href={`/calls/${c.id}`} className="flex items-start justify-between gap-3">
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
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Reveal>

        <Reveal className="space-y-5" index={2}>
          <Card
            title={
              <>
                Today&apos;s reservations · <CountUp to={t.coversToday} /> covers
              </>
            }
            action={
              <LinkButton href="/reservations/new" size="sm">
                + Add
              </LinkButton>
            }
          >
            {todaysReservations.length === 0 ? (
              <EmptyState title="No reservations today" />
            ) : (
              <ul className="divide-y divide-gray-100">
                {todaysReservations.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-3">
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
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge tone={reservationTone[r.status]}>{humanize(r.status)}</Badge>
                      <StatusButtons id={r.id} current={r.status} transitions={RESERVATION_TRANSITIONS[r.status].slice(0, 1)} action={setReservationStatus} returnTo="/dashboard" size="sm" />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Link href={`/reservations?date=${today}`} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
              Open today&apos;s book <ArrowRightIcon size={16} />
            </Link>
          </Card>

          <Card
            title={
              <>
                Open takeout orders · <CountUp to={openOrders.length} />
              </>
            }
            action={
              <LinkButton href="/takeout/new" size="sm">
                + Add
              </LinkButton>
            }
          >
            {openOrders.length === 0 ? (
              <EmptyState title="No open orders" />
            ) : (
              <ul className="divide-y divide-gray-100">
                {openOrders.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <Link href={`/takeout/${o.id}`} className="block font-semibold">
                        {formatDateTime(o.pickupTime, tz)} · {o.guestName}
                      </Link>
                      <p className="line-clamp-1 text-sm text-gray-500">
                        {o.isDelivery ? "Delivery" : "Pickup"}
                        {o.guestPhone ? ` · ${formatUsPhone(o.guestPhone)}` : ""} · {o.items}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge tone={takeoutTone[o.status]}>{humanize(o.status)}</Badge>
                      <StatusButtons id={o.id} current={o.status} transitions={TAKEOUT_TRANSITIONS[o.status].slice(0, 1)} action={setTakeoutStatus} returnTo="/dashboard" size="sm" />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Reveal>
      </div>

      {/* Charts */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Reveal index={3}>
          <Card title="Calls this week" action={<span className="text-xs text-gray-500">Last 7 days · by outcome</span>}>
            <StackedColumns days={dash.callsByDay} series={[...CALL_SERIES]} title="Calls per day, last 7 days, by outcome" />
          </Card>
        </Reveal>
        <Reveal index={4}>
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

      <Reveal index={5}>
        <Card title={`${account.hostName} this week`} action={<span className="text-xs text-gray-500">Real calls only · last 7 days</span>}>
          {dash.ai.answered === 0 ? (
            <p className="text-sm text-gray-500">
              No real calls yet this week. Once {account.hostName} is answering your line, you&apos;ll see how many calls were handled end-to-end, how long they took, how callers felt, and when your phone is busiest.
            </p>
          ) : (
            <div className="grid gap-5 md:grid-cols-3">
              <div className="grid grid-cols-3 gap-3 md:col-span-3 lg:col-span-1 lg:grid-cols-1">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Answered</p>
                  <p className="text-2xl font-black tabular-nums">
                    <CountUp to={dash.ai.answered} />
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Handled solo</p>
                  <p className="text-2xl font-black tabular-nums">{dash.ai.handledPct != null ? `${dash.ai.handledPct}%` : "—"}</p>
                  <p className="text-xs text-gray-500">no callback needed</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Avg length</p>
                  <p className="text-2xl font-black tabular-nums">{formatDuration(dash.ai.avgDuration)}</p>
                </div>
              </div>
              <div className="md:col-span-3 lg:col-span-1">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">How callers felt</p>
                <SegmentBar
                  title="Caller sentiment, last 7 days"
                  segments={[
                    { label: "Positive", value: dash.ai.sentiment.positive, color: "var(--viz-good)" },
                    { label: "Neutral", value: dash.ai.sentiment.neutral, color: "var(--viz-neutral)" },
                    { label: "Negative", value: dash.ai.sentiment.negative, color: "var(--viz-critical)" },
                  ]}
                />
              </div>
              <div className="md:col-span-3 lg:col-span-1">
                <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Busiest hours <span className="normal-case tracking-normal text-gray-400">last 30 days</span>
                  {dash.ai.peakHour != null ? (
                    <span className="ml-auto inline-flex items-center gap-1 normal-case tracking-normal text-gray-600">
                      <StatusDot className="text-brand-600" /> peak {fmtHour(dash.ai.peakHour)}
                    </span>
                  ) : null}
                </p>
                <HourBars counts={dash.ai.hourCounts} title="Calls by hour of day, last 30 days" tz={tz} />
              </div>
            </div>
          )}
        </Card>
      </Reveal>
    </div>
  );
}
