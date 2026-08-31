import type { ZodObject, ZodRawShape } from "zod";
import type { Account, BusinessHours, JobKind, ManagerAvailability, MenuItem, ServiceOffering, Vertical } from "@prisma/client";
import type { CustomTool, EndCallTool } from "@/lib/retell";

/**
 * The vertical layer.
 *
 * FrontDesk AI is one product, not ten. Every profession it answers the phone for is a
 * `VerticalDefinition` — a plain, type-checked configuration object that ships with the app —
 * and each definition maps onto exactly one of four archetypes. The archetype decides the shape
 * of the work (who travels to whom, what gets booked); the definition decides the words, the
 * questions, the rules and the pages.
 *
 * Nothing here reads the database. A definition is static code so it can be diffed, reviewed and
 * type-checked; only the values it is *rendered with* come from an account's settings.
 */

// ---------- Archetypes ----------

/**
 * - `restaurant`        the customer comes to you; party-sized reservations and takeout orders.
 * - `field_service`     you travel to the customer; a service area, a dispatch fee, a technician.
 * - `shop_appointment`  the customer brings something to you; appointment slots and a subject
 *                       record (a vehicle, a pet) carried in the booking's `details`.
 * - `property_management` tenants call about a unit; work orders instead of bookings.
 */
export const ARCHETYPES = ["restaurant", "field_service", "shop_appointment", "property_management"] as const;
export type Archetype = (typeof ARCHETYPES)[number];

// ---------- Vocabulary ----------

/**
 * One noun in the four forms the UI, SMS, notifications and prompt actually need.
 *
 * Written out rather than derived: English plurals are irregular ("dispatch" -> "dispatches")
 * and a title-case helper would mangle "work order" into "Work Order" where the copy wants
 * "Work order". Four explicit strings are cheaper than a rule with exceptions.
 */
export type Noun = {
  /** lower case singular — "reservation" */
  one: string;
  /** lower case plural — "reservations" */
  many: string;
  /** Sentence case singular — "Reservation" */
  One: string;
  /** Sentence case plural — "Reservations" */
  Many: string;
};

/**
 * The nouns every vertical must supply.
 *
 * `business` is not in the original four but is unavoidable: today's copy says "the restaurant"
 * in prompts, SMS and settings labels, and a plumber is not a restaurant. Without it the
 * restaurant experience cannot be reproduced through the layer, which is the whole test.
 */
export type Vocabulary = {
  /** What gets booked: reservation / service call / appointment / work order / tow request / dispatch. */
  booking: Noun;
  /** Who calls: guest / customer / client / tenant / driver. */
  customer: Noun;
  /** Who answers or attends: host / technician / electrician / crew lead / service advisor / veterinarian / manager / driver / locksmith. */
  staff: Noun;
  /** The account itself: restaurant / business / shop / clinic / property. */
  business: Noun;
  /**
   * What the booking is ABOUT, where that is a thing rather than a place: a vehicle, a pet.
   *
   * Optional, and set only by shop_appointment, because a plumber's service call is about a house
   * that is already the address and a restaurant's reservation is about nobody. Leaving it undefined
   * keeps it out of the serialized definition entirely, so no existing golden moves.
   */
  subject?: Noun;
};

// ---------- Onboarding ----------

/** One screen in a vertical's setup flow. Order in `onboardingSteps` is the step number. */
export type OnboardingStep = {
  /** Stable id, used to pick the component to render. Never renumber; reorder the list instead. */
  id: string;
  /** Heading shown on the step. */
  title: string;
  /** Short label for the progress rail. */
  short: string;
};

// ---------- Agent ----------

/** Everything a prompt or tool list is rendered from. */
export type AgentSource = {
  account: Account;
  hours: BusinessHours[];
  managerHours: ManagerAvailability[];
  /** Restaurant only. */
  menu: MenuItem[];
  /** Trades, shops and clinics. Empty for a restaurant. */
  services: ServiceOffering[];
  appUrl: string;
};

/**
 * Custom functions the agent may call, across every archetype implemented so far. A name here
 * without a handler behind it is a runtime failure — the endpoint 401s or 404s and the caller
 * hears the model improvise — so a function joins this union only in the phase that builds it.
 * Still to come: book_appointment (shop) and
 * lookup_tenant / create_work_order / request_showing (property management).
 */
export const AGENT_FUNCTIONS = [
  // restaurant
  "get_available_times",
  "book_reservation",
  "join_waitlist",
  "take_takeout_order",
  "check_delivery_area",
  // field_service
  "check_service_area",
  "get_available_slots",
  "book_service_call",
  "dispatch_emergency",
  // shop_appointment (auto repair, veterinary)
  "book_appointment",
  // property_management
  "lookup_tenant",
  "create_work_order",
  // field_service, dispatch-first (locksmith, towing)
  "request_immediate_dispatch",
  // every archetype
  "take_message",
] as const;
export type AgentFunctionName = (typeof AGENT_FUNCTIONS)[number];

