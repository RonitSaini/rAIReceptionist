import type { Account, Call, CallClassification } from "@prisma/client";
import { prisma } from "./prisma";
import { getAvailableTimes, nearestAlternatives, periodsForDay } from "./availability";
import { distanceMiles, extractZip, formatRestaurantAddress, geocodeAddress } from "./geo";
import { dayOfWeekOf, formatDateString, formatClock, isValidDateString, timeToMinutes, todayString, zonedToUtc, formatDateTime } from "./time";
import { formatUsPhone, normalizeUsPhone } from "./form";
import { MESSAGE_REASONS, type FunctionName } from "./agent-config";

/**
 * Implementations of the custom functions the Retell agent can call during a call.
 * Each returns a plain object that Retell hands back to the LLM; `message` is what the agent should convey.
 *
 * Phase 3 hooks: notifications, manager outbound call and guest SMS are added where marked TODO(phase3).
 */

export type HandlerContext = { account: Account; call: Call | null; callerPhone: string | null };
export type Args = Record<string, unknown>;
export type HandlerResult = Record<string, unknown> & { success: boolean; message: string };

const str = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
const int = (v: unknown) => {
  const n = typeof v === "number" ? v : Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : NaN;
};

function phoneOrCaller(v: unknown, ctx: HandlerContext): string | null {
  const s = str(v);
  return (s ? normalizeUsPhone(s) : null) ?? ctx.callerPhone;
}

/** Accept "6:30 PM", "18:30", "6pm" and return HH:MM, or null. */
function normalizeTime(v: unknown): string | null {
  const s = str(v).toLowerCase().replace(/\s+/g, " ");
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) return s;
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? "0");
  const ap = m[3]?.replace(/\./g, "");
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

async function tagCall(ctx: HandlerContext, data: Partial<Pick<Call, "classification" | "reservationId" | "takeoutOrderId" | "callerName" | "messageText" | "escalationReason" | "callbackRequested">>) {
  if (!ctx.call) return;
  await prisma.call.update({ where: { id: ctx.call.id }, data }).catch(() => {});
}

// ---------- get_available_times ----------

export async function getAvailableTimesHandler(ctx: HandlerContext, args: Args): Promise<HandlerResult> {
  const date = str(args.date);
  const partySize = int(args.party_size);
  const preferred = normalizeTime(args.preferred_time);
  if (!isValidDateString(date)) return { success: false, message: "I need the date in YYYY-MM-DD format. Ask the caller which day they'd like." };
  if (!Number.isFinite(partySize) || partySize < 1) return { success: false, message: "Ask the caller how many people are in their party." };

  const a = ctx.account;
  if (partySize > a.largePartyThreshold) {
    return {
      success: true,
      requires_manager: true,
      message: `A party of ${partySize} is larger than the restaurant books over the phone (limit ${a.largePartyThreshold}). Do not book it. Take the caller's name, phone, date and time and call take_message with reason "large_party".`,
    };
  }
  if (date < todayString(a.timeZone)) return { success: false, message: "That date is in the past. Ask for a future date." };

  const result = await getAvailableTimes(a, date, partySize);
  const dayLabel = formatDateString(date, { weekday: "long", month: "long", day: "numeric" });
  if (result.closed) return { success: true, closed: true, available_times: [], message: `The restaurant is closed on ${dayLabel}. Offer another day.` };

  const open = result.slots.filter((s) => s.available);
  if (open.length === 0) {
    return { success: true, available_times: [], message: `${dayLabel} is fully booked for a party of ${partySize}. Offer the waitlist (join_waitlist) or another day.` };
  }

  if (preferred) {
    const slot = result.slots.find((s) => s.time === preferred);
    if (slot?.available) return { success: true, preferred_time_available: true, preferred_time: preferred, message: `${formatClock(preferred)} on ${dayLabel} is available for ${partySize}. Confirm the details, then book it.` };
    const alt = nearestAlternatives(result.slots, preferred, 2);
    const options = [...alt.earlier, ...alt.later].map((s) => s.label);
    return {
      success: true,
      preferred_time_available: false,
      preferred_time: preferred,
      nearest_times: options,
      message: options.length
        ? `${formatClock(preferred)} is not available on ${dayLabel}. Nearest open times: ${options.join(", ")}. Offer these; if none work, offer the waitlist.`
        : `${formatClock(preferred)} is not available and there are no nearby open times on ${dayLabel}. Offer the waitlist or another day.`,
    };
  }

  const labels = open.slice(0, 10).map((s) => s.label);
  return { success: true, available_times: labels, message: `Available on ${dayLabel} for ${partySize}: ${labels.join(", ")}${open.length > 10 ? " and more" : ""}. Ask which time they'd like.` };
}

