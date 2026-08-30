"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAccount } from "@/lib/current-account";
import { str, type ActionState } from "@/lib/form";
import { backfillUpcoming, disconnect, listCalendars } from "@/lib/google-calendar";

export async function disconnectGoogleCalendar(): Promise<ActionState> {
  const { account } = await requireAccount();
  await disconnect(account.id);
  revalidatePath("/settings");
  revalidatePath("/onboarding/5");
  return { ok: true, message: "Google Calendar disconnected. Existing events stay on your calendar." };
}

/** Pick which calendar reservations are written to (and read from for busy times). */
export async function chooseGoogleCalendar(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { account } = await requireAccount();
  const conn = await prisma.googleCalendarConnection.findUnique({ where: { accountId: account.id } });
  if (!conn) return { ok: false, error: "Google Calendar isn't connected." };
  const calendarId = str(fd, "calendarId");
  if (!calendarId) return { ok: false, error: "Choose a calendar." };
  let name: string | null = null;
  try {
    name = (await listCalendars(conn)).find((c) => c.id === calendarId)?.name ?? null;
  } catch {}
  await prisma.googleCalendarConnection.update({ where: { id: conn.id }, data: { calendarId, calendarName: name } });
  // Events already mirrored live on the previous calendar; upcoming ones without an event get created on the new one.
  const r = await backfillUpcoming(account.id);
  revalidatePath("/settings");
  return { ok: true, message: `Using "${name ?? calendarId}". ${r.synced} upcoming reservation${r.synced === 1 ? "" : "s"} synced.` };
}

export async function resyncGoogleCalendar(): Promise<ActionState> {
  const { account } = await requireAccount();
  const conn = await prisma.googleCalendarConnection.findUnique({ where: { accountId: account.id } });
  if (!conn) return { ok: false, error: "Google Calendar isn't connected." };
  const r = await backfillUpcoming(account.id);
  revalidatePath("/settings");
  return { ok: true, message: `${r.synced} of ${r.attempted} upcoming reservations synced.` };
}
