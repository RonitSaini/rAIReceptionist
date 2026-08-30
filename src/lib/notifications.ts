import type { Notification, NotificationPriority, NotificationType } from "@prisma/client";
import { prisma } from "./prisma";
import type { BellNotification } from "./notification-ui";

export type CreateNotificationInput = {
  accountId: string;
  type: NotificationType;
  title: string;
  body: string;
  priority?: NotificationPriority;
  reservationId?: string | null;
  takeoutOrderId?: string | null;
  callId?: string | null;
};

/** Single entry point for creating in-app notifications (used by manual CRUD now, by call webhooks in later phases). */
export function createNotification(input: CreateNotificationInput) {
  return prisma.notification.create({
    data: {
      accountId: input.accountId,
      type: input.type,
      priority: input.priority ?? "normal",
      title: input.title,
      body: input.body,
      reservationId: input.reservationId ?? null,
      takeoutOrderId: input.takeoutOrderId ?? null,
      callId: input.callId ?? null,
    },
  });
}

export function countUnread(accountId: string) {
  return prisma.notification.count({ where: { accountId, readAt: null } });
}

/** Where a notification links to. Falls back to the inbox. */
export function notificationHref(n: Pick<Notification, "reservationId" | "takeoutOrderId" | "callId">): string {
  if (n.reservationId) return `/reservations/${n.reservationId}`;
  if (n.takeoutOrderId) return `/takeout/${n.takeoutOrderId}`;
  if (n.callId) return `/calls/${n.callId}`;
  return "/notifications";
}

// Labels/icons live in a client-safe module (no prisma import) so the bell popover can use them.
export { NOTIFICATION_TYPE_LABEL, NOTIFICATION_TYPE_ICON } from "./notification-ui";
export type { BellNotification } from "./notification-ui";

/** Compact, serializable shape for the bell popover. */
export function toBellNotification(n: Notification): BellNotification {
  return { id: n.id, type: n.type, priority: n.priority, title: n.title, body: n.body, createdAt: n.createdAt.toISOString(), readAt: n.readAt ? n.readAt.toISOString() : null };
}

/** The most recent notifications for the bell popover (read and unread, newest first). */
export async function recentNotifications(accountId: string, take = 8): Promise<BellNotification[]> {
  const rows = await prisma.notification.findMany({ where: { accountId }, orderBy: { createdAt: "desc" }, take });
  return rows.map(toBellNotification);
}
