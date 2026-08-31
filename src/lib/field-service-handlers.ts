import type { Account, Prisma } from "@prisma/client";
import { safeParse } from "zod";
import { prisma } from "./prisma";
import { distanceMiles, extractZip, formatRestaurantAddress, geocodeAddress } from "./geo";
import { accountCountry, displayDistance, formatDistance, postalLabel, unitWord } from "./locale";
import { formatDateString, formatDateTime, isValidDateString, todayString, zonedToUtc } from "./time";
import { formatUsPhone } from "./form";
import { getAvailableJobSlots, openSlotLabels } from "./job-availability";
import { afterEmergencyDispatched, afterJobBooked } from "./job-outcomes";
import { verticalFor } from "@/verticals";
import { bool, normalizeTime, phoneOrCaller, str, tagCall, upsertCustomer, type Args, type HandlerContext, type HandlerResult } from "./handler-utils";

/**
 * The field_service archetype's custom functions: is the caller inside the area, when can someone
 * come out, book it, or — if it is an emergency — get a human moving now.
 *
 * Every one of these returns instruction text in `message`, which the model speaks. That text is
 * as much a part of the product as the prompt, so it is written in the account's own vocabulary
 * rather than in restaurant nouns.
 */

// ---------- check_service_area ----------

async function businessLocation(a: Account): Promise<{ lat: number; lng: number } | null> {
  if (a.latitude != null && a.longitude != null) return { lat: a.latitude, lng: a.longitude };
  const addr = formatRestaurantAddress(a) ?? a.serviceAreaZip ?? null;
  if (!addr) return null;
  const loc = await geocodeAddress(addr, accountCountry(a));
  if (loc) await prisma.account.update({ where: { id: a.id }, data: { latitude: loc.lat, longitude: loc.lng } }).catch(() => {});
  return loc;
}

/**
 * Is an address inside the service radius?
 *
 * Same machinery as the restaurant delivery check — Google Geocoding with a Places fallback, then
 * straight-line miles against the stored radius, spoken in kilometres for Canadian accounts. No new
 * dependency and no new key: `GOOGLE_MAPS_API_KEY` is already configured server-side.
 */
export async function checkServiceArea(a: Account, address: string): Promise<{ covered: boolean; uncertain?: boolean; distanceMiles?: number; reason: string }> {
  const radius = a.serviceAreaRadiusMiles != null ? Number(a.serviceAreaRadiusMiles) : null;
  if (!address.trim()) return { covered: false, uncertain: true, reason: "No address given." };
  if (radius == null) return { covered: true, uncertain: true, reason: "No service radius is configured, so the address cannot be ruled out." };

  const country = accountCountry(a);
  const [origin, target] = await Promise.all([businessLocation(a), geocodeAddress(address, country)]);
  if (origin && target) {
    const d = distanceMiles(origin, target);
    const away = formatDistance(d, country);
    const area = `${displayDistance(radius, country)}-${unitWord(country, 1)}`;
    return d <= radius
      ? { covered: true, distanceMiles: Math.round(d * 10) / 10, reason: `About ${away} away, inside the ${area} service area.` }
      : { covered: false, distanceMiles: Math.round(d * 10) / 10, reason: `About ${away} away, outside the ${area} service area.` };
  }

  // Geocoding unavailable — fall back to a postcode match rather than guessing.
  const zip = extractZip(address);
  if (zip && a.serviceAreaZip && zip.toUpperCase() === a.serviceAreaZip.toUpperCase()) {
    return { covered: true, uncertain: true, reason: `Same ${postalLabel(country)} as the business.` };
  }
  return { covered: false, uncertain: true, reason: "Could not confirm the address is inside the service area." };
}

export async function checkServiceAreaHandler(ctx: HandlerContext, args: Args): Promise<HandlerResult> {
  const r = await checkServiceArea(ctx.account, str(args.address));
  const words = verticalFor(ctx.account).vocabulary;
  return {
    success: true,
    covered: r.covered,
    distance_miles: r.distanceMiles,
    message: r.covered
      ? `That address is in the service area. ${r.reason} Carry on and book the ${words.booking.one}.`
      : `That address is outside the service area (${r.reason}). Politely say you do not cover that area, do not book anything, and offer to take a message in case someone can help.`,
  };
}

