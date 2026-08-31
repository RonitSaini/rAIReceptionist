import { z } from "zod";
import type { ClassifiedReason } from "./types";
import { fieldServiceVertical } from "./archetypes/field-service";

/**
 * Roofing — the vertical that made `bookingKind` necessary.
 *
 * A plumber's phone call ends in a repair visit. A roofer's ends in someone coming out to look and
 * price the work, which is a different thing and is worth being able to tell apart in the diary:
 * hence Job.kind `estimate`, and a three-hour default window rather than two, because getting on a
 * roof and measuring it is not a two-hour job.
 *
 * Emergencies here are weather, and they arrive in bursts. The honest answer to "when can you come"
 * during a storm is that nobody goes on a roof in high wind, so the guardrails say so rather than
 * letting the agent promise something the roofer will not do.
 */

export const ROOFING_EMERGENCIES: readonly ClassifiedReason[] = [
  { key: "active_leak", label: "Water coming into the property now" },
  { key: "storm_damage", label: "Storm damage" },
  { key: "collapse_risk", label: "Sagging or collapsing roof" },
  { key: "fallen_debris", label: "Fallen tree or debris on the roof" },
  { key: "exposed_roof", label: "Roof open to the weather" },
];

export const ROOFING_ESCALATIONS: readonly ClassifiedReason[] = [
  { key: "quote_request", label: "Quote for a full roof replacement" },
  { key: "complaint", label: "Complaint about previous work" },
  { key: "insurance", label: "Insurance claim" },
  { key: "commercial", label: "Commercial or landlord enquiry" },
  { key: "press_vendor", label: "Press or vendor" },
];

const ROOFING_GUARDRAILS: readonly string[] = [
  "NEVER tell a caller to go onto the roof, up a ladder, or into a loft to look at anything, and never suggest they photograph the damage from height. If they offer to go up, tell them not to and that the roofer will look when they come out.",
  "NEVER diagnose a roof over the phone and never say what is causing a leak, how much it will cost, or how long it will take. You are not a roofer. Describe what the caller told you, and let the roofer assess it on site.",
  "Never quote a repair or a replacement roof. You may only state a starting price for a listed service, and only when it is written above. Every price is confirmed after the roofer has been out and looked.",
  "If water is coming in now, you may suggest they put a bucket under it and move anything valuable out of the way. Nothing beyond that.",
  "Never promise that someone will come out during a storm or high wind. Say the roofer will call to arrange a time once it is safe to get on the roof.",
  "Never promise an arrival time you have not booked, and never say someone is 'on the way' unless dispatch_emergency has been called.",
  "Phone numbers must be 10-digit US or Canadian numbers. Read numbers back digit by digit to confirm.",
];

export const roofing = fieldServiceVertical({
  slug: "roofing",
  label: "Roofing",
  blurb: "Estimates, storm damage and a service area.",
  tradeDescription: "a roofing business",

  vocabulary: {
    booking: { one: "estimate", many: "estimates", One: "Estimate", Many: "Estimates" },
    customer: { one: "customer", many: "customers", One: "Customer", Many: "Customers" },
    staff: { one: "roofer", many: "roofers", One: "Roofer", Many: "Roofers" },
    business: { one: "business", many: "businesses", One: "Business", Many: "Businesses" },
  },

  tradeWords: { staff: "roofer", visit: "estimate" },

  emergencies: ROOFING_EMERGENCIES,
  escalations: ROOFING_ESCALATIONS,
  guardrails: ROOFING_GUARDRAILS,

  intakeSchema: z
    .object({
      property_type: z.enum(["house", "apartment", "commercial", "other"]).optional(),
      water_inside: z.boolean().optional(),
      occupancy: z.enum(["owner", "tenant"]).optional(),
    })
    .strip(),
  intakeProperties: {
    property_type: { type: "string", enum: ["house", "apartment", "commercial", "other"], description: "What kind of building it is." },
    water_inside: { type: "boolean", description: "Whether water is currently coming into the property." },
    occupancy: { type: "string", enum: ["owner", "tenant"], description: "Whether the caller owns the property or rents it." },
  },
  emergencyProperties: {
    water_inside: { type: "boolean", description: "Whether water is currently coming into the property." },
  },

  bookingKind: "estimate",
  bookingHeading: "BOOKING AN ESTIMATE",
  visitNoun: "Estimate visits",
  bookingToolDescription: "Book a roofing estimate after the caller has confirmed the address and the time. Only call with a window get_available_slots reported as free.",

  // Three hours, not two: getting on a roof and measuring it takes longer than a repair call.
  defaults: { slotMinutes: 180, intervalMinutes: 180, maxPerDay: 4 },
});
