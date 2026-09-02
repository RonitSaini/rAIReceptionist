import type { Vertical } from "@prisma/client";
import { VERTICAL_CATALOG, verticalFor } from "@/verticals";
import { generateGreeting } from "@/lib/greeting";
import type { IconName } from "@/components/icon-paths";

/**
 * Server-side data for the landing page's profession switcher and day timeline.
 *
 * Honesty contract: every string handed to the client either comes straight out of the vertical
 * registry (nouns, intake fields, emergency labels, the greeting and SMS templates) or is a
 * condensation of ONE named guardrail from a definition file. Nothing here describes behavior the
 * registry doesn't ship. Where a template takes an account value (business name), the rendered
 * string carries a visible slot instead of an invented business.
 */

const SLOT = "\u0000";

export type VoicePanel = {
  slug: Vertical;
  label: string;
  icon: IconName;
  /** The shipped default greeting (src/lib/greeting.ts) with the business-name slot exposed. */
  greeting: { before: string; slot: string; after: string };
  /** "Books ⟨service calls⟩ into your real schedule." — noun from vocabulary.booking. */
  booking: { before: string; noun: string; after: string };
  /** "What it asks a ⟨guest⟩ …" — noun from vocabulary.customer. */
  asks: { before: string; noun: string; after: string };
  /** Chips derived from intakeSchema.shape (restaurant: the Reservation table's real columns). */
  fields: string[];
  /** One entry from emergencyTypes (restaurant: escalationTriggers), label verbatim. */
  urgent: { heading: string; label: string; clause: string; tone: "red" | "amber" };
  /** The profession's signature rule, condensed from its guardrails / firstThing. */
  rule: { heading: string; body: string };
};

const ICONS: Record<Vertical, IconName> = {
  restaurant: "utensils",
  plumbing: "wrench",
  hvac: "thermometer",
  electrical: "zap",
  roofing: "home",
  locksmith: "key",
  towing: "truck",
  auto_repair: "car",
  veterinary: "paw",
  property_management: "building",
};

/**
 * Human labels for intake fields, keyed by the schema's own keys so drift shows up: a field added
 * to a definition appears here auto-humanized until it gets a label; `null` folds a key into a
 * neighbor's combined label (vehicle year/make/model become one chip).
 */
const FIELD_LABELS: Partial<Record<Vertical, Record<string, string | null>>> = {
  plumbing: { water_shut_off: "Is the water shut off?", occupancy: "Owner or tenant?" },
  hvac: { system_type: "Furnace, boiler or heat pump?", occupancy: "Owner or tenant?" },
  electrical: { power_affected: "How much of the property lost power?", occupancy: "Owner or tenant?" },
  roofing: { property_type: "House, apartment or commercial?", water_inside: "Is water coming in now?", occupancy: "Owner or tenant?" },
  locksmith: { lock_type: "Home, car or business?", job_type: "Lockout or lock change?", anyone_inside: "Anyone locked inside?" },
  towing: {
    caller_is_safe: "Are you somewhere safe?",
    vehicle_year: null,
    vehicle_make: "Year, make and model",
    vehicle_model: null,
    drivable: "Can it be driven?",
    accident_involved: "Was it an accident?",
    destination: "Where it's headed",
  },
  auto_repair: {
    vehicle_year: null,
    vehicle_make: "Year, make and model",
    vehicle_model: null,
    mileage: "Rough mileage",
    symptom: "What it's doing, in their words",
    drop_off_or_wait: "Drop off or wait?",
    tow_in_needed: "Tow-in needed?",
  },
  veterinary: {
    pet_name: "The pet's name",
    species: "Species and breed",
    breed: null,
    pet_age: "Rough age",
    symptom: "What's wrong, in their words",
    patient_status: "New or existing patient?",
  },
  property_management: {
    category: "Which category it falls under",
    description: "What's wrong, in their words",
    permission_to_enter: "OK to enter if they're out?",
    pet_on_premises: "A pet at home?",
    preferred_times: "Times that suit them",
  },
};

/** Per-profession copy that can't be derived: which noun clause, which emergency, which rule. */
const CURATION: Record<
  Vertical,
  {
    bookingBefore: string;
    bookingAfter: string;
    asksAfter: string;
    /** Key into emergencyTypes (restaurant: escalationTriggers). */
    urgentKey: string;
    urgentHeading: string;
    urgentClause: string;
    urgentTone: "red" | "amber";
    /** Condensed from the named guardrail in the definition file. */
    rule: { heading: string; body: string };
  }
