import Link from "next/link";
import type { Account } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dayBoundsUtc, formatDateLong, formatDateTime, formatTime, nowUtc, todayString } from "@/lib/time";
import { formatUsPhone } from "@/lib/form";
import { humanize } from "@/lib/constants";
import { loadDashboard } from "@/lib/dashboard";
import { setReservationStatus } from "@/actions/reservations";
import { setTakeoutStatus } from "@/actions/takeout";
import { Badge, Card, LinkButton, PageHeader, reservationTone, takeoutTone } from "@/components/ui";
import { RESERVATION_TRANSITIONS, StatusButtons, TAKEOUT_TRANSITIONS } from "@/components/status-buttons";
import { Reveal } from "@/components/reveal";
import { CountUp } from "@/components/count-up";
import { StatTile } from "@/components/stat-tile";
import { Columns } from "@/components/charts";
import { CallsThisWeek, CardLink, NeedsYou, Quiet } from "./shared";

/**
 * The restaurant home page, unchanged from before there were archetypes. It is a separate file only
 * so that dashboard/page.tsx can choose between it and the field-service one; the markup, the
 * ordering and the Reveal indices are all exactly what they were.
 */
export async function RestaurantHome({ account, previousSeenAt, changed }: { account: Account; previousSeenAt: Date | null; changed?: string }) {
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
  const weekCalls = dash.callsByDay.reduce((sum, d) => sum + Object.values(d.values as Record<string, number>).reduce((a, b) => a + b, 0), 0);
  const coversAhead = dash.coversAhead.reduce((sum, d) => sum + d.value, 0);
  const showWeek = weekCalls > 0 || coversAhead > 0;

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
      <NeedsYou unacknowledged={unacknowledged} fresh={fresh} callbacks={dash.callbacks} previousSeenAt={previousSeenAt} now={now} tz={tz} account={account} />

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
            <CallsThisWeek account={account} dash={dash} />
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
