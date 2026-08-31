import type { Vertical } from "@prisma/client";
import type { OnboardingStep, VerticalCatalogEntry, VerticalDefinition, Vocabulary } from "./types";
import { restaurant } from "./restaurant";

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
} as const satisfies Partial<Record<Vertical, VerticalDefinition>>;

type CatalogSeed = Omit<VerticalCatalogEntry, "available">;

const CATALOG_SEED: readonly CatalogSeed[] = [
  { slug: "restaurant", label: "Restaurant", blurb: "Reservations, takeout orders and questions.", archetype: "restaurant" },
  { slug: "plumbing", label: "Plumbing", blurb: "Service calls, emergencies and a service area.", archetype: "field_service" },
  { slug: "hvac", label: "HVAC", blurb: "Heating and cooling calls, no-heat emergencies.", archetype: "field_service" },
  { slug: "electrical", label: "Electrical", blurb: "Service calls, outages and safety escalations.", archetype: "field_service" },
  { slug: "roofing", label: "Roofing", blurb: "Estimates, leaks and storm damage.", archetype: "field_service" },
  { slug: "locksmith", label: "Locksmith", blurb: "Lockouts dispatched to the caller's location.", archetype: "field_service" },
  { slug: "towing", label: "Towing", blurb: "Tow requests dispatched to a vehicle.", archetype: "field_service" },
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

// ---------- Onboarding ----------

/**
 * Onboarding is an ordered list per vertical, and position in that list is the step number in
 * /onboarding/[step] and the value held in `Account.onboardingStep`. A restaurant's list is the
 * same eight steps in the same order it has always had, so its numbering is unchanged.
 */
export function onboardingStepsFor(source: Vertical | { vertical: Vertical }): readonly OnboardingStep[] {
  return verticalFor(source).onboardingSteps;
}

/** The last real step. `Account.onboardingStep` above this means setup is finished. */
export function lastOnboardingStep(source: Vertical | { vertical: Vertical }): number {
  return onboardingStepsFor(source).length;
}

/** The sentinel stored once every step is done (restaurant: 9). */
export function onboardingDoneStep(source: Vertical | { vertical: Vertical }): number {
  return lastOnboardingStep(source) + 1;
}

/**
 * Longest flow across every implemented vertical. Used only to reject an obviously out-of-range
 * step number before the account (and therefore the real list) has been loaded.
 */
export const MAX_ONBOARDING_STEPS: number = Math.max(...Object.values(VERTICALS as Record<string, VerticalDefinition>).map((v) => v.onboardingSteps.length));

export type { VerticalDefinition, VerticalCatalogEntry, Vocabulary } from "./types";
