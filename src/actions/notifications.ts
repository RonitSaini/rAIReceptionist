"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