// ---------- book_reservation / join_waitlist ----------

async function createReservation(ctx: HandlerContext, args: Args, isWaitlist: boolean): Promise<HandlerResult> {
  const a = ctx.account;
  const guestName = str(args.guest_name);
  const guestPhone = phoneOrCaller(args.guest_phone, ctx);
  const partySize = int(args.party_size);
  const date = str(args.date);
  const time = normalizeTime(args.time);

  if (!guestName) return { success: false, message: "Ask for the guest's name." };
  if (!guestPhone) return { success: false, message: "Ask for a 10-digit phone number." };
  if (!Number.isFinite(partySize) || partySize < 1) return { success: false, message: "Ask how many people are in the party." };
  if (!isValidDateString(date) || !time) return { success: false, message: "Ask for the date and time again." };
  if (partySize > a.largePartyThreshold) return { success: false, requires_manager: true, message: `Parties over ${a.largePartyThreshold} must go through a manager. Use take_message with reason "large_party" instead.` };

  const startTime = zonedToUtc(date, time, a.timeZone);
  if (startTime.getTime() < Date.now()) return { success: false, message: "That time has already passed. Ask for a later time." };

  if (!isWaitlist) {
    const avail = await getAvailableTimes(a, date, partySize);
    const slot = avail.slots.find((s) => s.time === time);
    if (avail.closed) return { success: false, message: "The restaurant is closed that day. Offer another day." };
    if (!slot) return { success: false, message: `${formatClock(time)} isn't one of the reservation times. Call get_available_times and offer a listed time.` };
    if (!slot.available) {
      const alt = nearestAlternatives(avail.slots, time, 2);
      const options = [...alt.earlier, ...alt.later].map((s) => s.label);
      return { success: false, nearest_times: options, message: `${formatClock(time)} just became unavailable. ${options.length ? `Offer: ${options.join(", ")}.` : "Offer the waitlist."}` };
    }
  }

  const reservation = await prisma.reservation.create({
    data: {
      accountId: a.id,
      guestName,
      guestPhone,
      partySize,
      seatingPreference: str(args.seating_preference) || null,
      specialRequests: str(args.special_requests || args.notes) || null,
      startTime,
      endTime: new Date(startTime.getTime() + a.tableTurnMinutes * 60_000),
      status: "booked",
      isWaitlist,
      source: "ai",
    },
  });
  await tagCall(ctx, { classification: isWaitlist ? "waitlist" : "reservation", reservationId: reservation.id, callerName: guestName });
  // TODO(phase3): createNotification + guest confirmation SMS.

  const when = formatDateTime(startTime, a.timeZone);
  return {
    success: true,
    reservation_id: reservation.id,
    confirmation: when,
    message: isWaitlist
      ? `${guestName} is on the waitlist for ${partySize} on ${when}. Tell them the restaurant will call ${formatUsPhone(guestPhone)} if a table opens up.`
      : `Booked: ${guestName}, party of ${partySize}, ${when}. Tell them they'll get a text confirmation at ${formatUsPhone(guestPhone)}.`,
  };
}

export const bookReservationHandler = (ctx: HandlerContext, args: Args) => createReservation(ctx, args, false);
export const joinWaitlistHandler = (ctx: HandlerContext, args: Args) => createReservation(ctx, args, true);

// ---------- check_delivery_area ----------

