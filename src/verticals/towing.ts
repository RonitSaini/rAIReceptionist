import { z } from "zod";
import type { ClassifiedReason } from "./types";
import { fieldServiceVertical } from "./archetypes/field-service";

/**
 * Towing — dispatch-first.
 *
 * The caller is standing next to a road. That single fact reorders the whole call: before a name,
 * before a vehicle, before anything the business wants to know, the agent asks whether they are
 * somewhere safe and off the carriageway, and if anyone is hurt it stops and sends them to 911.
 * Everything the tow company needs can be collected thirty seconds later; a person standing in a
 * live lane cannot wait thirty seconds.
 *
 * Nothing here is scheduled. `takesScheduledWork` still exists as an account setting because some
 * operators do run booked transports, but the default for this trade is that work is taken as it
 * comes and the only honest answer to "when" is a range.
 */

export const TOWING_EMERGENCIES: readonly ClassifiedReason[] = [
  { key: "accident", label: "Accident" },
  { key: "blocking_traffic", label: "On a highway or blocking traffic" },
  { key: "child_in_vehicle", label: "Child in the vehicle" },
  { key: "dangerous_position", label: "Vehicle in a dangerous position" },
];

export const TOWING_ESCALATIONS: readonly ClassifiedReason[] = [
  { key: "quote_request", label: "Quote for a long-distance or specialist tow" },
  { key: "complaint", label: "Complaint about a previous tow" },
  { key: "insurance", label: "Insurance or roadside-assistance claim" },
  { key: "commercial", label: "Commercial or fleet enquiry" },
  { key: "press_vendor", label: "Press or vendor" },
];

const TOWING_GUARDRAILS: readonly string[] = [
  "FIRST, BEFORE ANYTHING ELSE - before their name, before the vehicle, before the location: ask whether they are somewhere safe and off the road. If they are in a live lane, on a shoulder with traffic passing, or standing outside the vehicle on a highway, tell them to get behind a barrier or well clear of the road, or to stay belted inside with the hazards on if that is safer, and to do it now. Only then carry on.",
  "If anyone is injured, or the caller is unsure whether anyone is injured: STOP. Tell them to hang up and call 911 immediately, and to call back afterwards. Do not take any details first. Do not keep them on the line.",
  "Never tell a caller to push, steer, free, jump-start or move a vehicle themselves, and never suggest they walk along a highway. If the vehicle is blocking traffic, that is a reason to treat it as an emergency, not a reason to ask them to shift it.",
  "Never promise an arrival time. You may give the usual response range as an estimate, in the words above, and nothing more precise. A driver's arrival depends on where the truck already is.",
  "Never quote a price unless a hookup fee and a per-mile rate are both written above and prices are switched on. Otherwise say the driver will confirm pricing before any work starts.",
  "Never advise on whether a vehicle is safe to drive, and never say what is wrong with it. If they ask, say the driver will look when they arrive.",
  "Phone numbers must be 10-digit US or Canadian numbers. Read numbers back digit by digit to confirm.",
];

export const towing = fieldServiceVertical({
  slug: "towing",
  label: "Towing",
  blurb: "Roadside dispatch, response times and a service area.",
  tradeDescription: "a towing and roadside business",

  vocabulary: {
    booking: { one: "tow", many: "tows", One: "Tow", Many: "Tows" },
    customer: { one: "customer", many: "customers", One: "Customer", Many: "Customers" },
    staff: { one: "driver", many: "drivers", One: "Driver", Many: "Drivers" },
    business: { one: "business", many: "businesses", One: "Business", Many: "Businesses" },
  },

  tradeWords: {
    staff: "driver",
    visit: "tow",
    unacknowledged: "We haven't been able to confirm someone yet. If you need help right away, please try another provider. We'll call as soon as we're available.",
  },

  emergencies: TOWING_EMERGENCIES,
  escalations: TOWING_ESCALATIONS,
  guardrails: TOWING_GUARDRAILS,

  intakeSchema: z
    .object({
      caller_is_safe: z.boolean().optional(),
      vehicle_year: z.string().optional(),
      vehicle_make: z.string().optional(),
      vehicle_model: z.string().optional(),
      drivable: z.boolean().optional(),
      accident_involved: z.boolean().optional(),
      destination: z.string().optional(),
    })
    .strip(),
  intakeProperties: {
    caller_is_safe: { type: "boolean", description: "Whether the caller confirmed they are somewhere safe and off the road. Ask this first, always." },
    vehicle_year: { type: "string", description: "Year of the vehicle, if they know it." },
    vehicle_make: { type: "string", description: "Make of the vehicle." },
    vehicle_model: { type: "string", description: "Model of the vehicle." },
    drivable: { type: "boolean", description: "Whether the vehicle can be driven at all. Ask; do not infer." },
    accident_involved: { type: "boolean", description: "Whether this was an accident." },
    destination: { type: "string", description: "Where they want the vehicle taken, if they know." },
  },
  emergencyProperties: {
    caller_is_safe: { type: "boolean", description: "Whether the caller confirmed they are somewhere safe and off the road. Ask this first, always." },
    accident_involved: { type: "boolean", description: "Whether this was an accident." },
  },

  firstThing:
    "FIRST THING, BEFORE ANY OTHER QUESTION: ask whether they are somewhere safe and off the road, and whether anyone is hurt. If anyone is hurt or they are not sure, tell them to hang up and call 911 now. If they are in traffic, get them clear of it first. Do not ask for a name, a vehicle or a location until you have done this.",

  bookingKind: "dispatch",
  dispatchFirst: true,
  defaultResponseMinutes: [30, 60],
  dispatchToolDescription:
    "Log a tow request and alert dispatch now. Call it once you have confirmed the caller is safe, and have where they are, what happened, their name and a phone number.",
  bookingToolDescription: "Book a scheduled transport after the caller has confirmed the address and the time. Only call with a window get_available_slots reported as free.",

  defaults: { slotMinutes: 60, intervalMinutes: 60, maxPerDay: 12 },
});
