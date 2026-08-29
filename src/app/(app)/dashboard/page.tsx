import Link from "next/link";
import { ArrowRightIcon } from "@/components/icons";
import { requireAccount } from "@/lib/current-account";
import { prisma } from "@/lib/prisma";
import { dayBoundsUtc, formatDateLong, formatDateTime, formatTime, todayString } from "@/lib/time";
import { formatUsPhone } from "@/lib/form";
import { humanize } from "@/lib/constants";
import { NOTIFICATION_TYPE_LABEL } from "@/lib/notifications";
import { setReservationStatus } from "@/actions/reservations";
import { setTakeoutStatus } from "@/actions/takeout";
import { Badge, Card, EmptyState, LinkButton, PageHeader, reservationTone, takeoutTone } from "@/components/ui";
import { NotificationList } from "@/components/notification-list";
import { RESERVATION_TRANSITIONS, StatusButtons, TAKEOUT_TRANSITIONS } from "@/components/status-buttons";

export const metadata = { title: "Home" };

export default async function DashboardPage() {
  const { account, previousSeenAt } = await requireAccount();
  const tz = account.timeZone;
  const today = todayString(tz);
  const { start, end } = dayBoundsUtc(today, tz);

  const [sinceItems, unacknowledged, todaysReservations, openOrders] = await Promise.all([
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
  ]);

  const counts = sinceItems.reduce<Record<string, number>>((acc, n) => {
    acc[n.type] = (acc[n.type] ?? 0) + 1;
    return acc;
  }, {});
  const coversToday = todaysReservations.filter((r) => !r.isWaitlist).reduce((s, r) => s + r.partySize, 0);

  return (
    <div className="space-y-5">
      <PageHeader title="Home" subtitle={formatDateLong(new Date(), tz)} />

      {/* Two columns on wide desktops: activity on the left, today's service on the right. */}
      <div className="grid gap-5 2xl:grid-cols-2 2xl:items-start">
      <div className="space-y-5">
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
            <NotificationList items={sinceItems.slice(0, 8)} compact />
            {sinceItems.length > 8 ? (
              <Link href="/notifications" className="mt-3 flex items-center justify-center gap-1 text-sm font-semibold text-brand-700">
                See all {sinceItems.length} <ArrowRightIcon size={16} />
              </Link>
            ) : null}
          </>
        )}
      </Card>
      </div>

      <div className="space-y-5">
      <Card
        title={`Today's reservations · ${coversToday} covers`}
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
        title={`Open takeout orders · ${openOrders.length}`}
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
      </div>
      </div>
    </div>
  );
}
