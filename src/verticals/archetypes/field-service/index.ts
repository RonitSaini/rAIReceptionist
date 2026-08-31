import type { JobKind, Vertical } from "@prisma/client";
import type { ZodObject, ZodRawShape } from "zod";
import type { ClassifiedReason, VerticalDefinition, Vocabulary } from "../../types";
import { FIELD_SERVICE_STEP, STEP } from "../../steps";
import { SHARED_GUARDRAILS } from "../../guardrails";
import { buildFieldServicePrompt } from "./prompt";
import { buildFieldServiceTools } from "./tools";
import { fieldServiceSmsTemplates } from "./sms";

/**
 * The field_service archetype: everything a plumber, an HVAC engineer, an electrician and a roofer
 * answer the same way.
 *
 * The shape is always the same. The customer does not come to you, you drive to them, so the call
 * has to establish three things a restaurant never asks. Is the address inside the area at all. Is
 * this an emergency, in which case nothing is scheduled and a human is woken up. And what may be
 * said about price, which for a trade is almost always "we cannot know until we look".
 *
 * What actually differs between the four is a list of emergencies, a handful of hard rules, two or
 * three intake questions and some nouns. That is what a definition supplies, and it is all it
 * supplies — a definition file contains no prompt code, no tool code and no handlers.
 *
 * Deliberately one builder per archetype rather than one generic builder with conditionals.
 * shop_appointment and property_management want their own directories beside this one; a vet
 * booking a pet in and a landlord raising a work order are not this shape with a flag set.
 *
 * Adding a fifth trade should mean writing one config object. If it ever means editing this
 * directory, the archetype has found a real limit, and that is worth saying out loud rather than
 * quietly working around.
 */

export type ToolProperty = { type: string; description?: string; enum?: readonly string[] };

/** The two words the customer-facing SMS needs. See ./sms. */
export type TradeWords = {
  /** Who turns up: "plumber", "engineer", "electrician", "roofer". */
  staff: string;
  /** What was booked, from the customer's side: "visit" for most, "estimate" for a roofer. */
  visit: string;
  /**
   * What a caller is told when nobody picked their escalation up in time.
   *
   * Only dispatch-first trades set it; for the others the situation barely arises, because nobody
   * is waiting in the road. Prefixed with the business name when sent.
   */
  unacknowledged?: string;
};

export type FieldServiceConfig = {
  slug: Vertical;
  label: string;
  /** One line on the sign-up card. */
  blurb: string;

  /** How the agent describes the business in its first sentence: "a plumbing business". */
  tradeDescription: string;

  vocabulary: Vocabulary;
  tradeWords: TradeWords;

  emergencies: readonly ClassifiedReason[];
  escalations: readonly ClassifiedReason[];

  /** This trade's own hard rules. The shared guardrails are appended after them. */
  guardrails: readonly string[];

  /** Answers worth keeping that are not columns on Job. Kept small: anything the office filters by belongs in a column. */
  intakeSchema: ZodObject<ZodRawShape>;
  /** The same fields as tool parameters, appended to book_service_call in this order. */
  intakeProperties?: Record<string, ToolProperty>;
  /** Extra parameters on dispatch_emergency — usually the subset of intake that matters when it is urgent. */
  emergencyProperties?: Record<string, ToolProperty>;

  /** What a booking IS for this trade. A roofer books estimates; everyone else books service calls. */
  bookingKind: JobKind;

  /**
   * Dispatch-first. A locksmith and a tow truck answer a different question from a plumber: not
   * "which day suits you" but "how fast can you get here". Scheduling may be absent entirely, a
   * response window is quoted instead of a slot, and every request wakes a human immediately.
   *
   * A flag rather than a second archetype because everything underneath is the same: the service
   * area, the customers, the Job rows, the emergency path, the guardrails. Only three things move,
   * and all three are branches in this directory.
   */
  dispatchFirst?: boolean;
  /** Default response window quoted when the account has not set one, in minutes. */
  defaultResponseMinutes?: [number, number];
  /** Acknowledgement window for an urgent escalation. Dispatch-first defaults to 5, others to 10. */
  ackMinutes?: number;
  /** What the caller is texted when nobody acknowledged in time. */
  unacknowledgedMessage?: string;
  /** Description on the request_immediate_dispatch tool. */
  dispatchToolDescription?: string;

  /**
   * Replaces the opening FIRST THING instruction.
   *
   * The default is "find out whether this is an emergency", which is right for a trade whose
   * caller is indoors. It is wrong for a tow: the first words out of the agent's mouth need to be
   * about getting the caller off the carriageway, and a rule at the bottom of HARD RULES is not
   * where a model looks for what to say first.
   */
  firstThing?: string;

  /** Heading and noun for the booking section. A roofer is not booking a "visit" in the same sense. */
  bookingHeading?: string;
  visitNoun?: string;
  /** Description on the book_service_call tool. */
  bookingToolDescription: string;

  defaults: { slotMinutes: number; intervalMinutes: number; maxPerDay?: number };
};

/** Turn a trade's config into a full VerticalDefinition. */
export function fieldServiceVertical(cfg: FieldServiceConfig): VerticalDefinition {
  return {
    slug: cfg.slug,
    label: cfg.label,
    blurb: cfg.blurb,
    archetype: "field_service",

    vocabulary: cfg.vocabulary,

    onboardingSteps: cfg.dispatchFirst
      ? [STEP.account, STEP.businessBasics, STEP.hours, FIELD_SERVICE_STEP.serviceArea, FIELD_SERVICE_STEP.dispatch, FIELD_SERVICE_STEP.services, FIELD_SERVICE_STEP.emergencies, STEP.voice, STEP.phone, STEP.payment]
      : [STEP.account, STEP.businessBasics, STEP.hours, FIELD_SERVICE_STEP.serviceArea, FIELD_SERVICE_STEP.services, FIELD_SERVICE_STEP.emergencies, STEP.voice, STEP.phone, STEP.payment],

    intakeSchema: cfg.intakeSchema,
    emergencyTypes: cfg.emergencies,
    escalationTriggers: cfg.escalations,

    // A dispatch-first trade gets a live queue instead of a calendar: nothing it takes has a day.
    dashboardModules: cfg.dispatchFirst
      ? (["home", "notifications", "dispatch", "schedule", "jobs", "customers", "services", "calls", "settings"] as const)
      : (["home", "notifications", "schedule", "jobs", "customers", "services", "calls", "settings"] as const),
    // The superset a dispatch-first account MAY use. agentTools() decides what it is actually
    // offered, because whether it books scheduled work is a setting rather than a profession.
    agentFunctions: cfg.dispatchFirst
      ? (["check_service_area", "request_immediate_dispatch", "get_available_slots", "book_service_call", "dispatch_emergency", "take_message"] as const)
      : (["check_service_area", "get_available_slots", "book_service_call", "dispatch_emergency", "take_message"] as const),

    agentPromptTemplate: (src) => buildFieldServicePrompt(cfg, src),
    agentTools: (src) => buildFieldServiceTools(cfg, src),

    smsTemplates: fieldServiceSmsTemplates(cfg.tradeWords),
    guardrails: [...cfg.guardrails, ...SHARED_GUARDRAILS],

    bookingKind: cfg.bookingKind,
    dispatchFirst: cfg.dispatchFirst,
    ackMinutes: cfg.ackMinutes ?? (cfg.dispatchFirst ? 5 : 10),
    unacknowledgedMessage: cfg.unacknowledgedMessage,
    defaults: cfg.defaults,
  };
}