/**
 * Why `take_message` was called. Shared across verticals because the handler, the notification
 * and the escalation sweep all switch on it; a vertical narrows the set it actually asks for
 * through `escalationTriggers`.
 */
export const MESSAGE_REASONS = ["general_question", "large_party", "private_event", "catering", "complaint", "allergy", "press_vendor", "callback_request", "other"] as const;

/**
 * Property management adds one reason and takes none away.
 *
 * Its own list rather than an extra entry on the shared one, because "leasing" offered to a plumber
 * is a category that can never be right — and adding it to the shared enum moved every existing
 * vertical's take_message tool, which is exactly the kind of quiet blast radius the goldens exist
 * to catch.
 */
export const PM_MESSAGE_REASONS = [...MESSAGE_REASONS.slice(0, -1), "leasing", "other"] as const;

export function messageReasonsFor(archetype: Archetype): readonly string[] {
  return archetype === "property_management" ? PM_MESSAGE_REASONS : MESSAGE_REASONS;
}
export type MessageReason = (typeof MESSAGE_REASONS)[number];

/**
 * What a finished call was mainly about, filled in by Retell's post-call analysis.
 *
 * Per archetype, because offering a plumber "takeout" and "waitlist" is offering two answers that
 * can never be right, and withholding "emergency" from them loses the one that matters most. The
 * restaurant list is exactly what it always was.
 */
export const CLASSIFICATION_CHOICES = ["reservation", "takeout", "question", "waitlist", "message", "escalation", "other"] as const;

export const FIELD_SERVICE_CLASSIFICATION_CHOICES = ["service_call", "estimate", "emergency", "question", "message", "escalation", "other"] as const;

/** A shop books appointments and takes messages; nothing is dispatched anywhere. */
export const SHOP_CLASSIFICATION_CHOICES = ["service_call", "emergency", "question", "message", "escalation", "other"] as const;

/** A manager's line takes work orders, emergencies, leasing enquiries and messages. */
export const PM_CLASSIFICATION_CHOICES = ["service_call", "emergency", "question", "message", "escalation", "other"] as const;

export function classificationChoicesFor(archetype: Archetype): readonly string[] {
  if (archetype === "restaurant") return CLASSIFICATION_CHOICES;
  if (archetype === "shop_appointment") return SHOP_CLASSIFICATION_CHOICES;
  if (archetype === "property_management") return PM_CLASSIFICATION_CHOICES;
  return FIELD_SERVICE_CLASSIFICATION_CHOICES;
}

// ---------- Dashboard ----------

/**
 * Nav entries a vertical turns on. `home`, `notifications`, `calls` and `settings` are shared by
 * every vertical and are always rendered; the rest are opt-in. As with functions, only modules
 * that have a page behind them today are listed.
 */
export const DASHBOARD_MODULES = [
  // shared
  "home",
  "notifications",
  "calls",
  "settings",
  // restaurant
  "book",
  "takeout",
  // field_service
  "schedule",
  "jobs",
  "customers",
  "services",
  // field_service, dispatch-first: a live queue rather than a calendar
  "dispatch",
  // shop_appointment: the vehicles or pets on file, grouped by who owns them
  "subjects",
  // property_management
  "workorders",
  "properties",
  "tenants",
  "vendors",
] as const;
export type DashboardModule = (typeof DASHBOARD_MODULES)[number];

// ---------- SMS ----------

/**
 * Guest-facing text. Every string these return must be GSM-7 encodable — a single smart quote
 * re-encodes the whole message as UCS-2 and cuts the segment size from 160 characters to 70,
 * silently multiplying the cost of every send. Enforced by tests/sms-gsm7.test.mjs, which scans
 * this file's vertical for literals.
 */
export type SmsTemplates = {
  /** Sent to the customer when a booking is created. */
  bookingConfirmation(account: SmsAccount, booking: BookingSummary): string;
  /** Sent when a manager could not be reached inside the acknowledgement window. */
  escalationFollowUp(account: SmsAccount, nextOpen: string | null): string;

  /**
   * Sent when nobody acknowledged an urgent escalation in time.
   *
   * Separate from escalationFollowUp because "the manager will call when we next open" is a fine
   * thing to tell someone waiting on a quote and a cruel thing to tell someone on a hard shoulder
   * at 2am. A dispatch-first trade tells the truth instead: we could not confirm anyone, try
   * someone else. Optional, so verticals that have no such situation are unaffected.
   */
  unacknowledged?(account: SmsAccount): string;
  /** Reply to an inbound CANCEL text. */
  cancellationReply(account: SmsAccount, kind: CancellationKind, when: Date): string;
};

