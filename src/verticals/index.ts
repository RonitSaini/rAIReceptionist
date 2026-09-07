import type { Vertical } from "@prisma/client";
import type { Archetype, OnboardingStep, VerticalCatalogEntry, VerticalDefinition, Vocabulary } from "./types";
import { restaurant } from "./restaurant";
import { plumbing } from "./plumbing";
import { hvac } from "./hvac";
import { electrical } from "./electrical";
import { roofing } from "./roofing";
import { locksmith } from "./locksmith";
import { towing } from "./towing";
import { auto_repair } from "./auto_repair";
import { veterinary } from "./veterinary";
import { property_management } from "./property_management";
import { ONBOARDING_DONE } from "./steps";

export { ONBOARDING_DONE };

/**
 * The vertical registry — the only place professions are enumerated.
 *
 * Two lists, deliberately: `VERTICAL_CATALOG` is every profession the product will serve and is
 * what the sign-up picker renders, while `VERTICALS` is the professions that actually have a
 * working definition today. A card is shown for all ten so an owner can see where the product is
 * going, and only the ones with a definition behind them can be chosen. `available` is derived
 * from `VERTICALS`, so a profession becomes selectable the moment its definition lands and never
 * a phase earlier.
 */

/** Implemented definitions. Later phases add entries; nothing else in the app enumerates verticals. */
const VERTICALS = {
  restaurant,
  plumbing,
  hvac,
  electrical,
  roofing,
  locksmith,
  towing,
  auto_repair,
  veterinary,
  property_management,
} as const satisfies Partial<Record<Vertical, VerticalDefinition>>;

type CatalogSeed = Omit<VerticalCatalogEntry, "available">;

const CATALOG_SEED: readonly CatalogSeed[] = [
  { slug: "restaurant", label: "Restaurant", blurb: "Reservations, takeout orders and questions.", archetype: "restaurant" },
  { slug: "plumbing", label: "Plumbing", blurb: "Service calls, emergencies and a service area.", archetype: "field_service" },
  { slug: "hvac", label: "HVAC", blurb: "Heating and cooling call-outs, emergencies and a service area.", archetype: "field_service" },
  { slug: "electrical", label: "Electrical", blurb: "Electrical call-outs, emergencies and a service area.", archetype: "field_service" },
  { slug: "roofing", label: "Roofing", blurb: "Estimates, storm damage and a service area.", archetype: "field_service" },
  { slug: "locksmith", label: "Locksmith", blurb: "Lockouts dispatched to the caller, with response times.", archetype: "field_service" },
  { slug: "towing", label: "Towing", blurb: "Roadside dispatch, response times and a service area.", archetype: "field_service" },
  { slug: "auto_repair", label: "Auto Repair", blurb: "Appointments booked around a vehicle.", archetype: "shop_appointment" },
  { slug: "veterinary", label: "Veterinary", blurb: "Appointments booked around a pet.", archetype: "shop_appointment" },
  { slug: "property_management", label: "Property Management", blurb: "Tenant work orders and leasing enquiries.", archetype: "property_management" },
];

export const VERTICAL_CATALOG: readonly VerticalCatalogEntry[] = CATALOG_SEED.map((entry) => ({
  ...entry,
  available: entry.slug in VERTICALS,
}));

/** Slugs an owner may actually pick today. */
export const AVAILABLE_VERTICALS: readonly Vertical[] = VERTICAL_CATALOG.filter((v) => v.available).map((v) => v.slug);

/**
 * What THIS account may call, as opposed to what its profession may.
 *
 * `agentFunctions` on a definition is the superset a vertical can offer. For a dispatch-first
 * trade, whether it books scheduled work is a setting on the account, so a tow company that books
 * nothing must not be able to reach get_available_slots even if something asks for it. The agent is
 * never offered those tools; this is the backstop for when the configuration is stale or forged.
 */
export function agentFunctionsFor(account: { vertical: Vertical; takesScheduledWork?: boolean }): readonly string[] {
  const definition = verticalFor(account);
  if (!definition.dispatchFirst || account.takesScheduledWork !== false) return definition.agentFunctions;
  return definition.agentFunctions.filter((f) => f !== "get_available_slots" && f !== "book_service_call");
}

export function catalogEntry(slug: Vertical): VerticalCatalogEntry | undefined {
  return VERTICAL_CATALOG.find((v) => v.slug === slug);
}

