"use server";

import type { JobStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncJobToGoogle } from "@/lib/google-calendar";
import { requireAccount } from "@/lib/current-account";
import { bool, int, json, list, normalizeUsPhone, optDecimal, optStr, str, type ActionState } from "@/lib/form";
import { isPostalCodeFor, normalizePostalCode, accountCountry, toMiles } from "@/lib/locale";
import { formatRestaurantAddress, geocodeAddress } from "@/lib/geo";
import { jobWindow } from "@/lib/field-service-handlers";
import { verticalFor, vocabularyFor } from "@/verticals";
import { customEmergencyKey } from "@/lib/custom-emergencies";
import { ACTIVE_JOB_STATUSES } from "@/lib/job-availability";
import { sendGuestSms } from "@/lib/sms";
import { createNotification } from "@/lib/notifications";
import { dayBoundsUtc, todayString } from "@/lib/time";
import { finish, modeOf } from "@/lib/onboarding-flow";

/**
 * Server actions for the field_service archetype: the three onboarding steps it adds, plus CRUD for
 * the work itself.
 *
 * The onboarding steps mirror src/actions/onboarding.ts — same `finish` contract, same step-ID
 * routing — rather than being folded into it, because that file is already the restaurant's and
 * every vertical adding its steps there would turn it into a switch over professions.
 */


// ---------- Step: service area ----------

export async function saveServiceArea(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { account } = await requireAccount();
  const country = accountCountry(account);
  const zip = normalizePostalCode(str(fd, "serviceZip"));
  // The owner types miles or kilometres depending on their country; miles are what we store.
  const unit = country === "CA" ? "km" : "mi";
  const typed = optDecimal(fd, "serviceRadius");
  const radiusMiles = typed == null ? null : (Math.round(toMiles(Number(typed), unit) * 10) / 10).toFixed(1);

  if (!zip || !isPostalCodeFor(zip, country)) {
    return { ok: false, error: country === "CA" ? "Enter the postal code you work out from (A1A 1A1)." : "Enter the ZIP code you work out from." };
  }
  if (!radiusMiles || Number(radiusMiles) <= 0) {
    return { ok: false, error: `How far do you travel? Enter a radius in ${unit === "km" ? "kilometres" : "miles"}.` };
  }

  // Pin the business so the radius is measured from somewhere real. Falls back to the postcode when
  // no street address has been entered yet.
  let coords: { latitude: number | null; longitude: number | null } | null = null;
  if (account.latitude == null || account.longitude == null) {
    const line = formatRestaurantAddress(account) ?? zip;
    const loc = line ? await geocodeAddress(line, country) : null;
    if (loc) coords = { latitude: loc.lat, longitude: loc.lng };
  }

  await prisma.account.update({
    where: { id: account.id },
    data: { serviceAreaZip: zip, serviceAreaRadiusMiles: radiusMiles, ...(coords ?? {}) },
  });
  return finish(account, "service-area", modeOf(fd));
}

// ---------- Step: services and pricing ----------

type ServiceRow = { id?: string; name: string; category: string; priceFrom: string; canQuote: boolean; enabled: boolean };

export async function saveServices(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { account } = await requireAccount();
  const rows = json<ServiceRow[]>(fd, "services", []);
  const calloutRaw = optDecimal(fd, "calloutFee");
  const canQuotePrices = bool(fd, "canQuotePrices");

  const clean = rows
    .filter((r) => (r.name ?? "").trim())
    .map((r, i) => {
      const price = (r.priceFrom ?? "").toString().replace(/[$,\s]/g, "");
      const value = price === "" ? null : Number.parseFloat(price);
      return {
        name: r.name.trim().slice(0, 120),
        category: (r.category ?? "").trim().slice(0, 60) || null,
        priceFromMicros: value != null && Number.isFinite(value) && value >= 0 ? BigInt(Math.round(value * 1_000_000)) : null,
        canQuote: !!r.canQuote,
        enabled: r.enabled !== false,
        sortOrder: i,
      };
    });

  await prisma.$transaction([
    prisma.serviceOffering.deleteMany({ where: { accountId: account.id } }),
    prisma.serviceOffering.createMany({ data: clean.map((s) => ({ ...s, accountId: account.id })) }),
    prisma.account.update({
      where: { id: account.id },
      data: {
        canQuotePrices,
        calloutFeeMicros: calloutRaw == null ? null : BigInt(Math.round(Number(calloutRaw) * 1_000_000)),
      },
    }),
  ]);
  return finish(account, "services", modeOf(fd));
}