export type SmsAccount = Pick<Account, "businessName" | "timeZone" | "twilioNumber">;

/** The subset of a booking that customer SMS is allowed to mention. */
export type BookingSummary = {
  customerName: string;
  /** Null for a job that has been requested but not yet given a slot. */
  when: Date | null;
  /** Restaurant: party size. Other verticals leave it undefined. */
  partySize?: number;
  /** Restaurant takeout: the dictated order. */
  items?: string;
  isWaitlist?: boolean;
  isDelivery?: boolean;
  /** Field service: where the visit is, who is coming, and whether it is an emergency. */
  address?: string | null;
  technician?: string | null;
  isEmergency?: boolean;
  /** Which template shape to render. */
  kind: "reservation" | "order" | "job";
};

export type CancellationKind = "reservation" | "waitlist" | "order" | "job";

// ---------- Escalation and emergencies ----------

/** A checklist entry shown in onboarding and used by the agent to classify a call. */
export type ClassifiedReason = {
  key: string;
  label: string;
};

// ---------- The definition ----------

export type VerticalDefinition = {
  /** Matches the Prisma `Vertical` enum value and the URL-safe id used in the picker. */
  slug: Vertical;
  /** Shown on the profession picker. */
  label: string;
  /** One line under the label on the picker card. */
  blurb: string;
  archetype: Archetype;

  vocabulary: Vocabulary;

  /** Ordered; index + 1 is the step number in /onboarding/[step]. */
  onboardingSteps: readonly OnboardingStep[];

  /**
   * Vertical-specific fields the agent collects, stored as JSON on the booking record and
   * validated before anything is written. Restaurants predate this and keep typed columns, so
   * their schema is deliberately empty rather than a duplicate of the Reservation table.
   *
   * An object schema specifically, not any ZodType: the handler validates one field at a time so
   * a single bad answer cannot discard the others, and that needs `.shape`.
   */
  intakeSchema: ZodObject<ZodRawShape>;

  /** Life-safety or same-day situations the agent must treat as urgent. */
  emergencyTypes: readonly ClassifiedReason[];
  /** Non-emergency reasons to put a human on it. */
  escalationTriggers: readonly ClassifiedReason[];

  dashboardModules: readonly DashboardModule[];
  agentFunctions: readonly AgentFunctionName[];

  /** Renders the agent's system prompt from one account's settings. */
  agentPromptTemplate(src: AgentSource): string;
  /** Renders the Retell tool list for one account. */
  agentTools(src: AgentSource): (CustomTool | EndCallTool)[];

  smsTemplates: SmsTemplates;

  /** Hard "never do this" instructions, rendered into the prompt verbatim. */
  guardrails: readonly string[];

  /**
   * What a booking on this vertical IS. A roofer's calls are estimates, not repairs, and Jobs and
   * Schedule have to be able to tell those apart; without this the archetype can only ever create
   * service calls. Left unset by restaurants, which have no Jobs.
   */
  bookingKind?: JobKind;

  /**
   * Dispatch-first: the caller's question is "how fast can you get here", not "which day suits
   * you". A mode of field_service rather than an archetype of its own — the service area, the
   * customers, the jobs and the emergency path are all the same; what changes is that scheduling
   * may be absent entirely, that a response window is quoted instead of a slot, and that every
   * request wakes a human immediately.
   */
  dispatchFirst?: boolean;

  /**
   * How long the owner has to acknowledge an urgent escalation before the caller is told the truth.
   * Dispatch-first trades use five minutes; everyone else ten. An account may override it.
   */
  ackMinutes?: number;

  /** What the caller is texted when nobody acknowledged in time. An account may override it. */
  unacknowledgedMessage?: string;

  /**
   * Where a shop sends a caller it cannot help right now: a towing partner, an emergency animal
   * hospital. Only shop_appointment sets it; onboarding reads `required` to decide whether the
   * account may finish without one.
   */
  /** Issue categories a property manager's work orders are filed under. */
  categories?: readonly string[];

  referral?: {
    field: "towingPartnerPhone" | "emergencyReferralPhone";
    nameField?: "towingPartnerName";
    label: string;
    hint: string;
    required: boolean;
    fallback: string;
  };

  defaults: VerticalDefaults;
};

export type VerticalDefaults = {
  /** Minutes one booking occupies. */
  slotMinutes: number;
  /** Minutes between offered start times. */
  intervalMinutes: number;
  /** Cap on bookings per day, when the archetype has one. */
  maxPerDay?: number;
};

/** Picker entry for a profession that has no definition yet. */
export type VerticalCatalogEntry = {
  slug: Vertical;
  label: string;
  blurb: string;
  archetype: Archetype;
  /** False until the phase that implements this vertical lands. */
  available: boolean;
};
