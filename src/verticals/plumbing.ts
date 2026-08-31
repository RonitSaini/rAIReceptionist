import { z } from "zod";
import type { ClassifiedReason } from "./types";
import { fieldServiceVertical } from "./archetypes/field-service";

/**
 * Plumbing — the first field_service vertical, and the one the archetype was extracted from.
 *
 * Everything structural now lives in ./archetypes/field-service. What is left here is what makes a
 * plumber a plumber: what counts as an emergency, what the agent must never say, and the two
 * questions worth asking that are not columns on Job.
 */

/**
 * A gas smell is in this list, but the guardrails handle it before any of the others: it is the one
 * where the right first move is to get the caller out of the building rather than book anything.
 */
export const PLUMBING_EMERGENCIES: readonly ClassifiedReason[] = [
  { key: "burst_pipe", label: "Burst pipe" },
  { key: "no_water", label: "No water at all" },
  { key: "sewage_backup", label: "Sewage backing up" },
  { key: "flooding", label: "Flooding" },
  { key: "gas_smell", label: "Smell of gas" },
  { key: "no_hot_water", label: "No hot water" },
];

/** Non-emergencies that still want a person rather than the AI. */
export const PLUMBING_ESCALATIONS: readonly ClassifiedReason[] = [
  { key: "quote_request", label: "Quote for a large or unusual job" },
  { key: "complaint", label: "Complaint about previous work" },
  { key: "insurance", label: "Insurance or warranty claim" },
  { key: "commercial", label: "Commercial or landlord enquiry" },
  { key: "press_vendor", label: "Press or vendor" },
];

const PLUMBING_GUARDRAILS: readonly string[] = [
  "If the caller says they can smell gas: STOP. Before anything else, tell them to leave the building now, not to touch light switches or anything electrical, and to call their gas emergency line from outside. Only once you have said that should you offer to log an emergency visit. Never book a visit to a gas smell without giving that instruction first.",
  "NEVER diagnose a problem over the phone and never say what is causing it, how much it will cost to fix, or how long it will take. You are not a plumber. Describe what the caller told you, and let the plumber diagnose it on site.",
  "Never quote a repair price. You may only state a starting price for a listed service, and only when it is written above. If they press, say the plumber will confirm the price on site before doing the work.",
  "Never tell a caller to shut off, drain, dismantle or repair anything, with one exception: if water is actively flooding you may ask whether they can reach their stop tap, because that limits the damage while they wait.",
  "Never promise an arrival time you have not booked, and never say someone is 'on the way' unless dispatch_emergency has been called.",
  "Phone numbers must be 10-digit US or Canadian numbers. Read numbers back digit by digit to confirm.",
];

export const plumbing = fieldServiceVertical({
  slug: "plumbing",
  label: "Plumbing",
  blurb: "Service calls, emergencies and a service area.",
  tradeDescription: "a plumbing business",

  vocabulary: {
    booking: { one: "service call", many: "service calls", One: "Service call", Many: "Service calls" },
    customer: { one: "customer", many: "customers", One: "Customer", Many: "Customers" },
    staff: { one: "plumber", many: "plumbers", One: "Plumber", Many: "Plumbers" },
    business: { one: "business", many: "businesses", One: "Business", Many: "Businesses" },
  },

  tradeWords: { staff: "plumber", visit: "visit" },

  emergencies: PLUMBING_EMERGENCIES,
  escalations: PLUMBING_ESCALATIONS,
  guardrails: PLUMBING_GUARDRAILS,

  intakeSchema: z
    .object({
      water_shut_off: z.boolean().optional(),
      occupancy: z.enum(["owner", "tenant"]).optional(),
    })
    .strip(),
  intakeProperties: {
    water_shut_off: { type: "boolean", description: "Whether the water is currently shut off at the property." },
    occupancy: { type: "string", enum: ["owner", "tenant"], description: "Whether the caller owns the property or rents it." },
  },
  emergencyProperties: {
    water_shut_off: { type: "boolean", description: "Whether the water is currently shut off at the property." },
  },

  bookingKind: "service_call",
  bookingToolDescription: "Book a plumbing visit after the caller has confirmed the address and the time. Only call with a window get_available_slots reported as free.",

  defaults: { slotMinutes: 120, intervalMinutes: 120, maxPerDay: 6 },
});
