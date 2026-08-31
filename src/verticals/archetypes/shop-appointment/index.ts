import type { JobKind, Vertical } from "@prisma/client";
import type { ZodObject, ZodRawShape } from "zod";
import type { ClassifiedReason, VerticalDefinition, Vocabulary } from "../../types";
import { SHOP_STEP, STEP } from "../../steps";
import { SHARED_GUARDRAILS } from "../../guardrails";
import { buildShopPrompt } from "./prompt";
import { buildShopTools } from "./tools";
import { shopSmsTemplates } from "./sms";

/**
 * The shop_appointment archetype: the customer comes to you.
 *
 * That one fact removes three quarters of what field_service needed. There is no service area,
 * because nobody drives anywhere. There is no radius, no geocoding and no "are you inside it".
 * Nothing is dispatched. What is left is a diary, a subject the appointment is *about* — a vehicle,
 * an animal — and the question of what to do with the callers you cannot help yourself.
 *
 * That last part is why this is its own directory rather than a flag. A field_service emergency
 * means "send our own person now". Here it means the opposite: a car that cannot be driven goes to
 * somebody else's tow truck, and a dog that cannot breathe at eleven at night goes to somebody
 * else's hospital. The archetype's job is to hand the caller on, correctly and immediately, and a
 * branch inside the dispatch builder would have been the wrong shape for that.
 *
 * Adding a third profession here should mean writing one config object.
 */

export type ToolProperty = { type: string; description?: string; enum?: readonly string[] };

/** The words the customer-facing SMS needs. */
export type ShopWords = {
  /** Who attends: "service advisor", "veterinarian". */
  staff: string;
  /** What was booked, from the customer's side: "appointment". */
  visit: string;
};

/**
 * Where a caller is sent when this business cannot help them right now.
 *
 * A shop has exactly one of these and it is the most important thing on the page. `required` makes
 * onboarding refuse to continue without it, which is right for a vet — an emergency call at
 * midnight with no number to give is the worst outcome the product can produce — and wrong for a
 * garage, which may genuinely have no towing partner and should say so rather than invent one.
 */
export type Referral = {
  /** Field on Account holding the number. */
  field: "towingPartnerPhone" | "emergencyReferralPhone";
  /** Field on Account holding the name, where there is one. */
  nameField?: "towingPartnerName";
  label: string;
  hint: string;
  required: boolean;
  /** What the agent says when the number is missing. Never nothing. */
  fallback: string;
};

export type ShopAppointmentConfig = {
  slug: Vertical;
  label: string;
  blurb: string;

  /** How the agent describes the business in its first sentence: "an auto repair shop". */
  tradeDescription: string;

  vocabulary: Vocabulary & { subject: NonNullable<Vocabulary["subject"]> };
  shopWords: ShopWords;

  /** Situations that must not wait for the next free slot. */
  emergencies: readonly ClassifiedReason[];
  escalations: readonly ClassifiedReason[];

  guardrails: readonly string[];

  /** What the agent collects about the vehicle or the animal. Stored on Job.details. */
  intakeSchema: ZodObject<ZodRawShape>;
  intakeProperties: Record<string, ToolProperty>;

  referral: Referral;

  /**
   * Whether an emergency during opening hours means "come in now".
   *
   * A vet says yes: the animal is brought straight in and a human is woken up. A garage says no —
   * there is nothing useful a shop can do with a car that has no brakes except tell the caller not
   * to drive it and find them the earliest slot.
   */
  emergencyMeansComeInNow: boolean;

  /** Extra lines appended to the emergency section, for anything trade-specific. */
  emergencyExtra?: readonly string[];

  bookingToolDescription: string;
  /** Replaces the opening FIRST THING instruction. */
  firstThing?: string;

  defaults: { slotMinutes: number; intervalMinutes: number; maxPerDay?: number };
};

/** Turn a shop's config into a full VerticalDefinition. */
export function shopAppointmentVertical(cfg: ShopAppointmentConfig): VerticalDefinition {
  return {
    slug: cfg.slug,
    label: cfg.label,
    blurb: cfg.blurb,
    archetype: "shop_appointment",

    vocabulary: cfg.vocabulary,

    onboardingSteps: [STEP.account, STEP.businessBasics, STEP.hours, SHOP_STEP.appointments, SHOP_STEP.handoffs, STEP.voice, STEP.phone, STEP.payment],

    intakeSchema: cfg.intakeSchema,
    emergencyTypes: cfg.emergencies,
    escalationTriggers: cfg.escalations,

    // `schedule` is the diary, labelled "Appointments"; `subjects` is the read-only view of the
    // vehicles or pets on file. Neither needs a table of its own.
    dashboardModules: ["home", "notifications", "schedule", "jobs", "customers", "subjects", "services", "calls", "settings"],
    agentFunctions: ["get_available_slots", "book_appointment", "take_message"],

    agentPromptTemplate: (src) => buildShopPrompt(cfg, src),
    agentTools: (src) => buildShopTools(cfg, src),

    smsTemplates: shopSmsTemplates(cfg.shopWords),
    guardrails: [...cfg.guardrails, ...SHARED_GUARDRAILS],

    bookingKind: "shop_visit" satisfies JobKind,
    referral: cfg.referral,
    defaults: cfg.defaults,
  };
}
