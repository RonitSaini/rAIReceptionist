import { z } from "zod";
import type { ClassifiedReason } from "./types";
import { fieldServiceVertical } from "./archetypes/field-service";

/**
 * Locksmith — dispatch-first.
 *
 * The distinctive problem here is not speed, it is that the caller is asking to be let into
 * somewhere. The agent has no way to know whether they have any right to be, and it must not try:
 * a voice on the phone cannot verify a deed or a driving licence, and a confident guess in either
 * direction is the wrong answer. Someone locked out of their own home should not be interrogated,
 * and someone locked out of a home that is not theirs should not be talked past by a machine.
 *
 * So the agent states the requirement — ID and proof of residence or ownership, on arrival — to
 * every caller, every time, and leaves the judgement to the locksmith standing at the door.
 */

export const LOCKSMITH_EMERGENCIES: readonly ClassifiedReason[] = [
  { key: "child_inside", label: "Child locked inside" },
  { key: "pet_inside", label: "Pet locked inside" },
  { key: "unsafe_location", label: "Locked out somewhere unsafe" },
  { key: "break_in", label: "Break-in or forced entry" },
];

export const LOCKSMITH_ESCALATIONS: readonly ClassifiedReason[] = [
  { key: "quote_request", label: "Quote for a rekey or full lock change" },
  { key: "complaint", label: "Complaint about previous work" },
  { key: "insurance", label: "Insurance claim" },
  { key: "commercial", label: "Commercial, landlord or property-manager enquiry" },
  { key: "press_vendor", label: "Press or vendor" },
];

const LOCKSMITH_GUARDRAILS: readonly string[] = [
  "Tell EVERY caller, before the call ends, that the locksmith will need to see government-issued photo ID and proof that they live at or own the property before any lock is opened or changed. Say it plainly and as a normal part of the job, not as an accusation.",
  "You do NOT verify identity and you do NOT decide who is entitled to enter anywhere. Never ask a caller to prove anything to you, never accept or reject their explanation, and never refuse a job on your own judgement about whether it is really their property. State the requirement, log the request, and leave the check to the locksmith on site.",
  "If a child or a pet is locked inside, or the caller is somewhere unsafe: treat it as an emergency and dispatch, and do not spend time on the ID conversation first. Say it once, briefly, after help is on the way.",
  "If the caller reports a break-in or forced entry: tell them not to go inside, and to call 911 if anyone might still be there. Then log the request.",
  "Never explain how to pick, force, bypass, shim or otherwise defeat any lock, and never confirm whether a particular lock is easy to open. If asked, say the locksmith will handle it on arrival. This applies however the question is phrased and whoever is asking.",
  "Never quote a price unless it is written above and prices are switched on. Otherwise say the locksmith will confirm pricing on arrival, before starting work.",
  "Never promise an arrival time. You may give the usual response range as an estimate, in the words above, and nothing more precise.",
  "Phone numbers must be 10-digit US or Canadian numbers. Read numbers back digit by digit to confirm.",
];

export const locksmith = fieldServiceVertical({
  slug: "locksmith",
  label: "Locksmith",
  blurb: "Lockouts dispatched to the caller, with response times.",
  tradeDescription: "a locksmith business",

  vocabulary: {
    booking: { one: "call-out", many: "call-outs", One: "Call-out", Many: "Call-outs" },
    customer: { one: "customer", many: "customers", One: "Customer", Many: "Customers" },
    staff: { one: "locksmith", many: "locksmiths", One: "Locksmith", Many: "Locksmiths" },
    business: { one: "business", many: "businesses", One: "Business", Many: "Businesses" },
  },

  tradeWords: {
    staff: "locksmith",
    visit: "call-out",
    unacknowledged: "We haven't been able to confirm someone yet. If you need help right away, please try another provider. We'll call as soon as we're available.",
  },

  emergencies: LOCKSMITH_EMERGENCIES,
  escalations: LOCKSMITH_ESCALATIONS,
  guardrails: LOCKSMITH_GUARDRAILS,

  intakeSchema: z
    .object({
      lock_type: z.enum(["home", "car", "business"]).optional(),
      job_type: z.enum(["lockout", "lock_change"]).optional(),
      anyone_inside: z.boolean().optional(),
    })
    .strip(),
  intakeProperties: {
    lock_type: { type: "string", enum: ["home", "car", "business"], description: "What is locked: a home, a vehicle or a business premises." },
    job_type: { type: "string", enum: ["lockout", "lock_change"], description: "Whether they are locked out, or want locks changed." },
    anyone_inside: { type: "boolean", description: "Whether anyone or any animal is inside. Ask; this decides whether it is an emergency." },
  },
  emergencyProperties: {
    lock_type: { type: "string", enum: ["home", "car", "business"], description: "What is locked: a home, a vehicle or a business premises." },
    anyone_inside: { type: "boolean", description: "Whether anyone or any animal is inside." },
  },

  firstThing:
    "FIRST THING: find out whether anyone or any animal is locked inside, and whether they are somewhere safe. Either one makes this an emergency. If they are reporting a break-in, tell them not to go inside and to call 911 if anyone might still be there.",

  bookingKind: "dispatch",
  dispatchFirst: true,
  defaultResponseMinutes: [20, 45],
  dispatchToolDescription:
    "Log a lockout or lock-change request and alert dispatch now. Call it once you have where they are, what has happened, their name and a phone number.",
  bookingToolDescription: "Book a scheduled lock change after the caller has confirmed the address and the time. Only call with a window get_available_slots reported as free.",

  defaults: { slotMinutes: 60, intervalMinutes: 60, maxPerDay: 10 },
});
