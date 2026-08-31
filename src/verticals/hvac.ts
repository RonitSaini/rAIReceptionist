import { z } from "zod";
import type { ClassifiedReason } from "./types";
import { fieldServiceVertical } from "./field-service";
import { hvacSmsTemplates } from "./hvac.sms";

/**
 * HVAC — heating, ventilation and air conditioning.
 *
 * Structurally a plumber: a van, a patch, a diary and emergencies. What is different is which
 * emergencies, and that two of them are life-safety rather than property-damage. A burst pipe ruins
 * a floor; a carbon monoxide alarm or a gas smell can kill someone before anyone arrives, so the
 * first thing the agent does is get them out of the building and onto 911.
 *
 * The other difference is seasonal, and deliberately not modelled: "no heat in January" and "no
 * cooling in a heatwave" are the same emergency all year, because an account that only counts them
 * in season is an account that turns a vulnerable caller away in the shoulder months.
 */

export const HVAC_EMERGENCIES: readonly ClassifiedReason[] = [
  { key: "co_alarm", label: "Carbon monoxide alarm going off" },
  { key: "gas_smell", label: "Smell of gas" },
  { key: "no_heat", label: "No heat" },
  { key: "no_cooling", label: "No cooling" },
  { key: "burning_smell", label: "Burning smell from the system" },
  { key: "water_leak", label: "Water leaking from the unit" },
];

export const HVAC_ESCALATIONS: readonly ClassifiedReason[] = [
  { key: "quote_request", label: "Quote for a replacement system" },
  { key: "complaint", label: "Complaint about previous work" },
  { key: "insurance", label: "Warranty or insurance claim" },
  { key: "commercial", label: "Commercial or landlord enquiry" },
  { key: "press_vendor", label: "Press or vendor" },
];

const HVAC_GUARDRAILS: readonly string[] = [
  "If the caller says a carbon monoxide alarm is going off, or that they can smell gas: STOP. Before anything else, tell them to get everyone out of the building now, not to touch light switches or anything electrical, and to call 911 from outside. Only once you have said that should you offer to log an emergency visit. Never book a visit to a CO alarm or a gas smell without giving that instruction first.",
  "NEVER diagnose a fault over the phone and never say what is causing it, how much it will cost to fix, or how long it will take. You are not an engineer. Describe what the caller told you, and let the engineer diagnose it on site.",
  "Never quote a repair or a replacement system. You may only state a starting price for a listed service, and only when it is written above. If they press, say the engineer will confirm the price on site before doing the work.",
  "Never talk a caller through opening, resetting, relighting or repairing any part of a heating or cooling system, and never tell them to restart a furnace or boiler. You may ask whether the thermostat is switched on and what it is set to, because that costs nothing and tells the engineer something useful.",
  "Never promise an arrival time you have not booked, and never say someone is 'on the way' unless dispatch_emergency has been called.",
  "Phone numbers must be 10-digit US or Canadian numbers. Read numbers back digit by digit to confirm.",
];

export const hvac = fieldServiceVertical({
  slug: "hvac",
  label: "HVAC",
  blurb: "Heating and cooling call-outs, emergencies and a service area.",
  tradeDescription: "a heating and cooling business",

  vocabulary: {
    booking: { one: "service call", many: "service calls", One: "Service call", Many: "Service calls" },
    customer: { one: "customer", many: "customers", One: "Customer", Many: "Customers" },
    staff: { one: "engineer", many: "engineers", One: "Engineer", Many: "Engineers" },
    business: { one: "business", many: "businesses", One: "Business", Many: "Businesses" },
  },

  emergencies: HVAC_EMERGENCIES,
  escalations: HVAC_ESCALATIONS,
  guardrails: HVAC_GUARDRAILS,

  intakeSchema: z
    .object({
      system_type: z.enum(["furnace", "boiler", "heat_pump", "central_air", "other"]).optional(),
      occupancy: z.enum(["owner", "tenant"]).optional(),
    })
    .strip(),
  intakeProperties: {
    system_type: { type: "string", enum: ["furnace", "boiler", "heat_pump", "central_air", "other"], description: "What kind of system it is, if the caller knows. Do not guess." },
    occupancy: { type: "string", enum: ["owner", "tenant"], description: "Whether the caller owns the property or rents it." },
  },
  emergencyProperties: {
    system_type: { type: "string", enum: ["furnace", "boiler", "heat_pump", "central_air", "other"], description: "What kind of system it is, if the caller knows. Do not guess." },
  },

  bookingKind: "service_call",
  bookingToolDescription: "Book an HVAC visit after the caller has confirmed the address and the time. Only call with a window get_available_slots reported as free.",

  smsTemplates: hvacSmsTemplates,
  defaults: { slotMinutes: 120, intervalMinutes: 120, maxPerDay: 6 },
});
