import type { NotificationPriority, NotificationType } from "@prisma/client";
import type { IconName } from "@/components/icon-paths";
import type { Vocabulary } from "@/verticals/types";

/**
 * Client-safe notification presentation constants (no prisma import), shared by the server-rendered
 * lists and the client-side bell popover. Re-exported from lib/notifications for server callers.
 */

export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  reservation: "Reservation",
  takeout: "Takeout",
  waitlist: "Waitlist",
  message: "Message",
  escalation: "Escalation",
  missed_call: "Missed call",
  system: "System",
};

/** Line icon per type (rendered with <DrawIcon>), so the inbox matches the rail. */
export const NOTIFICATION_TYPE_ICON: Record<NotificationType, IconName> = {
  reservation: "calendar",
  takeout: "bag",
  waitlist: "hourglass",
  message: "message",
  escalation: "siren",
  missed_call: "phone-off",
  system: "settings",
};

/**
 * What to call a notification, and which icon to draw beside it.
 *
 * NotificationType predates verticals and has no `job` member, so a field-service booking is stored
 * as `reservation` and told apart by its jobId. Renaming the enum would be a destructive migration
 * for no user-visible gain, so the presentation layer asks the vocabulary instead: off one row, a
 * plumbing account reads "Service call" where a restaurant reads "Reservation".
 */
export function notificationLabel(n: { type: NotificationType; jobId?: string | null }, words?: Vocabulary): string {
  if (n.jobId && words) return words.booking.One;
  return NOTIFICATION_TYPE_LABEL[n.type];
}

export function notificationIcon(n: { type: NotificationType; jobId?: string | null }): IconName {
  return n.jobId ? "wrench" : NOTIFICATION_TYPE_ICON[n.type];
}

/** Compact, JSON-serializable notification for the bell popover. */
export type BellNotification = {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};