// ---------- get_available_slots ----------

export async function getAvailableSlotsHandler(ctx: HandlerContext, args: Args): Promise<HandlerResult> {
  const a = ctx.account;
  const date = str(args.date) || todayString(a.timeZone);
  const isEmergency = bool(args.is_emergency);
  const words = verticalFor(a).vocabulary;

  if (!isValidDateString(date)) return { success: false, message: "Ask which day they need someone, and resolve it to a YYYY-MM-DD date." };

  if (isEmergency) {
    return {
      success: true,
      emergency: true,
      message: `This is an emergency, so do not offer scheduled times. Confirm the address and what is happening, then call dispatch_emergency.`,
    };
  }

  if (date < todayString(a.timeZone)) return { success: false, message: "That date has passed. Ask for a day from today onwards." };

  const availability = await getAvailableJobSlots(a, date);
  const dayLabel = formatDateString(date, { weekday: "long", month: "long", day: "numeric" });

  if (availability.closed) return { success: true, closed: true, available_times: [], message: `Nobody is working on ${dayLabel}. Offer another day.` };

  const open = openSlotLabels(availability);
  if (open.length === 0) {
    const full = availability.maxPerDay != null && availability.booked >= availability.maxPerDay;
    return {
      success: true,
      available_times: [],
      message: full
        ? `${dayLabel} is fully booked. Offer another day; if none of them work, take a message with take_message so the ${words.business.one} can call back.`
        : `There are no free windows left on ${dayLabel}. Offer another day, or take a message with take_message.`,
    };
  }

  return {
    success: true,
    available_times: open,
    message: `Available on ${dayLabel}: ${open.join(", ")}. Ask which window suits them, then book it.`,
  };
}

// ---------- book_service_call ----------

export async function bookServiceCallHandler(ctx: HandlerContext, args: Args): Promise<HandlerResult> {
  const a = ctx.account;
  const words = verticalFor(a).vocabulary;
  const customerName = str(args.customer_name);
  const customerPhone = phoneOrCaller(args.customer_phone, ctx);
  const address = str(args.address);
  const description = str(args.description);
  const date = str(args.date);
  const time = normalizeTime(args.time);

  if (!customerName) return { success: false, message: `Ask for the ${words.customer.one}'s name.` };
  if (!customerPhone) return { success: false, message: "Ask for a 10-digit phone number." };
  if (!address) return { success: false, message: "Ask for the full street address the visit is for." };
  if (!description) return { success: false, message: "Ask what the problem is, in their own words." };
  if (!isValidDateString(date) || !time) return { success: false, message: "Ask again for the day and the time window." };

  // Never book outside the area, whatever the model decided earlier in the call.
  const area = await checkServiceArea(a, address);
  if (!area.covered && !area.uncertain) {
    return { success: false, message: `That address is outside the service area (${area.reason}). Do not book it; apologize and offer to take a message.` };
  }

  const availability = await getAvailableJobSlots(a, date);
  const slot = availability.slots.find((s) => s.time === time);
  if (availability.closed) return { success: false, message: "Nobody is working that day. Offer another day." };
  if (!slot) {
    const open = openSlotLabels(availability);
    return { success: false, message: open.length ? `That is not one of the windows. Offer: ${open.join(", ")}.` : "There are no windows left that day. Offer another day." };
  }
  if (!slot.available) {
    const open = openSlotLabels(availability);
    return { success: false, message: open.length ? `That window has just gone. Offer: ${open.join(", ")}.` : "That day is full now. Offer another day, or take a message." };
  }

  const customer = await upsertCustomer(a.id, customerPhone, customerName, address);
  const job = await prisma.job.create({
    data: {
      accountId: a.id,
      customerId: customer?.id ?? null,
      kind: "service_call",
      customerName,
      customerPhone,
      address,
      description,
      isEmergency: false,
      scheduledStart: slot.startUtc,
      scheduledEnd: slot.endUtc,
      status: "scheduled",
      assignedTo: a.technicianName,
      source: "ai",
      details: intakeDetails(a, args),
    },
  });

  await tagCall(ctx, { classification: job.kind === "estimate" ? "estimate" : "service_call", jobId: job.id, callerName: customerName });
  await afterJobBooked(a, job, ctx.call);

  const when = formatDateTime(slot.startUtc, a.timeZone);
  return {
    success: true,
    job_id: job.id,
    message: `Booked for ${customerName} on ${when} at ${address}. Tell them ${a.technicianName || `the ${words.staff.one}`} will be out then, and that a confirmation text is on its way to ${formatUsPhone(customerPhone)}.`,
  };
}

