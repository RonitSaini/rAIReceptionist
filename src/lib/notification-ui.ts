import type { NotificationPriority, NotificationType } from "@prisma/client";
import type { IconName } from "@/components/icon-paths";

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