export function isVerticalAvailable(slug: string): slug is Vertical {
  return (AVAILABLE_VERTICALS as readonly string[]).includes(slug);
}

/**
 * The definition for an account (or a bare slug).
 *
 * Throws rather than falling back to restaurant. A wrong definition would silently give a
 * plumber a restaurant's prompt, vocabulary and pages — far worse than a loud failure — and the
 * only way to reach an unimplemented slug is a bug, since the picker offers `AVAILABLE_VERTICALS`
 * and the column is an enum.
 */
export function verticalFor(source: Vertical | { vertical: Vertical }): VerticalDefinition {
  const slug = typeof source === "string" ? source : source.vertical;
  const definition = (VERTICALS as Partial<Record<Vertical, VerticalDefinition>>)[slug];
  if (!definition) {
    throw new Error(`No vertical definition for "${slug}". Implemented: ${Object.keys(VERTICALS).join(", ")}.`);
  }
  return definition;
}

/** The nouns to use when talking to or about this account. */
export function vocabularyFor(source: Vertical | { vertical: Vertical }): Vocabulary {
  return verticalFor(source).vocabulary;
}

/** The shape of the work: who travels to whom, and therefore how a job moves along. */
export function archetypeFor(source: Vertical | { vertical: Vertical }): Archetype {
  return verticalFor(source).archetype;
}

// ---------- Onboarding ----------

/**
 * Onboarding is an ordered list per vertical. Position in that list is the step number in
 * /onboarding/[step] - a URL, nothing more. What the account stores is the step's ID
 * (`Account.onboardingStepId`), so the list can be reordered without a data migration: an account
 * parked on "phone" is on the phone step wherever the phone step now sits.
 *
 * Payment comes before phone in every list (2026-09-06): a number is only issued to a paying
 * account, so the step that takes the payment has to run before the step that hands out the number.
 */
export function onboardingStepsFor(source: Vertical | { vertical: Vertical }): readonly OnboardingStep[] {
  return verticalFor(source).onboardingSteps;
}

/** The last real step's position. */
export function lastOnboardingStep(source: Vertical | { vertical: Vertical }): number {
  return onboardingStepsFor(source).length;
}

/** The position `onboardingPosition` reports for ONBOARDING_DONE: one past the last real step (restaurant: 9). */
export function onboardingDoneStep(source: Vertical | { vertical: Vertical }): number {
  return lastOnboardingStep(source) + 1;
}

/**
 * Where a step id sits in this vertical's list, 1-based; ONBOARDING_DONE is one past the end. An id
 * this vertical does not have (a row from before a step was removed, say) resolves to the first
 * real step rather than to nothing, so the owner is sent somewhere that renders.
 */
export function onboardingPosition(source: Vertical | { vertical: Vertical }, stepId: string): number {
  const steps = onboardingStepsFor(source);
  if (stepId === ONBOARDING_DONE) return steps.length + 1;
  const index = steps.findIndex((s) => s.id === stepId);
  return index < 0 ? 2 : index + 1;
}

/** The id to store once `completedStepId` is finished: the next in the list, or ONBOARDING_DONE. */
export function nextOnboardingStepId(source: Vertical | { vertical: Vertical }, completedStepId: string): string {
  const steps = onboardingStepsFor(source);
  const index = steps.findIndex((s) => s.id === completedStepId);
  if (index < 0) throw new Error(`Step "${completedStepId}" is not part of the ${typeof source === "string" ? source : source.vertical} onboarding flow.`);
  return steps[index + 1]?.id ?? ONBOARDING_DONE;
}

export function hasFinishedOnboarding(account: { onboardingStepId: string }): boolean {
  return account.onboardingStepId === ONBOARDING_DONE;
}

/** Where "continue setup" should send the owner: the position of the step they are on. */
export function onboardingResumeHref(account: { vertical: Vertical; onboardingStepId: string }): string {
  return `/onboarding/${onboardingPosition(account, account.onboardingStepId)}`;
}

/**
 * Longest flow across every implemented vertical. Used only to reject an obviously out-of-range
 * step number before the account (and therefore the real list) has been loaded.
 */
export const MAX_ONBOARDING_STEPS: number = Math.max(...Object.values(VERTICALS as Record<string, VerticalDefinition>).map((v) => v.onboardingSteps.length));

export type { VerticalDefinition, VerticalCatalogEntry, Vocabulary } from "./types";