async function restaurantLocation(a: Account): Promise<{ lat: number; lng: number } | null> {
  if (a.latitude != null && a.longitude != null) return { lat: a.latitude, lng: a.longitude };
  const addr = formatRestaurantAddress(a) ?? (a.deliveryZip ? a.deliveryZip : null);
  if (!addr) return null;
  const loc = await geocodeAddress(addr);
  if (loc) await prisma.account.update({ where: { id: a.id }, data: { latitude: loc.lat, longitude: loc.lng } }).catch(() => {});
  return loc;
}

export async function checkDeliveryArea(a: Account, address: string): Promise<{ deliverable: boolean; uncertain?: boolean; distanceMiles?: number; reason: string }> {
  if (!a.offersDelivery) return { deliverable: false, reason: "The restaurant does not offer delivery." };
  const radius = a.deliveryRadiusMiles != null ? Number(a.deliveryRadiusMiles) : null;
  if (!address.trim()) return { deliverable: false, uncertain: true, reason: "No address given." };

  const [origin, target] = await Promise.all([restaurantLocation(a), geocodeAddress(address)]);
  if (origin && target && radius != null) {
    const d = distanceMiles(origin, target);
    return d <= radius
      ? { deliverable: true, distanceMiles: Math.round(d * 10) / 10, reason: `About ${Math.round(d * 10) / 10} miles away, within the ${radius}-mile delivery area.` }
      : { deliverable: false, distanceMiles: Math.round(d * 10) / 10, reason: `About ${Math.round(d * 10) / 10} miles away, outside the ${radius}-mile delivery area.` };
  }
  // Geocoding unavailable — fall back to ZIP match.
  const zip = extractZip(address);
  if (zip && a.deliveryZip && zip === a.deliveryZip) return { deliverable: true, uncertain: true, reason: "Same ZIP code as the restaurant's delivery ZIP." };
  return { deliverable: false, uncertain: true, reason: "Could not verify the address is inside the delivery area." };
}

export async function checkDeliveryAreaHandler(ctx: HandlerContext, args: Args): Promise<HandlerResult> {
  const address = str(args.address);
  const r = await checkDeliveryArea(ctx.account, address);
  return {
    success: true,
    deliverable: r.deliverable,
    distance_miles: r.distanceMiles,
    message: r.deliverable ? `Yes, delivery is available to that address. ${r.reason}` : `Delivery is not available there (${r.reason}). Apologize and offer pickup instead.`,
  };
}

// ---------- take_takeout_order ----------

