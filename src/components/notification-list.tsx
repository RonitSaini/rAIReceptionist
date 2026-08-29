import Link from "next/link";
import { ArrowRightIcon } from "@/components/icons";
import type { Notification } from "@prisma/client";
import { acknowledgeNotification, markNotificationRead } from "@/actions/notifications";
import { NOTIFICATION_TYPE_ICON, NOTIFICATION_TYPE_LABEL, notificationHref } from "@/lib/notifications";
import { timeAgo } from "@/lib/time";
import { Badge, notificationTone } from "@/components/ui";

export function NotificationList({ items, compact = false, grid = false }: { items: Notification[]; compact?: boolean; grid?: boolean }) {
  const now = new Date();
  return (
    <ul className={grid ? "grid gap-3 xl:grid-cols-2 3xl:grid-cols-3" : "divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 bg-surface"}>
      {items.map((n) => {
        const unread = !n.readAt;
        const needsAck = n.priority === "urgent" && !n.acknowledgedAt;
        const href = notificationHref(n);
        return (
          <li key={n.id} className={`flex gap-3 p-4 ${grid ? "rounded-2xl border border-gray-200 bg-surface" : ""} ${unread ? "bg-brand-50/40" : ""} ${needsAck ? "border-l-4 border-l-red-500" : ""}`}>
            <span className="text-xl" aria-hidden="true">
              {NOTIFICATION_TYPE_ICON[n.type]}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={notificationTone[n.type]}>{NOTIFICATION_TYPE_LABEL[n.type]}</Badge>
                {n.priority === "urgent" ? <Badge tone="red">Urgent</Badge> : null}
                {unread ? <span className="h-2 w-2 rounded-full bg-brand-600" aria-label="Unread" /> : null}
                <span className="ml-auto text-xs text-gray-500">{timeAgo(n.createdAt, now)}</span>
              </div>
              <Link href={`/notifications/open/${n.id}`} className="mt-1 block">
                <p className={`text-sm ${unread ? "font-bold" : "font-semibold"}`}>{n.title}</p>
                {!compact || n.body ? <p className="mt-0.5 line-clamp-2 text-sm text-gray-600">{n.body}</p> : null}
              </Link>
              <div className="mt-2 flex flex-wrap gap-2">
                {href !== "/notifications" ? (
                  <Link href={`/notifications/open/${n.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
                    Open <ArrowRightIcon size={16} />
                  </Link>
                ) : null}
                {needsAck ? (
                  <form action={acknowledgeNotification}>
                    <input type="hidden" name="id" value={n.id} />
                    <button type="submit" className="rounded-lg bg-red-600 px-3 py-1 text-sm font-semibold text-white hover:bg-red-700">
                      Acknowledge
                    </button>
                  </form>
                ) : n.acknowledgedAt && n.priority === "urgent" ? (
                  <span className="text-xs text-gray-500">Acknowledged</span>
                ) : null}
                {unread ? (
                  <form action={markNotificationRead}>
                    <input type="hidden" name="id" value={n.id} />
                    <button type="submit" className="text-sm font-semibold text-gray-500 hover:text-ink">
                      Mark read
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
