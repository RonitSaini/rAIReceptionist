import Link from "next/link";
import type { NotificationType } from "@prisma/client";
import { requireAccount } from "@/lib/current-account";
import { prisma } from "@/lib/prisma";
import { NOTIFICATION_TYPES } from "@/lib/constants";
import { NOTIFICATION_TYPE_LABEL } from "@/lib/notifications";
import { markAllNotificationsRead } from "@/actions/notifications";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import { NotificationList } from "@/components/notification-list";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ type?: string; unread?: string }> }) {
  const { account } = await requireAccount();
  const { type, unread } = await searchParams;
  const typeFilter = NOTIFICATION_TYPES.includes(type as NotificationType) ? (type as NotificationType) : null;
  const unreadOnly = unread === "1";

  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { accountId: account.id, ...(typeFilter ? { type: typeFilter } : {}), ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.notification.count({ where: { accountId: account.id, readAt: null } }),
  ]);

  const filterHref = (t: string | null, u: boolean) => {
    const p = new URLSearchParams();
    if (t) p.set("type", t);
    if (u) p.set("unread", "1");
    const q = p.toString();
    return q ? `/notifications?${q}` : "/notifications";
  };

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

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link href={filterHref(typeFilter, !unreadOnly)} className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold ${unreadOnly ? "border-brand-600 bg-brand-600 text-white" : "border-gray-300 bg-surface text-gray-700"}`}>
          Unread only
        </Link>
        <Link href={filterHref(null, unreadOnly)} className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold ${!typeFilter ? "border-brand-600 bg-brand-50 text-brand-800" : "border-gray-300 bg-surface text-gray-700"}`}>
          All types
        </Link>
        {NOTIFICATION_TYPES.map((t) => (
          <Link key={t} href={filterHref(t, unreadOnly)} className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold ${typeFilter === t ? "border-brand-600 bg-brand-50 text-brand-800" : "border-gray-300 bg-surface text-gray-700"}`}>
            {NOTIFICATION_TYPE_LABEL[t]}
          </Link>
        ))}
      </div>

      {items.length === 0 ? <EmptyState title="No notifications" body="New reservations, orders, messages and escalations will show up here." /> : <NotificationList items={items} grid />}
    </div>
  );
}
