import type { JobKind, Vertical } from "@prisma/client";
import type { ZodObject, ZodRawShape } from "zod";
import type { ClassifiedReason, VerticalDefinition, Vocabulary } from "../../types";
import { PM_STEP, STEP } from "../../steps";
import { SHARED_GUARDRAILS } from "../../guardrails";
import { buildPmPrompt } from "./prompt";
import { buildPmTools } from "./tools";
import { pmSmsTemplates } from "./sms";

/**
 * The property_management archetype.
 *
 * The caller is not a customer choosing a supplier; they are a tenant reporting that something in
 * their home is broken, and the person paying for this product is their landlord. That inverts the
 * usual relationship and creates the one problem no other archetype has: the agent is holding a
 * list of who lives where, and it is talking to whoever dialled the number.
 *
 * So the privacy rules are not a nicety here, they are the archetype. A caller can assert anything
 * — a name, an address, a unit — and the agent may act on the assertion, but it must never confirm
 * one. "Is Sarah still in 3B?" has exactly one safe answer, and it is the same answer whether Sarah
 * lives there or not, because a denial is as much of a disclosure as a confirmation.
 *
 * Everything else follows the shapes already built: work orders are Jobs, emergencies take the same
 * escalation path the trades use, and a leasing enquiry is a message.
 */

export type ToolProperty = { type: string; description?: string; enum?: readonly string[] };

export type PmWords = {
  /** Who attends: "maintenance". */
  staff: string;
  /** What was raised, from the caller's side: "work order". */
  visit: string;
};

export type PropertyManagementConfig = {
  slug: Vertical;
  label: string;
  blurb: string;
  tradeDescription: string;

  vocabulary: Vocabulary;
  pmWords: PmWords;

  emergencies: readonly ClassifiedReason[];
  escalations: readonly ClassifiedReason[];
  guardrails: readonly string[];

  /** What the agent records about the fault. Stored on Job.details. */
  intakeSchema: ZodObject<ZodRawShape>;
  intakeProperties: Record<string, ToolProperty>;

  /** Issue categories offered on the work order. */
  categories: readonly string[];

  defaults: { slotMinutes: number; intervalMinutes: number; maxPerDay?: number };
};

export function propertyManagementVertical(cfg: PropertyManagementConfig): VerticalDefinition {
  return {
    slug: cfg.slug,
    label: cfg.label,
    blurb: cfg.blurb,
    archetype: "property_management",

    vocabulary: cfg.vocabulary,

    onboardingSteps: [STEP.account, STEP.businessBasics, STEP.hours, PM_STEP.portfolio, PM_STEP.maintenance, STEP.voice, STEP.payment, STEP.phone],

    intakeSchema: cfg.intakeSchema,
    emergencyTypes: cfg.emergencies,
    escalationTriggers: cfg.escalations,

    dashboardModules: ["home", "notifications", "workorders", "properties", "tenants", "vendors", "calls", "settings"],
    agentFunctions: ["lookup_tenant", "create_work_order", "dispatch_emergency", "take_message"],

    agentPromptTemplate: (src) => buildPmPrompt(cfg, src),
    agentTools: (src) => buildPmTools(cfg, src),

    smsTemplates: pmSmsTemplates(cfg.pmWords),
    guardrails: [...cfg.guardrails, ...SHARED_GUARDRAILS],

    bookingKind: "work_order" satisfies JobKind,
    categories: cfg.categories,
    defaults: cfg.defaults,
  };
}
