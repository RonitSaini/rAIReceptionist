import { z } from "zod";
import type { ClassifiedReason } from "./types";
import { fieldServiceVertical } from "./field-service";
import { electricalSmsTemplates } from "./electrical.sms";

/**
 * Electrical.
 *
 * The trade where the caller can kill themselves following advice. A plumber's worst case is that
 * somebody gets wet; here, "just flip the main breaker" or "have a look in the panel" is a sentence
 * that can end a life, and a model that has read the whole internet knows plenty of ways to say it.
 * So the guardrails are blunter than the other trades': never the panel, never the wiring, never a
 * reset, and burning or smoke means out of the building and 911 before anything is booked.
 */

export const ELECTRICAL_EMERGENCIES: readonly ClassifiedReason[] = [
  { key: "burning_smell", label: "Burning smell" },
  { key: "smoke", label: "Smoke from an outlet, switch or panel" },
  { key: "sparking", label: "Sparking or arcing" },
  { key: "exposed_wiring", label: "Exposed or damaged wiring" },
  { key: "power_out", label: "Total loss of power" },
  { key: "water_contact", label: "Water reaching wiring or a panel" },
];

export const ELECTRICAL_ESCALATIONS: readonly ClassifiedReason[] = [
  { key: "quote_request", label: "Quote for a rewire or panel upgrade" },
  { key: "complaint", label: "Complaint about previous work" },
  { key: "insurance", label: "Insurance or warranty claim" },
  { key: "commercial", label: "Commercial or landlord enquiry" },
  { key: "press_vendor", label: "Press or vendor" },
];

const ELECTRICAL_GUARDRAILS: readonly string[] = [
  "If the caller reports a burning smell or smoke: STOP. Before anything else, tell them to get everyone out of the building now and call 911 from outside. Only once you have said that should you offer to log an emergency visit. Never book a visit to a burning smell or smoke without giving that instruction first.",
  "NEVER tell a caller to open, inspect, reset or touch a breaker panel, a fuse box, a meter or any wiring, for any reason, however confident they sound and however simple it seems. If they ask, say an electrician has to do it and that you are logging the visit now. This rule has no exceptions.",
  "NEVER diagnose a fault over the phone and never say what is causing it, how much it will cost to fix, or how long it will take. You are not an electrician. Describe what the caller told you, and let the electrician diagnose it on site.",
  "Never quote a repair, a rewire or a panel upgrade. You may only state a starting price for a listed service, and only when it is written above. If they press, say the electrician will confirm the price on site before doing the work.",
  "If anything is sparking, smoking or wet, tell the caller not to touch it and to keep everyone away from it while they wait.",
  "Never promise an arrival time you have not booked, and never say someone is 'on the way' unless dispatch_emergency has been called.",
  "Phone numbers must be 10-digit US or Canadian numbers. Read numbers back digit by digit to confirm.",
];

export const electrical = fieldServiceVertical({
  slug: "electrical",
  label: "Electrical",
  blurb: "Electrical call-outs, emergencies and a service area.",
  tradeDescription: "an electrical business",

  vocabulary: {
    booking: { one: "service call", many: "service calls", One: "Service call", Many: "Service calls" },
    customer: { one: "customer", many: "customers", One: "Customer", Many: "Customers" },
    staff: { one: "electrician", many: "electricians", One: "Electrician", Many: "Electricians" },
    business: { one: "business", many: "businesses", One: "Business", Many: "Businesses" },
  },

  emergencies: ELECTRICAL_EMERGENCIES,
  escalations: ELECTRICAL_ESCALATIONS,
  guardrails: ELECTRICAL_GUARDRAILS,

  intakeSchema: z
    .object({
      power_affected: z.enum(["whole_property", "one_circuit", "one_outlet", "unsure"]).optional(),
      occupancy: z.enum(["owner", "tenant"]).optional(),
    })
    .strip(),
  intakeProperties: {
    power_affected: { type: "string", enum: ["whole_property", "one_circuit", "one_outlet", "unsure"], description: "How much of the property has lost power. Ask; never guess from the description." },
    occupancy: { type: "string", enum: ["owner", "tenant"], description: "Whether the caller owns the property or rents it." },
  },
  emergencyProperties: {
    power_affected: { type: "string", enum: ["whole_property", "one_circuit", "one_outlet", "unsure"], description: "How much of the property has lost power. Ask; never guess from the description." },
  },

  bookingKind: "service_call",
  bookingToolDescription: "Book an electrical visit after the caller has confirmed the address and the time. Only call with a window get_available_slots reported as free.",

  smsTemplates: electricalSmsTemplates,
  defaults: { slotMinutes: 120, intervalMinutes: 120, maxPerDay: 6 },
});
