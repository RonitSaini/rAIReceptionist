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
  job: "Job",
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
  job: "wrench",
  message: "message",
  escalation: "siren",
  missed_call: "phone-off",
  system: "settings",
};

/**
 * What to call a notification.
 *
 * `job` is one value covering every trade, so the label comes from the vocabulary: a plumber reads
 * "Service call", a roofer "Estimate". The generic "Job" in the map above is the fallback for a
 * caller with no account to hand.
 */
export function notificationLabel(n: { type: NotificationType }, words?: Vocabulary): string {
  if (n.type === "job" && words) return words.booking.One;
  return NOTIFICATION_TYPE_LABEL[n.type];
}

export function notificationIcon(n: { type: NotificationType }): IconName {
  return NOTIFICATION_TYPE_ICON[n.type];
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
