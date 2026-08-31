import { z } from "zod";
import type { ClassifiedReason } from "./types";
import { shopAppointmentVertical } from "./archetypes/shop-appointment";

/**
 * Auto repair.
 *
 * The temptation this vertical has to resist is diagnosis. A caller describes a noise, and every
 * model that has read the internet has an opinion about what makes that noise and what it costs to
 * fix. Both are guesses, both will be repeated back to the shop as a promise, and the shop is the
 * one who has to explain why the actual bill is different. So: the symptom is recorded in the
 * caller's own words and nothing is inferred from it.
 *
 * The two urgent cases are urgent for the same reason — the caller is about to drive something they
 * should not drive — and the answer to both is "don't", followed by the earliest slot we have.
 */

export const AUTO_EMERGENCIES: readonly ClassifiedReason[] = [
  { key: "brake_failure", label: "Brakes not working properly" },
  { key: "overheating", label: "Engine overheating" },
  { key: "not_drivable", label: "Vehicle cannot be driven" },
  { key: "warning_light", label: "Red warning light on the dash" },
];

export const AUTO_ESCALATIONS: readonly ClassifiedReason[] = [
  { key: "quote_request", label: "Quote for a large or unusual repair" },
  { key: "complaint", label: "Complaint about previous work" },
  { key: "insurance", label: "Insurance or warranty claim" },
  { key: "commercial", label: "Fleet or commercial enquiry" },
  { key: "press_vendor", label: "Press or vendor" },
];

const AUTO_GUARDRAILS: readonly string[] = [
  "NEVER diagnose a fault. Do not say what is causing a noise, a light or a smell, do not name a part, and do not repeat back a guess the caller offers as though you agree with it. Record the symptom in their own words. The line is: the service advisor will assess it when they see the vehicle.",
  "NEVER estimate what a repair will cost, how long it will take, or whether it is serious, from a described symptom. You may state a starting price for a listed service, and only when it is written above. Everything else is: the service advisor will confirm once they have looked.",
  "If the caller says the brakes are not working properly, or the engine is overheating: tell them not to drive the vehicle. Say it plainly and before anything else. Then offer the earliest slot, or take a message if nothing is soon enough.",
  "If the vehicle cannot be driven at all, do not book a slot as though it will arrive by itself. Give the towing number above if there is one, then take a message with escalate set to true so someone calls them back.",
  "Never tell a caller to top up, bleed, refill, disconnect or adjust anything on the vehicle, and never tell them a fault is safe to ignore or safe to drive on.",
  "Phone numbers must be 10-digit US or Canadian numbers. Read numbers back digit by digit to confirm.",
];

export const auto_repair = shopAppointmentVertical({
  slug: "auto_repair",
  label: "Auto Repair",
  blurb: "Appointments booked around a vehicle.",
  tradeDescription: "an auto repair shop",

  vocabulary: {
    booking: { one: "appointment", many: "appointments", One: "Appointment", Many: "Appointments" },
    customer: { one: "customer", many: "customers", One: "Customer", Many: "Customers" },
    staff: { one: "service advisor", many: "service advisors", One: "Service advisor", Many: "Service advisors" },
    business: { one: "shop", many: "shops", One: "Shop", Many: "Shops" },
    subject: { one: "vehicle", many: "vehicles", One: "Vehicle", Many: "Vehicles" },
  },

  shopWords: { staff: "service advisor", visit: "appointment" },

  emergencies: AUTO_EMERGENCIES,
  escalations: AUTO_ESCALATIONS,
  guardrails: AUTO_GUARDRAILS,

  intakeSchema: z
    .object({
      vehicle_year: z.string().optional(),
      vehicle_make: z.string().optional(),
      vehicle_model: z.string().optional(),
      mileage: z.string().optional(),
      symptom: z.string().optional(),
      drop_off_or_wait: z.enum(["drop_off", "wait"]).optional(),
      tow_in_needed: z.boolean().optional(),
    })
    .strip(),
  intakeProperties: {
    vehicle_year: { type: "string", description: "Year of the vehicle." },
    vehicle_make: { type: "string", description: "Make of the vehicle." },
    vehicle_model: { type: "string", description: "Model of the vehicle." },
    mileage: { type: "string", description: "Rough mileage, if they know it. Do not press for an exact figure." },
    symptom: { type: "string", description: "What the vehicle is doing, in the caller's own words. Do not interpret it." },
    drop_off_or_wait: { type: "string", enum: ["drop_off", "wait"], description: "Whether they will leave the vehicle or wait for it." },
    tow_in_needed: { type: "boolean", description: "Whether the vehicle needs towing in because it cannot be driven." },
  },

  referral: {
    field: "towingPartnerPhone",
    nameField: "towingPartnerName",
    label: "Towing partner",
    hint: "Given to a caller whose vehicle cannot be driven in. Leave blank if you do not have one.",
    required: false,
    fallback: "Tell them we do not have a towing partner, and that they will need to arrange their own tow or roadside assistance.",
  },

  // A shop cannot do anything useful with a car that is still at the caller's house. The answer is
  // "don't drive it" and the earliest slot, not "bring it in this second".
  emergencyMeansComeInNow: false,
  emergencyExtra: ["Never suggest they drive it in to be looked at if the problem is brakes, overheating or a red warning light."],

  firstThing:
    "FIRST THING: ask what the vehicle is doing. If it is brakes, overheating, a red warning light, or it cannot be driven, deal with that before offering any appointment - see URGENT CASES below.",

  bookingToolDescription: "Book the vehicle in after the caller has confirmed the details and the time. Only call with a time get_available_slots reported as free.",

  defaults: { slotMinutes: 60, intervalMinutes: 60, maxPerDay: 8 },
});
