"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { withChanged } from "@/lib/form";
import type { ReservationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAccount } from "@/lib/current-account";
import { createNotification } from "@/lib/notifications";
import { bool, formatUsPhone, int, normalizeUsPhone, optStr, str, type ActionState } from "@/lib/form";
import { formatDateTime, isValidDateString, isValidTimeString, zonedToUtc } from "@/lib/time";
import { RESERVATION_STATUSES } from "@/lib/constants";

function parseReservation(fd: FormData, timeZone: string, tableTurnMinutes: number) {
  const guestName = str(fd, "guestName");
  const phoneRaw = str(fd, "guestPhone");
  const guestPhone = phoneRaw ? normalizeUsPhone(phoneRaw) : null;
  const partySize = int(fd, "partySize", 0);
  const date = str(fd, "date");
  const time = str(fd, "time");

  if (guestName.length < 1) return { error: "Enter the guest's name." } as const;
  if (phoneRaw && !guestPhone) return { error: "Enter a valid 10-digit US phone number." } as const;
  if (partySize < 1 || partySize > 500) return { error: "Party size must be at least 1." } as const;
  if (!isValidDateString(date) || !isValidTimeString(time)) return { error: "Choose a date and time." } as const;

  const startTime = zonedToUtc(date, time, timeZone);
  const endTime = new Date(startTime.getTime() + tableTurnMinutes * 60_000);
  return {
    data: {
      guestName,
      guestPhone,
      partySize,
      seatingPreference: optStr(fd, "seatingPreference"),
      specialRequests: optStr(fd, "specialRequests"),
      startTime,
      endTime,
      isWaitlist: bool(fd, "isWaitlist"),
    },
  } as const;
}

export async function createReservation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { account } = await requireAccount();
  const parsed = parseReservation(fd, account.timeZone, account.tableTurnMinutes);
  if ("error" in parsed) return { ok: false, error: parsed.error };

  const reservation = await prisma.reservation.create({
    data: { ...parsed.data, accountId: account.id, source: "manual", status: "booked" },
  });

  const when = formatDateTime(reservation.startTime, account.timeZone);
  await createNotification({
    accountId: account.id,
    type: reservation.isWaitlist ? "waitlist" : "reservation",
    title: reservation.isWaitlist ? `Waitlist: ${reservation.guestName}, party of ${reservation.partySize}` : `New reservation: ${reservation.guestName}, party of ${reservation.partySize}`,
    body: `${when}${reservation.guestPhone ? ` · ${formatUsPhone(reservation.guestPhone)}` : ""}${reservation.specialRequests ? ` · ${reservation.specialRequests}` : ""}`,
    reservationId: reservation.id,
  });

  revalidatePath("/reservations");
  revalidatePath("/dashboard");
  redirect(`/reservations/${reservation.id}`);
}

export async function updateReservation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { account } = await requireAccount();
  const id = str(fd, "id");
  const existing = await prisma.reservation.findFirst({ where: { id, accountId: account.id } });
  if (!existing) return { ok: false, error: "Reservation not found." };

  const parsed = parseReservation(fd, account.timeZone, account.tableTurnMinutes);
  if ("error" in parsed) return { ok: false, error: parsed.error };

  await prisma.reservation.update({ where: { id }, data: parsed.data });
  revalidatePath("/reservations");
  revalidatePath(`/reservations/${id}`);
  revalidatePath("/dashboard");
  return { ok: true, message: "Reservation updated." };
}

export async function setReservationStatus(fd: FormData): Promise<void> {
  const { account } = await requireAccount();
  const id = str(fd, "id");
  const status = str(fd, "status") as ReservationStatus;
  const returnTo = str(fd, "returnTo") || `/reservations/${id}`;
  if (!RESERVATION_STATUSES.includes(status)) return;

  const existing = await prisma.reservation.findFirst({ where: { id, accountId: account.id } });
  if (!existing) return;

  await prisma.reservation.update({ where: { id }, data: { status } });
  revalidatePath("/reservations");
  revalidatePath(`/reservations/${id}`);
  revalidatePath("/dashboard");
  redirect(withChanged(returnTo, id));
}