/**
 * The vertical-specific answers, validated against its intakeSchema before anything is written.
 *
 * A model will happily invent a field. Parsing rather than trusting means a bad key is dropped
 * instead of being persisted into `details` where a later page would render it.
 *
 * Validated one field at a time, deliberately. Parsing the object as a whole makes a single bad
 * value discard every other answer with it — a caller who says "I rent the upstairs flat" instead
 * of "tenant" would take `water_shut_off` down too, and whether the water is off is the one thing
 * the plumber needs to know before setting off. Each field stands or falls on its own.
 */
function intakeDetails(a: Account, args: Args): Prisma.InputJsonValue | undefined {
  const value: Record<string, unknown> = {};

  for (const [key, field] of Object.entries(verticalFor(a).intakeSchema.shape)) {
    if (args[key] === undefined) continue;
    // z.safeParse(schema, value) rather than field.safeParse(value): `.shape` is typed as the core
    // $ZodType, and the top-level form is the API that accepts it.
    const parsed = safeParse(field, args[key]);
    if (parsed.success && parsed.data !== undefined) value[key] = parsed.data;
  }

  return Object.keys(value).length ? (value as Prisma.InputJsonValue) : undefined;
}

// ---------- dispatch_emergency ----------

export async function dispatchEmergencyHandler(ctx: HandlerContext, args: Args): Promise<HandlerResult> {
  const a = ctx.account;
  const definition = verticalFor(a);
  const words = definition.vocabulary;
  const customerName = str(args.customer_name) || "Unknown caller";
  const customerPhone = phoneOrCaller(args.customer_phone, ctx);
  const address = str(args.address);
  const description = str(args.description);
  const typeRaw = str(args.emergency_type);
  const known = definition.emergencyTypes.map((t) => t.key);
  const emergencyType = known.includes(typeRaw) ? typeRaw : "other";

  if (!address) return { success: false, message: "Ask where they are — the full street address — before dispatching." };
  if (!customerPhone) return { success: false, message: "Ask for a callback number before dispatching." };

  const customer = await upsertCustomer(a.id, customerPhone, customerName, address);
  const job = await prisma.job.create({
    data: {
      accountId: a.id,
      customerId: customer?.id ?? null,
      kind: "service_call",
      customerName,
      customerPhone,
      address,
      description: description || emergencyType.replace(/_/g, " "),
      isEmergency: true,
      status: "requested",
      assignedTo: a.technicianName,
      source: "ai",
      details: { emergencyType },
    },
  });

  await tagCall(ctx, { classification: "emergency", jobId: job.id, callerName: customerName, escalationReason: "emergency", callbackRequested: true });
  await afterJobBooked(a, job, ctx.call);
  await afterEmergencyDispatched(a, ctx.call, { customerName, customerPhone, address, emergencyType, description });

  return {
    success: true,
    job_id: job.id,
    emergency_type: emergencyType,
    message: `Emergency logged and the ${words.business.one} has been alerted. Tell ${customerName} that ${a.technicianName || `the ${words.staff.one}`} will call them back on ${formatUsPhone(customerPhone)} within 15 minutes. Stay calm and do not promise an arrival time.`,
  };
}

/** Booking a job from the schedule page uses the same slot rules as the agent. */
export function jobWindow(account: Account, date: string, time: string): { startUtc: Date; endUtc: Date } {
  const startUtc = zonedToUtc(date, time, account.timeZone);
  return { startUtc, endUtc: new Date(startUtc.getTime() + Math.max(15, account.jobSlotMinutes || 120) * 60_000) };
}

export const FIELD_SERVICE_HANDLERS = {
  check_service_area: checkServiceAreaHandler,
  get_available_slots: getAvailableSlotsHandler,
  book_service_call: bookServiceCallHandler,
  dispatch_emergency: dispatchEmergencyHandler,
} as const;
