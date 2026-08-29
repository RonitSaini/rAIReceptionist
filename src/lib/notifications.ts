import type { Notification, NotificationPriority, NotificationType } from "@prisma/client";
import { prisma } from "./prisma";

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

export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  reservation: "Reservation",
  takeout: "Takeout",
  waitlist: "Waitlist",
  message: "Message",
  escalation: "Escalation",
  missed_call: "Missed call",
  system: "System",
};

export const NOTIFICATION_TYPE_ICON: Record<NotificationType, string> = {
  reservation: "📅",
  takeout: "🥡",
  waitlist: "⏳",
  message: "💬",
  escalation: "🚨",
  missed_call: "📵",
  system: "⚙️",
};