export async function takeTakeoutOrderHandler(ctx: HandlerContext, args: Args): Promise<HandlerResult> {
  const a = ctx.account;
  if (!a.takesTakeoutOrders) return { success: false, message: "The restaurant doesn't take phone orders. Apologize and offer to answer questions instead." };
  const guestName = str(args.guest_name);
  const guestPhone = phoneOrCaller(args.guest_phone, ctx);
  const items = str(args.items);
  const date = str(args.pickup_date) || todayString(a.timeZone);
  const time = normalizeTime(args.pickup_time);
  const isDelivery = args.is_delivery === true || str(args.is_delivery).toLowerCase() === "true";
  const deliveryAddress = str(args.delivery_address);

  if (!guestName) return { success: false, message: "Ask for the caller's name." };
  if (!guestPhone) return { success: false, message: "Ask for a 10-digit phone number." };
  if (!items) return { success: false, message: "Ask what they'd like to order." };
  if (!isValidDateString(date) || !time) return { success: false, message: "Ask what time they'd like to pick it up." };

  const pickupTime = zonedToUtc(date, time, a.timeZone);
  if (pickupTime.getTime() < Date.now() - 5 * 60_000) return { success: false, message: "That time has already passed. Ask for a later pickup time." };

  // Pickup must fall inside a service period that day.
  const hours = await prisma.businessHours.findMany({ where: { accountId: a.id } });
  const periods = periodsForDay(hours, dayOfWeekOf(date));
  const dayLabel = formatDateString(date, { weekday: "long", month: "long", day: "numeric" });
  if (periods.length === 0) return { success: false, closed: true, message: `The restaurant is closed on ${dayLabel}. Offer another day.` };
  const mins = timeToMinutes(time);
  const open = periods.some((p) => {
    const o = timeToMinutes(p.open);
    let c = timeToMinutes(p.close);
    if (c <= o) c += 24 * 60;
    return mins >= o && mins <= c;
  });
  if (!open) {
    const windows = periods.map((p) => `${formatClock(p.open)}–${formatClock(p.close)}`).join(", ");
    return { success: false, message: `${formatClock(time)} is outside ${dayLabel}'s hours (${windows}). Offer a pickup time during those hours.` };
  }

  if (isDelivery) {
    if (!a.offersDelivery) return { success: false, message: "The restaurant doesn't deliver. Offer pickup instead." };
    if (!deliveryAddress) return { success: false, message: "Ask for the full delivery address including city and ZIP." };
    const check = await checkDeliveryArea(a, deliveryAddress);
    if (!check.deliverable) return { success: false, deliverable: false, message: `That address is outside the delivery area (${check.reason}). Apologize and offer pickup instead.` };
  }

  const order = await prisma.takeoutOrder.create({
    data: { accountId: a.id, guestName, guestPhone, items, notes: str(args.notes) || null, pickupTime, isDelivery, deliveryAddress: isDelivery ? deliveryAddress : null, status: "new", source: "ai" },
  });
  await tagCall(ctx, { classification: "takeout", takeoutOrderId: order.id, callerName: guestName });
  // TODO(phase3): createNotification + guest confirmation SMS.

  const when = formatDateTime(pickupTime, a.timeZone);
  return { success: true, order_id: order.id, message: `Order placed for ${guestName}, ${isDelivery ? "delivery" : "pickup"} at ${when}. Tell them they'll get a text confirmation at ${formatUsPhone(guestPhone)}.` };
}

// ---------- take_message ----------

export async function takeMessageHandler(ctx: HandlerContext, args: Args): Promise<HandlerResult> {
  const a = ctx.account;
  const callerName = str(args.caller_name) || "Unknown caller";
  const callerPhone = phoneOrCaller(args.caller_phone, ctx);
  const message = str(args.message);
  const reasonRaw = str(args.reason);
  const reason = (MESSAGE_REASONS as readonly string[]).includes(reasonRaw) ? reasonRaw : "other";
  const escalate = a.escalatesToManager && (args.escalate === true || str(args.escalate).toLowerCase() === "true");
  if (!message) return { success: false, message: "Ask what the message is about." };

  const classification: CallClassification = escalate ? "escalation" : "message";
  await tagCall(ctx, { classification, callerName, messageText: `${reason}: ${message}${callerPhone ? ` (call back ${formatUsPhone(callerPhone)})` : ""}`, escalationReason: escalate ? reason : null, callbackRequested: true });
  if (ctx.call && callerPhone && !ctx.call.callerPhone) await prisma.call.update({ where: { id: ctx.call.id }, data: { callerPhone } }).catch(() => {});
  // TODO(phase3): urgent notification + outbound Twilio call to the manager when `escalate`; normal notification otherwise.

  return {
    success: true,
    escalated: escalate,
    message: escalate
      ? `Message recorded and flagged for the manager. Tell ${callerName} a manager will call ${callerPhone ? formatUsPhone(callerPhone) : "them"} back within 15 minutes if it's during manager hours, otherwise when the restaurant next opens.`
      : `Message recorded. Tell ${callerName} the restaurant will call ${callerPhone ? formatUsPhone(callerPhone) : "them"} back.`,
  };
}

// ---------- dispatch ----------

export const HANDLERS: Record<FunctionName, (ctx: HandlerContext, args: Args) => Promise<HandlerResult>> = {
  get_available_times: getAvailableTimesHandler,
  book_reservation: bookReservationHandler,
  join_waitlist: joinWaitlistHandler,
  take_takeout_order: takeTakeoutOrderHandler,
  check_delivery_area: checkDeliveryAreaHandler,
  take_message: takeMessageHandler,
};