// ---------- Step: emergencies and technician ----------

export async function saveEmergencies(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { account } = await requireAccount();
  const allowed = new Set(verticalFor(account).emergencyTypes.map((e) => e.key));
  // Owner-written emergencies ride along as "custom:<slug>" entries — deduped, capped at 10.
  const custom = [...new Set(list(fd, "customEmergencies").map(customEmergencyKey).filter((k): k is string => k != null))].slice(0, 10);
  const emergencyTypes = [...list(fd, "emergencyTypes").filter((k) => allowed.has(k)), ...custom];
  const technicianName = optStr(fd, "technicianName");
  const jobSlotMinutes = int(fd, "jobSlotMinutes", verticalFor(account).defaults.slotMinutes);
  const maxPerDayRaw = str(fd, "maxJobsPerDay");
  const maxJobsPerDay = maxPerDayRaw ? Number.parseInt(maxPerDayRaw, 10) : null;

  if (jobSlotMinutes < 15 || jobSlotMinutes > 8 * 60) return { ok: false, error: "A visit should be between 15 minutes and 8 hours." };
  if (maxJobsPerDay != null && (!Number.isInteger(maxJobsPerDay) || maxJobsPerDay < 1)) return { ok: false, error: "Jobs per day must be a whole number, or left blank for no limit." };

  await prisma.account.update({
    where: { id: account.id },
    data: { emergencyTypes, technicianName, jobSlotMinutes, maxJobsPerDay },
  });
  return finish(account, "emergencies", modeOf(fd));
}

// ---------- Dispatch ----------

/**
 * Response times, the acknowledgement window, and what a caller is told when nobody answers.
 *
 * The last of those is validated rather than merely stored: an empty string would mean the caller
 * gets nothing at all, which is the exact failure this whole path exists to prevent. Blanking it
 * falls back to the vertical's own wording; it never falls back to silence.
 */
export async function saveDispatch(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { account } = await requireAccount();
  const definition = verticalFor(account);

  const takesScheduledWork = bool(fd, "takesScheduledWork");
  const minRaw = str(fd, "responseTimeMinMinutes");
  const maxRaw = str(fd, "responseTimeMaxMinutes");
  const ackRaw = str(fd, "escalationAckMinutes");
  const unacknowledgedMessage = optStr(fd, "unacknowledgedMessage");

  const num = (raw: string) => (raw ? Number.parseInt(raw, 10) : null);
  const responseTimeMinMinutes = num(minRaw);
  const responseTimeMaxMinutes = num(maxRaw);
  const escalationAckMinutes = num(ackRaw);

  for (const [label, v] of [["Response times", responseTimeMinMinutes], ["Response times", responseTimeMaxMinutes], ["The call-back window", escalationAckMinutes]] as const) {
    if (v != null && (!Number.isInteger(v) || v < 1 || v > 24 * 60)) return { ok: false, error: `${label} must be a whole number of minutes, or left blank.` };
  }
  if ((responseTimeMinMinutes == null) !== (responseTimeMaxMinutes == null)) {
    return { ok: false, error: "Give both ends of the response range, or leave both blank." };
  }
  if (responseTimeMinMinutes != null && responseTimeMaxMinutes != null && responseTimeMinMinutes > responseTimeMaxMinutes) {
    return { ok: false, error: "The response range starts after it ends." };
  }

  await prisma.account.update({
    where: { id: account.id },
    data: { takesScheduledWork, responseTimeMinMinutes, responseTimeMaxMinutes, escalationAckMinutes, unacknowledgedMessage },
  });
  return finish(account, definition.dispatchFirst ? "dispatch" : "emergencies", modeOf(fd));
}

// ---------- Jobs ----------