> = {
  restaurant: {
    bookingBefore: "Books ",
    bookingAfter: " and takeout orders into your book.",
    asksAfter: ":",
    urgentKey: "large_party",
    urgentHeading: "Handed to a human",
    urgentClause: "is never booked by the AI: details taken, a message left for you.",
    urgentTone: "amber",
    // RESTAURANT_OWN_GUARDRAILS[0]
    rule: { heading: "Never", body: "Never invents a dish, a price, hours or a policy. If it isn't written down, it says so and takes a message." },
  },
  plumbing: {
    bookingBefore: "Books ",
    bookingAfter: " into your real schedule.",
    asksAfter: ", on top of a name and number:",
    urgentKey: "burst_pipe",
    urgentHeading: "Urgent at any hour",
    urgentClause: "wakes a human instead of waiting for opening.",
    urgentTone: "red",
    // PLUMBING_GUARDRAILS[0]
    rule: { heading: "First, always", body: "A smell of gas stops the call: leave the building, touch no switches, ring the gas line from outside. Then, and only then, a visit." },
  },
  hvac: {
    bookingBefore: "Books ",
    bookingAfter: " into your real schedule.",
    asksAfter: ", on top of a name and number:",
    urgentKey: "no_heat",
    urgentHeading: "Urgent at any hour",
    urgentClause: "counts all year; a cold house doesn't check the season.",
    urgentTone: "red",
    // HVAC_GUARDRAILS[0]
    rule: { heading: "First, always", body: "A carbon monoxide alarm means everyone out and 911 from outside, said before any booking talk." },
  },
  electrical: {
    bookingBefore: "Books ",
    bookingAfter: " into your real schedule.",
    asksAfter: ", on top of a name and number:",
    urgentKey: "sparking",
    urgentHeading: "Urgent at any hour",
    urgentClause: "means keep everyone away from it, and a human is woken.",
    urgentTone: "red",
    // ELECTRICAL_GUARDRAILS[1]
    rule: { heading: "Never", body: "Nobody gets talked into a breaker panel, a fuse box or wiring. However simple it sounds, this rule has no exceptions." },
  },
  roofing: {
    bookingBefore: "Books ",
    bookingAfter: ", not repairs: someone comes out to look and price the work.",
    asksAfter: ", on top of a name and number:",
    urgentKey: "active_leak",
    urgentHeading: "Urgent at any hour",
    urgentClause: "jumps the queue; a bucket under it and valuables out of the way is the only advice given.",
    urgentTone: "red",
    // ROOFING_GUARDRAILS[0] + [4]
    rule: { heading: "Never", body: "Nobody is sent onto the roof or up a ladder, and no crew is promised during a storm. The roofer looks when it's safe." },
  },
  locksmith: {
    bookingBefore: "",
    bookingAfter: " go straight to a live dispatch queue: a response window quoted, and you're alerted at once.",
    asksAfter: ", on top of a name and number:",
    urgentKey: "child_inside",
    urgentHeading: "Urgent at any hour",
    urgentClause: "is dispatched first; the ID talk waits until help is moving.",
    urgentTone: "red",
    // LOCKSMITH_GUARDRAILS[0] + [1]
    rule: { heading: "Every caller", body: "Hears it plainly: the locksmith checks photo ID and proof of residence at the door. A voice on the phone never decides who gets in." },
  },
  towing: {
    bookingBefore: "",
    bookingAfter: " go straight to a live dispatch queue: a response window quoted, and you're alerted at once.",
    asksAfter: ", on top of a name and number:",
    urgentKey: "blocking_traffic",
    urgentHeading: "Urgent at any hour",
    urgentClause: "is an emergency, never a request to push the car clear.",
    urgentTone: "red",
    // TOWING firstThing + TOWING_GUARDRAILS[1]
    rule: { heading: "First, always", body: "Are you somewhere safe, off the road? Asked before a name, before the vehicle. Anyone hurt means 911, right now." },
  },
  auto_repair: {
    bookingBefore: "Books ",
    bookingAfter: " around the vehicle on file.",
    asksAfter: ", on top of a name and number:",
    urgentKey: "brake_failure",
    urgentHeading: "Urgent at any hour",
    urgentClause: "means one thing first: do not drive it here.",
    urgentTone: "red",
    // AUTO_GUARDRAILS[0] + [1]
    rule: { heading: "Never", body: "No diagnosis over the phone: the symptom is recorded in the caller's own words, and nothing is guessed at, named or priced." },
  },
  veterinary: {
    bookingBefore: "Books ",
    bookingAfter: " around a pet on file.",
    asksAfter: ", on top of a name and number:",
    urgentKey: "urinary_blockage",
    urgentHeading: "Urgent even when it sounds small",
    urgentClause: "is on the urgent list precisely because it sounds minor.",
    urgentTone: "red",
    // VET_GUARDRAILS[0] + [1] + the required referral
    rule: { heading: "Never", body: "No dosages, no home remedies, no “see how it goes overnight”. Closed and urgent means the emergency referral number, read out first." },
  },
  property_management: {
    bookingBefore: "Files ",
    bookingAfter: " for the office to schedule.",
    asksAfter: ", on top of a name and number:",
    urgentKey: "flooding",
    urgentHeading: "Urgent at any hour",
    urgentClause: "wakes a human; the office isn't waiting for morning.",
    urgentTone: "red",
    // PM_GUARDRAILS[2]
    rule: { heading: "Never", body: "Never says who lives where. Confirming and denying sound identical, and a message is taken instead." },
  },
};

