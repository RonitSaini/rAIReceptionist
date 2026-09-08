import type { Account, Prisma } from "@prisma/client";
import { safeParse } from "zod";
import { prisma } from "./prisma";
import { formatDateTime, isValidDateString } from "./time";
import { formatUsPhone } from "./form";
import { getAvailableJobSlots } from "./job-availability";
import { afterJobBooked } from "./job-outcomes";
import { verticalFor } from "@/verticals";
import { normalizeTime, phoneOrCaller, str, tagCall, upsertCustomer, type Args, type HandlerContext, type HandlerResult } from "./handler-utils";
import { textPromiseBlocker } from "./confirmation-text";

/**
 * The shop_appointment archetype's one booking function.
 *
 * Slots, availability and the Job row are all the same machinery field_service uses — a diary is a
 * diary. What differs is that there is no address to check, because the customer is coming here,
 * and that the subject of the appointment (a vehicle, an animal) is validated against the vertical's
 * intake schema and stored on Job.details rather than getting a table of its own.
 */

/** Per-field validation, so one bad answer cannot discard the rest. Same rule as field_service. */
function intakeValues(a: Account, args: Args): Record<string, unknown> {
  const value: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(verticalFor(a).intakeSchema.shape)) {
    if (args[key] === undefined) continue;
    const parsed = safeParse(field, args[key]);
    if (parsed.success && parsed.data !== undefined) value[key] = parsed.data;
  }
  return value;
}

/** A short human label for the thing being brought in, for the confirmation text and the list views. */
export function subjectLabel(details: Record<string, unknown> | null | undefined): string | null {
  if (!details) return null;
  const d = details as Record<string, string | undefined>;
  const vehicle = [d.vehicle_year, d.vehicle_make, d.vehicle_model].filter(Boolean).join(" ").trim();
  if (vehicle) return vehicle;
  // "Mango (cat)", not "Mango, cat" - the agent reads this list out, and a comma between the name
  // and the species is indistinguishable from a comma between two animals.
  if (d.pet_name) return d.species ? `${d.pet_name} (${d.species})` : d.pet_name;
  return d.species ?? null;
}

export async function bookAppointmentHandler(ctx: HandlerContext, args: Args): Promise<HandlerResult> {
  const a = ctx.account;
  const definition = verticalFor(a);
  const words = definition.vocabulary;
  const customerName = str(args.customer_name);
  const customerPhone = phoneOrCaller(args.customer_phone, ctx);
  const date = str(args.date);
  const time = normalizeTime(args.time);

  if (!customerName) return { success: false, message: `Ask for the ${words.customer.one}'s name.` };
  if (!customerPhone) return { success: false, message: "Ask for a 10-digit phone number." };
  if (!isValidDateString(date) || !time) return { success: false, message: "Ask again for the day and the time." };

  const availability = await getAvailableJobSlots(a, date);
  const slot = availability.slots.find((s) => s.time === time);
  if (availability.closed) return { success: false, message: `We are closed that day. Offer another.` };
  if (!slot) return { success: false, message: `That is not one of the times. Offer: ${availability.slots.filter((s) => s.available).map((s) => s.label).join(", ") || "nothing that day"}.` };
  if (!slot.available) return { success: false, message: `${slot.label} has just gone. Call get_available_slots again and offer what is left.` };

  const details = intakeValues(a, args);
  const subject = subjectLabel(details);
  const customer = await upsertCustomer(a.id, customerPhone, customerName, null);

  const job = await prisma.job.create({
    data: {
      accountId: a.id,
      customerId: customer?.id ?? null,
      kind: "shop_visit",
      customerName,
      customerPhone,
      address: null,
      description: str(args.symptom) || subject || `${words.booking.One}`,
      isEmergency: false,
      status: "scheduled",
      scheduledStart: slot.startUtc,
      scheduledEnd: new Date(slot.startUtc.getTime() + a.jobSlotMinutes * 60_000),
      assignedTo: a.technicianName,
      source: "ai",
      details: Object.keys(details).length ? (details as Prisma.InputJsonValue) : undefined,
    },
  });

  await tagCall(ctx, { classification: "service_call", jobId: job.id, callerName: customerName });
  await afterJobBooked(a, job, ctx.call);
  const noText = textPromiseBlocker(a, customerPhone);

  return {
    success: true,
    job_id: job.id,
    message: `Booked for ${customerName} on ${formatDateTime(slot.startUtc, a.timeZone)}${subject ? ` (${subject})` : ""}. ${noText ? `Tell them to arrive a few minutes early. ${noText}` : `Tell them a confirmation text is on its way to ${formatUsPhone(customerPhone)}, and to arrive a few minutes early.`}`,
  };
}

export const SHOP_HANDLERS = {
  book_appointment: bookAppointmentHandler,
} as const;
