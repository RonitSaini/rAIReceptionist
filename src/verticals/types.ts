import type { ZodObject, ZodRawShape } from "zod";
import type { Account, BusinessHours, ManagerAvailability, MenuItem, ServiceOffering, Vertical } from "@prisma/client";
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
 * Still to come: request_immediate_dispatch (dispatch-first), book_appointment (shop), and
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
export type MessageReason = (typeof MESSAGE_REASONS)[number];

/** What a finished call was mainly about, filled in by Retell's post-call analysis. */
export const CLASSIFICATION_CHOICES = ["reservation", "takeout", "question", "waitlist", "message", "escalation", "other"] as const;

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