function fieldsFor(slug: Vertical): string[] {
  // Reservations predate the details JSON: their fields are typed columns on the Reservation
  // table (see the note in src/verticals/restaurant.ts), so the schema is deliberately empty.
  if (slug === "restaurant") return ["Name", "Phone number", "Date and time", "Party size"];
  const shape = verticalFor(slug).intakeSchema.shape;
  const labels = FIELD_LABELS[slug] ?? {};
  const out: string[] = [];
  for (const key of Object.keys(shape)) {
    const label = key in labels ? labels[key] : key.replace(/_/g, " ");
    if (label) out.push(label);
  }
  return out;
}

export function professionVoices(): VoicePanel[] {
  // The registry template, with the business-name slot kept visible; "" takes the default host.
  const [greetBefore, greetAfter] = generateGreeting(SLOT, "").split(SLOT);

  // Only implemented professions: a panel needs a definition behind it (verticalFor throws without
  // one). All ten are implemented today; a future catalog-only entry stays off this section until
  // its definition lands.
  return VERTICAL_CATALOG.filter((v) => v.available).map((v) => {
    const def = verticalFor(v.slug);
    const curated = CURATION[v.slug];
    const urgentPool = def.emergencyTypes.length ? def.emergencyTypes : def.escalationTriggers;
    const urgent = urgentPool.find((e) => e.key === curated.urgentKey) ?? urgentPool[0];
    return {
      slug: v.slug,
      label: v.label,
      icon: ICONS[v.slug],
      greeting: { before: greetBefore, slot: `your ${def.vocabulary.business.one}`, after: greetAfter },
      booking: { before: curated.bookingBefore, noun: curated.bookingBefore ? def.vocabulary.booking.many : def.vocabulary.booking.Many, after: curated.bookingAfter },
      asks: { before: "What it asks a ", noun: def.vocabulary.customer.one, after: curated.asksAfter },
      fields: fieldsFor(v.slug),
      urgent: { heading: curated.urgentHeading, label: urgent.label, clause: curated.urgentClause, tone: curated.urgentTone },
      rule: curated.rule,
    };
  });
}

/**
 * Exhibits for the annotated call in "How it works": the shipped greeting, the plumbing vertical's
 * real bookingConfirmation for a booked window (no technician and no line number set, so the
 * template shows its plain shape; the street address is the transcript's fictional one), and the
 * in-app notification title afterJobBooked writes. The business name stays a visible slot; the
 * customer name and address are illustrative.
 */
export const CALL_ADDRESS = "14 Larkspur Crescent";

export function callExhibits(): { greeting: { before: string; after: string }; sms: { before: string; after: string }; notificationTitle: string } {
  const plumbing = verticalFor("plumbing");
  const [greetBefore, greetAfter] = generateGreeting(SLOT, "").split(SLOT);
  const text = plumbing.smsTemplates.bookingConfirmation(
    { businessName: SLOT, timeZone: "America/Toronto", twilioNumber: null },
    { kind: "job", customerName: "Dana", when: new Date(Date.UTC(2026, 8, 8, 12, 0)), address: `${CALL_ADDRESS}, Whitby`, technician: null, isEmergency: false },
  );
  const [smsBefore, smsAfter] = text.split(SLOT);
  return {
    greeting: { before: greetBefore, after: greetAfter },
    sms: { before: smsBefore, after: smsAfter },
    notificationTitle: `New ${plumbing.vocabulary.booking.one}: Dana Whitfield`,
  };
}

/**
 * The day timeline's CANCEL moment shows the reply the code actually sends: the roofing vertical's
 * cancellationReply, rendered with the business-name slot exposed and a fixed illustrative time.
 * Roofing rather than HVAC/electrical because the shared template says "a ${staff}", and a
 * vowel-initial staff noun renders "a engineer" — a real template bug, out of scope here because
 * fixing it moves SMS goldens.
 */
export function cancelReplyParts(): { before: string; after: string } {
  const reply = verticalFor("roofing").smsTemplates.cancellationReply(
    { businessName: SLOT, timeZone: "America/Toronto", twilioNumber: null },
    "job",
    new Date(Date.UTC(2026, 8, 18, 18, 0)),
  );
  const [before, after] = reply.split(SLOT);
  return { before, after };
}
