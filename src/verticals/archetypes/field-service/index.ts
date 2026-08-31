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

    onboardingSteps: [STEP.account, STEP.businessBasics, STEP.hours, FIELD_SERVICE_STEP.serviceArea, FIELD_SERVICE_STEP.services, FIELD_SERVICE_STEP.emergencies, STEP.voice, STEP.phone, STEP.payment],

    intakeSchema: cfg.intakeSchema,
    emergencyTypes: cfg.emergencies,
    escalationTriggers: cfg.escalations,

    dashboardModules: ["home", "notifications", "schedule", "jobs", "customers", "services", "calls", "settings"],
    agentFunctions: ["check_service_area", "get_available_slots", "book_service_call", "dispatch_emergency", "take_message"],

    agentPromptTemplate: (src) => buildFieldServicePrompt(cfg, src),
    agentTools: (src) => buildFieldServiceTools(cfg, src),

    smsTemplates: fieldServiceSmsTemplates(cfg.tradeWords),
    guardrails: [...cfg.guardrails, ...SHARED_GUARDRAILS],

    bookingKind: cfg.bookingKind,
    defaults: cfg.defaults,
  };
}
