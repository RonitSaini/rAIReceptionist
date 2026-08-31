import { ArrowRightIcon } from "@/components/icons";
import { DrawIcon } from "@/components/draw-icon";
import type { Notification } from "@prisma/client";
import { acknowledgeNotification, markNotificationRead, openNotification } from "@/actions/notifications";
import { notificationHref, notificationIcon, notificationLabel } from "@/lib/notifications";
import type { Vocabulary } from "@/verticals/types";
import { timeAgo } from "@/lib/time";
import { Badge, StatusDot, notificationTone } from "@/components/ui";
import { Reveal } from "@/components/reveal";

export function NotificationList({ items, compact = false, grid = false, words }: { items: Notification[]; compact?: boolean; grid?: boolean; words?: Vocabulary }) {
  const now = new Date();
  return (
    <ul className={grid ? "grid gap-3 xl:grid-cols-2 3xl:grid-cols-3" : "divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 bg-surface"}>
      {items.map((n, i) => {
        const unread = !n.readAt;
        const needsAck = n.priority === "urgent" && !n.acknowledgedAt;
        const href = notificationHref(n);
        return (
          <Reveal as="li" index={i} key={n.id} className={`flex gap-3 p-4 ${grid ? "lift rounded-2xl border border-gray-200 bg-surface" : ""} ${unread ? "bg-brand-50/40" : ""} ${needsAck ? "border-l-4 border-l-red-500" : ""}`}>
            <DrawIcon name={notificationIcon(n)} size={20} draw={false} className={`mt-0.5 shrink-0 ${needsAck ? "text-red-600" : "text-gray-400"}`} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={notificationTone[n.type]}>{notificationLabel(n, words)}</Badge>
                {n.priority === "urgent" ? <Badge tone="red">Urgent</Badge> : null}
                {unread ? <StatusDot className="text-brand-600" label="Unread" /> : null}
                <span className="ml-auto text-xs text-gray-500">{timeAgo(n.createdAt, now)}</span>
              </div>
              {/* Opening marks it read, so it's a POST (server action), never a prefetchable GET. */}
              <form action={openNotification} className="mt-1">
                <input type="hidden" name="id" value={n.id} />
                <button type="submit" className="block w-full text-left">
                  <span className={`block text-sm ${unread ? "font-bold" : "font-semibold"}`}>{n.title}</span>
                  {!compact || n.body ? <span className="mt-0.5 block line-clamp-2 text-sm text-gray-600">{n.body}</span> : null}
                </button>
              </form>
              <div className="mt-2 flex flex-wrap gap-2">
                {href !== "/notifications" ? (
                  <form action={openNotification}>
                    <input type="hidden" name="id" value={n.id} />
                    <button type="submit" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
                      Open <ArrowRightIcon size={16} />
                    </button>
                  </form>
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
          </Reveal>
        );
      })}
    </ul>
  );
}
