import Link from "next/link";
import type { NotificationType } from "@prisma/client";
import { requireAccount } from "@/lib/current-account";
import { prisma } from "@/lib/prisma";
import { FIELD_SERVICE_NOTIFICATION_TYPES, NOTIFICATION_TYPES } from "@/lib/constants";
import { NOTIFICATION_TYPE_LABEL } from "@/lib/notifications";
import { verticalFor, vocabularyFor } from "@/verticals";
import { markAllNotificationsRead } from "@/actions/notifications";
import { Button, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { NotificationList } from "@/components/notification-list";
import { SegmentedLinks } from "@/components/segmented-links";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ type?: string; unread?: string }> }) {
  const { account } = await requireAccount();
  const { type, unread } = await searchParams;
  const unreadOnly = unread === "1";

  // A trade is never sent a reservation, a takeout order or a waitlist entry, so offering those as
  // filters would be offering chips that can only ever come back empty. Its bookings are `job`
  // notifications, read out in the vocabulary: "Service calls" for a plumber, "Estimates" for a roofer.
  const words = vocabularyFor(account);
  const isRestaurant = verticalFor(account).archetype === "restaurant";
  const filterTypes: readonly NotificationType[] = isRestaurant ? NOTIFICATION_TYPES : FIELD_SERVICE_NOTIFICATION_TYPES;
  const typeFilter = filterTypes.includes(type as NotificationType) ? (type as NotificationType) : null;
  const labelFor = (t: NotificationType) => (t === "job" ? words.booking.Many : NOTIFICATION_TYPE_LABEL[t]);
  const typeLabel = typeFilter ? labelFor(typeFilter) : null;

  const [items, unreadCount, totalCount] = await Promise.all([
    prisma.notification.findMany({
      where: { accountId: account.id, ...(typeFilter ? { type: typeFilter } : {}), ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.notification.count({ where: { accountId: account.id, readAt: null } }),
    prisma.notification.count({ where: { accountId: account.id } }),
  ]);

  const filterHref = (t: string | null, u: boolean) => {
    const p = new URLSearchParams();
    if (t) p.set("type", t);
    if (u) p.set("unread", "1");
    const q = p.toString();
    return q ? `/notifications?${q}` : "/notifications";
  };

  // Explain an empty result in terms of the active filters, with one-click ways out.
  let empty: { title: string; body?: string; action?: React.ReactNode; tone?: "neutral" | "clear" };
  if (totalCount === 0) {
    empty = {
      title: "No notifications yet",
      body: isRestaurant
        ? "New reservations, orders, messages and escalations will show up here."
        : `New ${words.booking.many}, messages and escalations will show up here.`,
    };
  } else if (unreadOnly && typeFilter) {
    empty = {
      title: `No unread ${typeLabel!.toLowerCase()} notifications`,
      body: "You've read them all. The “Unread only” filter is still on.",
      action: (
        <div className="flex flex-wrap justify-center gap-2">
          <LinkButton href={filterHref(typeFilter, false)} size="sm">
            Show all {typeLabel!.toLowerCase()}
          </LinkButton>
          <LinkButton href={filterHref(null, true)} size="sm" variant="secondary">
            All unread
          </LinkButton>
        </div>
      ),
    };
  } else if (unreadOnly) {
    empty = { title: "You're all caught up", tone: "clear" as const, body: "No unread notifications.", action: <LinkButton href="/notifications" size="sm">Show all notifications</LinkButton> };
  } else if (typeLabel) {
    empty = { title: `No ${typeLabel.toLowerCase()} notifications yet`, action: <LinkButton href="/notifications" size="sm" variant="secondary">Show all types</LinkButton> };
  } else {
    empty = { title: "No notifications" };
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notifications"
        subtitle={unreadCount === 0 ? "All caught up" : `${unreadCount} unread`}
        action={
          unreadCount > 0 ? (
            <form action={markAllNotificationsRead}>
              <Button type="submit" variant="secondary" size="sm">
                Mark all read
              </Button>
            </form>
          ) : null
        }
      />

      {/* "Unread only" is an independent toggle (colour swap); the type chips are one choice, so the
          soft fill slides between them. */}
      <SegmentedLinks
        role="group"
        aria-label="Filters"
        fill="soft"
        pressed
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
        itemClass="shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold"
        activeClass="border-brand-600 bg-brand-50 text-brand-800"
        inactiveClass="border-gray-300 bg-surface text-gray-700"
        leading={
          <Link href={filterHref(typeFilter, !unreadOnly)} aria-pressed={unreadOnly} className={`press-soft shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold ${unreadOnly ? "border-brand-600 bg-brand-600 text-white" : "border-gray-300 bg-surface text-gray-700"}`}>
            Unread only · {unreadCount}
            {unreadOnly ? <span aria-hidden="true"> ✕</span> : null}
          </Link>
        }
        items={[
          { key: "all", href: filterHref(null, unreadOnly), label: "All types", active: !typeFilter },
          ...filterTypes.map((t) => ({ key: t, href: filterHref(t, unreadOnly), label: labelFor(t), active: typeFilter === t })),
        ]}
      />

      {unreadOnly || typeFilter ? (
        <p className="text-xs text-gray-500">
          Showing {unreadOnly ? "unread " : ""}
          {typeLabel ? typeLabel.toLowerCase() : "all"} notifications · {items.length} {items.length === 1 ? "item" : "items"}
          {unreadOnly || typeFilter ? (
            <>
              {" · "}
              <Link href="/notifications" className="font-semibold text-brand-700">
                Clear filters
              </Link>
            </>
          ) : null}
        </p>
      ) : null}

      {items.length === 0 ? <EmptyState title={empty.title} body={empty.body} action={empty.action} tone={empty.tone} /> : <NotificationList items={items} grid words={vocabularyFor(account)} />}
    </div>
  );
}
