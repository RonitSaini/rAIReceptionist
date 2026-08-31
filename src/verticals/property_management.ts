import { z } from "zod";
import type { ClassifiedReason } from "./types";
import { propertyManagementVertical } from "./archetypes/property-management";

/**
 * Property management.
 *
 * The distinctive risk here is not a wrong booking, it is a disclosure. The agent holds a list of
 * who lives where and it is talking to whoever dialled the number, with no way to verify any claim
 * they make. So the design rule is that the agent may ACT on what a caller asserts about themselves
 * and may never CONFIRM anything about anybody — including by denial, because "no, nobody by that
 * name lives there" is just as useful to someone looking for a person as a yes would be.
 *
 * Everything else reuses shapes already built: work orders are Jobs, emergencies take the trades'
 * escalation path, and a leasing enquiry is a message with no numbers in it.
 */

export const PM_EMERGENCIES: readonly ClassifiedReason[] = [
  { key: "no_heat", label: "No heat" },
  { key: "flooding", label: "Flooding or a major leak" },
  { key: "no_power", label: "No power to the whole unit" },
  { key: "gas_smell", label: "Smell of gas" },
  { key: "lockout", label: "Locked out" },
  { key: "fire_security", label: "Fire or a security emergency" },
];

export const PM_ESCALATIONS: readonly ClassifiedReason[] = [
  { key: "complaint", label: "Complaint about the property or a neighbour" },
  { key: "leasing", label: "Leasing enquiry" },
  { key: "insurance", label: "Insurance claim" },
  { key: "press_vendor", label: "Press or vendor" },
];

export const PM_CATEGORIES = ["plumbing", "electrical", "hvac", "appliance", "pest", "lock", "structural", "other"] as const;

const PM_GUARDRAILS: readonly string[] = [
  "If the caller says they can smell gas: STOP. Before anything else, tell them to leave the building now, not to touch light switches or anything electrical, and to call the gas emergency line or 911 from outside. Only once you have said that should you log the emergency.",
  "If the caller reports a fire, or anyone in danger: STOP. Tell them to get out and call 911 immediately. Do not take details first and do not keep them on the line.",
  "Never tell a caller who lives anywhere, never confirm or deny that a named person lives anywhere, and never give out a resident's contact details. Refusing to confirm and refusing to deny must sound identical. Offer to take a message instead.",
  "Never quote rent, a deposit, availability, move-in dates or any lease term, and never say whether anything is vacant.",
  "Never promise a visit today, an arrival time, or that anything will be fixed by a particular date. The office schedules the work.",
  "Never tell a caller to shut off, bleed, reset, dismantle or repair anything themselves, and never say a fault is safe to leave.",
  "Never enter into an argument about rent, arrears, eviction or a dispute with a neighbour. Take a message and let the office handle it.",
  "Phone numbers must be 10-digit US or Canadian numbers. Read numbers back digit by digit to confirm.",
];

export const property_management = propertyManagementVertical({
  slug: "property_management",
  label: "Property Management",
  blurb: "Tenant work orders and leasing enquiries.",
  tradeDescription: "a property management office",

  vocabulary: {
    booking: { one: "work order", many: "work orders", One: "Work order", Many: "Work orders" },
    customer: { one: "resident", many: "residents", One: "Resident", Many: "Residents" },
    staff: { one: "maintenance", many: "maintenance", One: "Maintenance", Many: "Maintenance" },
    business: { one: "office", many: "offices", One: "Office", Many: "Offices" },
  },

  pmWords: { staff: "maintenance", visit: "work order" },

  emergencies: PM_EMERGENCIES,
  escalations: PM_ESCALATIONS,
  guardrails: PM_GUARDRAILS,
  categories: PM_CATEGORIES,

  intakeSchema: z
    .object({
      category: z.enum(PM_CATEGORIES).optional(),
      description: z.string().optional(),
      permission_to_enter: z.boolean().optional(),
      pet_on_premises: z.boolean().optional(),
      preferred_times: z.string().optional(),
    })
    .strip(),
  intakeProperties: {
    category: { type: "string", enum: [...PM_CATEGORIES], description: "Which category the issue falls under." },
    description: { type: "string", description: "What is wrong, in the caller's own words. Do not diagnose it." },
    permission_to_enter: { type: "boolean", description: "Whether maintenance may enter if the resident is out. Always ask." },
    pet_on_premises: { type: "boolean", description: "Whether there is a pet in the home. Always ask - someone is going to open that door." },
    preferred_times: { type: "string", description: "When suits them, in their own words." },
  },

  defaults: { slotMinutes: 60, intervalMinutes: 60 },
});
