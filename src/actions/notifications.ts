"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Notification, NotificationPriority, NotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAccount } from "@/lib/current-account";
import { str } from "@/lib/form";
import { notificationHref } from "@/lib/notifications";

function refresh() {
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
}

export async function markNotificationRead(fd: FormData): Promise<void> {
  const { account } = await requireAccount();
  const id = str(fd, "id");
  await prisma.notification.updateMany({ where: { id, accountId: account.id, readAt: null }, data: { readAt: new Date() } });
  refresh();
}

export async function markAllNotificationsRead(): Promise<void> {
  const { account } = await requireAccount();
  await prisma.notification.updateMany({ where: { accountId: account.id, readAt: null }, data: { readAt: new Date() } });
  refresh();
}

/**
 * "Open" a notification: mark it read, then go to the related reservation / order / call.
 * A server action (POST) on purpose — the previous GET route handler did the same write, and a GET
 * behind a <Link> is prefetchable, so notifications could be marked read without anyone reading them.
 * GETs and polls stay side-effect-free; readAt changes only through explicit actions.
 */
export async function openNotification(fd: FormData): Promise<never> {
  const { account } = await requireAccount();
  const id = str(fd, "id");
  const n = await prisma.notification.findFirst({ where: { id, accountId: account.id } });
  if (!n) redirect("/notifications");
  if (!n.readAt) {
    await prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
    refresh();
  }
  redirect(notificationHref(n));
}

/**
 * Everything needed to put a dismissed notification back exactly as it was.
 *
 * Dates travel as ISO strings so the shape is plainly serializable in both directions across the
 * action boundary. `accountId` is deliberately absent: the restore takes it from the session, so a
 * hand-made snapshot cannot plant a row in somebody else's account.
 */
export type DismissedNotification = {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  body: string;
  reservationId: string | null;
  takeoutOrderId: string | null;
  jobId: string | null;
  callId: string | null;
  readAt: string | null;
  acknowledgedAt: string | null;
  followUpSentAt: string | null;
  createdAt: string;
};

/**
 * Why an urgent notification cannot be dismissed in one step.
 *
 * An unacknowledged urgent row is a caller who was promised a call back and has not had one. The
 * escalation sweep finds them by querying these rows, so deleting one does not just hide it — it
 * cancels the follow-up text the caller is owed, silently. Acknowledging is the cheaper, honest
 * version of the same intent ("I have seen this"), it is one click away on the row, and it is
 * recorded. So the guard is: acknowledge first, then dismiss.
 *
 * Enforced here as well as in the UI, because the UI is not where a rule like this can live alone.
 */
const needsAcknowledgement = (n: { priority: NotificationPriority; acknowledgedAt: Date | null }) => n.priority === "urgent" && !n.acknowledgedAt;

const ACK_FIRST = "Acknowledge this first — dismissing it would drop a caller who was promised a call back.";

const toSnapshot = (n: Notification): DismissedNotification => ({
  id: n.id,
  type: n.type,
  priority: n.priority,
  title: n.title,
  body: n.body,
  reservationId: n.reservationId,
  takeoutOrderId: n.takeoutOrderId,
  jobId: n.jobId,
  callId: n.callId,
  readAt: n.readAt?.toISOString() ?? null,
  acknowledgedAt: n.acknowledgedAt?.toISOString() ?? null,
  followUpSentAt: n.followUpSentAt?.toISOString() ?? null,
  createdAt: n.createdAt.toISOString(),
});

/**
 * Remove one notification from the feed. The record it is about is never touched.
 *
 * A hard delete, and reversible anyway: the row is returned as a snapshot complete enough for
 * `restoreNotification` to recreate it under its own id, keeping its place in the list and its
 * read state. That is why there is no `deletedAt` column — a soft delete would buy the same undo
 * at the price of every query in the app having to remember to filter on it.
 */
export async function dismissNotification(id: string): Promise<{ ok: true; snapshot: DismissedNotification } | { ok: false; error: string }> {
  const { account } = await requireAccount();
  const n = await prisma.notification.findFirst({ where: { id, accountId: account.id } });
  if (!n) return { ok: false, error: "That notification is already gone." };
  if (needsAcknowledgement(n)) return { ok: false, error: ACK_FIRST };

  await prisma.notification.delete({ where: { id: n.id } });
  refresh();
  return { ok: true, snapshot: toSnapshot(n) };
}

/**
 * Put a dismissed notification back.
 *
 * Every link is re-checked against this account before it is restored rather than trusted from the
 * snapshot: the ids arrive from the client, the foreign keys only prove a row exists somewhere, and
 * a link to another account's booking would produce a notification that opens onto a 404. A link
 * whose record has since been deleted is dropped the same way, so an undo cannot fail for it.
 */
export async function restoreNotification(snapshot: DismissedNotification): Promise<{ ok: boolean }> {
  const { account } = await requireAccount();

  const own = async <T>(finder: () => Promise<T | null>, id: string | null) => (id ? ((await finder()) ? id : null) : null);
  const [reservationId, takeoutOrderId, jobId, callId] = await Promise.all([
    own(() => prisma.reservation.findFirst({ where: { id: snapshot.reservationId!, accountId: account.id }, select: { id: true } }), snapshot.reservationId),
    own(() => prisma.takeoutOrder.findFirst({ where: { id: snapshot.takeoutOrderId!, accountId: account.id }, select: { id: true } }), snapshot.takeoutOrderId),
    own(() => prisma.job.findFirst({ where: { id: snapshot.jobId!, accountId: account.id }, select: { id: true } }), snapshot.jobId),
    own(() => prisma.call.findFirst({ where: { id: snapshot.callId!, accountId: account.id }, select: { id: true } }), snapshot.callId),
  ]);

  const date = (s: string | null) => (s ? new Date(s) : null);
  try {
    await prisma.notification.create({
      data: {
        id: snapshot.id,
        accountId: account.id,
        type: snapshot.type,
        priority: snapshot.priority,
        title: snapshot.title.slice(0, 300),
        body: snapshot.body.slice(0, 2000),
        reservationId,
        takeoutOrderId,
        jobId,
        callId,
        readAt: date(snapshot.readAt),
        acknowledgedAt: date(snapshot.acknowledgedAt),
        followUpSentAt: date(snapshot.followUpSentAt),
        createdAt: new Date(snapshot.createdAt),
      },
    });
  } catch {
    // Already restored (a double-tapped undo hits the unique id) — the desired state either way.
    return { ok: false };
  }
  refresh();
  return { ok: true };
}

/** Manager "Acknowledge" — clears an escalation (also marks it read). */
export async function acknowledgeNotification(fd: FormData): Promise<void> {
  const { account } = await requireAccount();
  const id = str(fd, "id");
  const now = new Date();
  const n = await prisma.notification.findFirst({ where: { id, accountId: account.id } });
  if (!n) return;
  await prisma.notification.update({ where: { id }, data: { acknowledgedAt: n.acknowledgedAt ?? now, readAt: n.readAt ?? now } });
  refresh();
}
