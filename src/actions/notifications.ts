"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAccount } from "@/lib/current-account";
import { str } from "@/lib/form";

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
