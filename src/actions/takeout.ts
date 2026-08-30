"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { withChanged } from "@/lib/form";
import type { TakeoutStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAccount } from "@/lib/current-account";
import { createNotification } from "@/lib/notifications";
import { bool, formatUsPhone, normalizeUsPhone, optStr, str, type ActionState } from "@/lib/form";
import { formatDateTime, isValidDateString, isValidTimeString, zonedToUtc } from "@/lib/time";
import { TAKEOUT_STATUSES } from "@/lib/constants";

function parseOrder(fd: FormData, timeZone: string) {
  const guestName = str(fd, "guestName");
  const phoneRaw = str(fd, "guestPhone");
  const guestPhone = phoneRaw ? normalizeUsPhone(phoneRaw) : null;
  const items = str(fd, "items");
  const date = str(fd, "date");
  const time = str(fd, "time");
  const isDelivery = bool(fd, "isDelivery");
  const deliveryAddress = optStr(fd, "deliveryAddress");

  if (guestName.length < 1) return { error: "Enter the guest's name." } as const;
  if (phoneRaw && !guestPhone) return { error: "Enter a valid 10-digit US phone number." } as const;
  if (items.length < 1) return { error: "Enter what they ordered." } as const;
  if (!isValidDateString(date) || !isValidTimeString(time)) return { error: "Choose a pickup date and time." } as const;
  if (isDelivery && !deliveryAddress) return { error: "Enter the delivery address." } as const;

  return {
    data: {
      guestName,
      guestPhone,
      items,
      notes: optStr(fd, "notes"),
      pickupTime: zonedToUtc(date, time, timeZone),
      isDelivery,
      deliveryAddress: isDelivery ? deliveryAddress : null,
    },
  } as const;
}

export async function createTakeoutOrder(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { account } = await requireAccount();
  const parsed = parseOrder(fd, account.timeZone);
  if ("error" in parsed) return { ok: false, error: parsed.error };

  const order = await prisma.takeoutOrder.create({ data: { ...parsed.data, accountId: account.id, source: "manual", status: "new" } });

  await createNotification({
    accountId: account.id,
    type: "takeout",
    title: `New ${order.isDelivery ? "delivery" : "takeout"} order: ${order.guestName}`,
    body: `${order.isDelivery ? "Deliver" : "Pickup"} ${formatDateTime(order.pickupTime, account.timeZone)}${order.guestPhone ? ` · ${formatUsPhone(order.guestPhone)}` : ""} · ${order.items.slice(0, 120)}`,
    takeoutOrderId: order.id,
  });

  revalidatePath("/takeout");
  revalidatePath("/dashboard");
  redirect(`/takeout/${order.id}`);
}

export async function updateTakeoutOrder(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { account } = await requireAccount();
  const id = str(fd, "id");
  const existing = await prisma.takeoutOrder.findFirst({ where: { id, accountId: account.id } });
  if (!existing) return { ok: false, error: "Order not found." };

  const parsed = parseOrder(fd, account.timeZone);
  if ("error" in parsed) return { ok: false, error: parsed.error };

  await prisma.takeoutOrder.update({ where: { id }, data: parsed.data });
  revalidatePath("/takeout");
  revalidatePath(`/takeout/${id}`);
  revalidatePath("/dashboard");
  return { ok: true, message: "Order updated." };
}

export async function setTakeoutStatus(fd: FormData): Promise<void> {
  const { account } = await requireAccount();
  const id = str(fd, "id");
  const status = str(fd, "status") as TakeoutStatus;
  const returnTo = str(fd, "returnTo") || `/takeout/${id}`;
  if (!TAKEOUT_STATUSES.includes(status)) return;

  const existing = await prisma.takeoutOrder.findFirst({ where: { id, accountId: account.id } });
  if (!existing) return;

  await prisma.takeoutOrder.update({ where: { id }, data: { status } });
  revalidatePath("/takeout");
  revalidatePath(`/takeout/${id}`);
  revalidatePath("/dashboard");
  redirect(withChanged(returnTo, id));
}
