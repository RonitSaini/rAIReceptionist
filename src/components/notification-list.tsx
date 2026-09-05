"use client";

import { ArrowRightIcon } from "@/components/icons";
import { DrawIcon } from "@/components/draw-icon";
import type { Notification } from "@prisma/client";
import { acknowledgeNotification, markNotificationRead, openNotification } from "@/actions/notifications";
import { notificationHref, notificationIcon, notificationLabel } from "@/lib/notifications";
import type { Vocabulary } from "@/verticals/types";
import { timeAgo } from "@/lib/time";
import { Badge, StatusDot, notificationTone } from "@/components/ui";
import { MotionList } from "@/components/motion-list";
import { DismissButton, UndoBar, useDismiss } from "@/components/notification-dismiss";

/**
 * `arrival` opts the list into the page's content arrival (motion spec §10): the inbox page asks for
 * it, and the dashboard's Needs-attention card does NOT — it is already inside an arriving card, and
 * an element takes part in exactly one entrance per arrival (§8.1). Unacknowledged rows carry
 * `data-urgent` either way, so an alarm is never staggered behind ordinary notifications.
 *
 * `dismissible` is the inbox only. The dashboard card is a summary of what needs attention, not a
 * place to manage the feed, and a row leaving it would just come back on the next render.
 *
 * A client component since the dismiss/undo pair is client state; the rows themselves still come
 * from the server render, so a dismissed row leaves because the server no longer sends it and
 * `<MotionList>` plays `.row-exit` over the layout React has already committed (§7.4 rule 16).
 */
export function NotificationList({
  items,
  compact = false,
  grid = false,
  words,
  arrival = false,
  dismissible = false,
}: {
  items: Notification[];
  compact?: boolean;
  grid?: boolean;
  words?: Vocabulary;
  arrival?: boolean;
  dismissible?: boolean;
}) {
  const { busyId, undo, error, dismiss, undoDismiss, clearUndo } = useDismiss();
  const now = new Date();
  return (
    <>
      {error ? (
        <p role="alert" className="mb-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
          {error}
        </p>
      ) : null}
      <MotionList data-arrival={arrival ? "cascade" : undefined} className={grid ? "grid gap-3 xl:grid-cols-2 3xl:grid-cols-3" : "divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 bg-surface"}>
        {items.map((n) => {
          const unread = !n.readAt;
          const needsAck = n.priority === "urgent" && !n.acknowledgedAt;
          const href = notificationHref(n);
          return (
            <li key={n.id} data-urgent={needsAck ? "true" : undefined} className={`flex gap-3 p-4 ${grid ? "lift rounded-2xl border border-gray-200 bg-surface" : ""} ${unread ? "bg-brand-50/40" : ""} ${needsAck ? "border-l-4 border-l-red-500" : ""}`}>
              <DrawIcon name={notificationIcon(n)} size={20} draw={false} className={`mt-0.5 shrink-0 ${needsAck ? "text-red-600" : "text-gray-400"}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={notificationTone[n.type]}>{notificationLabel(n, words)}</Badge>
                  {n.priority === "urgent" ? <Badge tone="red">Urgent</Badge> : null}
                  {unread ? <StatusDot className="text-brand-500" label="Unread" /> : null}
                  <span className="ml-auto text-xs text-gray-500">{timeAgo(n.createdAt, now)}</span>
                  {/* Sits with the timestamp rather than among the verbs below: it acts on the row,
                      not on what the row is about, and the distance says so. */}
                  {dismissible && !needsAck ? <DismissButton title={n.title} busy={busyId === n.id} onDismiss={() => dismiss(n.id)} className="-my-1 -mr-1" /> : null}
                </div>
                {/* Opening marks it read, so it's a POST (server action), never a prefetchable GET. */}
                <form action={openNotification} className="mt-1">
                  <input type="hidden" name="id" value={n.id} />
                  <button type="submit" className="press-soft block w-full text-left">
                    <span className={`block text-sm ${unread ? "font-bold" : "font-semibold"}`}>{n.title}</span>
                    {!compact || n.body ? <span className="mt-0.5 block line-clamp-2 text-sm text-gray-600">{n.body}</span> : null}
                  </button>
                </form>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {href !== "/notifications" ? (
                    <form action={openNotification}>
                      <input type="hidden" name="id" value={n.id} />
                      <button type="submit" className="press-soft inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
                        Open <ArrowRightIcon size={16} />
                      </button>
                    </form>
                  ) : null}
                  {needsAck ? (
                    <form action={acknowledgeNotification}>
                      <input type="hidden" name="id" value={n.id} />
                      <button type="submit" className="press rounded-lg bg-red-600 px-3 py-1 text-sm font-semibold text-white hover:bg-red-700">
                        Acknowledge
                      </button>
                    </form>
                  ) : n.acknowledgedAt && n.priority === "urgent" ? (
                    <span className="text-xs text-gray-500">Acknowledged</span>
                  ) : null}
                  {unread ? (
                    <form action={markNotificationRead}>
                      <input type="hidden" name="id" value={n.id} />
                      <button type="submit" className="press-soft text-sm font-semibold text-gray-500 hover:text-ink">
                        Mark read
                      </button>
                    </form>
                  ) : null}
                  {/* No dead control on an alarm: the row says why it cannot be dismissed yet, beside
                      the one button that changes that. */}
                  {dismissible && needsAck ? (
                    <span className="text-xs text-gray-500" title="Dismissing an unacknowledged alert would drop a caller who was promised a call back. Acknowledge it first, then it can be dismissed.">
                      Acknowledge before dismissing
                    </span>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </MotionList>
      {undo ? <UndoBar seq={undo.seq} onUndo={undoDismiss} onExpire={clearUndo} /> : null}
    </>
  );
}