export async function createJob(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { account } = await requireAccount();
  const customerName = str(fd, "customerName");
  const phoneRaw = str(fd, "customerPhone");
  const customerPhone = phoneRaw ? normalizeUsPhone(phoneRaw) : null;
  const address = optStr(fd, "address");
  const description = optStr(fd, "description");
  const date = str(fd, "date");
  const time = str(fd, "time");
  const isEmergency = bool(fd, "isEmergency");

  if (!customerName) return { ok: false, error: "Who is the job for?" };
  if (phoneRaw && !customerPhone) return { ok: false, error: "Enter a valid 10-digit phone number." };

  const scheduled = date && time ? jobWindow(account, date, time) : null;
  const customer = customerPhone
    ? await prisma.customer.upsert({
        where: { accountId_phone: { accountId: account.id, phone: customerPhone } },
        update: { name: customerName, ...(address ? { address } : {}) },
        create: { accountId: account.id, phone: customerPhone, name: customerName, address },
      })
    : null;

  const job = await prisma.job.create({
    data: {
      accountId: account.id,
      customerId: customer?.id ?? null,
      kind: "service_call",
      customerName,
      customerPhone,
      address,
      description,
      isEmergency,
      scheduledStart: scheduled?.startUtc ?? null,
      scheduledEnd: scheduled?.endUtc ?? null,
      status: scheduled ? "scheduled" : "requested",
      assignedTo: optStr(fd, "assignedTo") ?? account.technicianName,
      source: "manual",
    },
  });
  after(() => syncJobToGoogle(job.id));
  revalidatePath("/schedule");
  revalidatePath("/jobs");
  return { ok: true, message: "Saved.", id: job.id } as ActionState;
}

const JOB_STATUSES: JobStatus[] = ["requested", "scheduled", "dispatched", "en_route", "in_progress", "completed", "cancelled"];

/** Form action, so the status buttons work without client JS — same contract as reservations. */
export async function setJobStatus(fd: FormData): Promise<void> {
  const { account } = await requireAccount();
  const id = str(fd, "id");
  const status = str(fd, "status") as JobStatus;
  if (!JOB_STATUSES.includes(status)) return;

  const job = await prisma.job.findFirst({ where: { id, accountId: account.id }, select: { id: true } });
  if (!job) return;

  await prisma.job.update({
    where: { id },
    data: { status, ...(status === "cancelled" ? { cancelledAt: new Date(), cancelledBy: "staff" } : {}) },
  });
  after(() => syncJobToGoogle(id)); // cancelling removes the calendar event
  revalidatePath("/schedule");
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${id}`);
}

// ---------- Services CRUD (settings) ----------

export async function saveServiceOfferings(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const result = await saveServices(_prev, fd);
  revalidatePath("/services");
  return result;
}

// ---------- Running late ----------

/**
 * "We're running behind" — texts every booking left today so the caller hears it from the
 * business before they are stood up.
 *
 * Deliberately idempotent per booking per day: however many times the button is pressed, a
 * customer is told once. A send that failed does not count as told — pressing again retries it.
 * The customers are texted; nothing on the jobs changes, because running late is not a
 * cancellation and the office may yet keep some of them.
 */
export async function notifyRunningLate(): Promise<ActionState> {
  const { account } = await requireAccount();
  const words = vocabularyFor(account);
  const { start, end } = dayBoundsUtc(todayString(account.timeZone), account.timeZone);

  const jobs = await prisma.job.findMany({
    where: { accountId: account.id, scheduledStart: { gte: new Date(), lt: end }, status: { in: [...ACTIVE_JOB_STATUSES] }, customerPhone: { not: null } },
    orderBy: { scheduledStart: "asc" },
    select: { id: true, customerPhone: true },
  });
  if (jobs.length === 0) return { ok: true, message: "Nothing left on today's schedule to notify." };

  const already = new Set(
    (
      await prisma.smsMessage.findMany({
        where: { accountId: account.id, purpose: "running_late", error: null, createdAt: { gte: start }, jobId: { in: jobs.map((j) => j.id) } },
        select: { jobId: true },
      })
    ).map((m) => m.jobId),
  );

  const body = `${account.businessName}: We're running behind today and may need to reschedule your ${words.booking.one}. We'll call you shortly - sorry for the trouble.`;
  let sent = 0;
  let failed = 0;
  for (const job of jobs) {
    if (already.has(job.id)) continue;
    const sms = await sendGuestSms(account, job.customerPhone, body, { purpose: "running_late", jobId: job.id });
    if (sms.ok) sent++;
    else failed++;
  }

  if (sent > 0) {
    await createNotification({
      accountId: account.id,
      type: "system",
      title: "Running-late notice sent",
      body: `${sent} ${sent === 1 ? "customer" : "customers"} with ${words.booking.many} later today ${sent === 1 ? "was" : "were"} texted that you may need to reschedule.`,
    });
  }

  if (failed > 0) return { ok: false, error: `Texted ${sent}, but ${failed} could not be reached. Check the numbers on today's ${words.booking.many}.` };
  if (sent === 0) return { ok: true, message: "Everyone left on today's schedule has already been texted." };
  return { ok: true, message: `Texted ${sent} ${sent === 1 ? "customer" : "customers"}. Call them when you can.` };
}
