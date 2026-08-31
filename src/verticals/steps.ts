import type { OnboardingStep } from "./types";

/**
 * The shared onboarding step registry.
 *
 * A vertical's `onboardingSteps` is an ordered list drawn from here plus any steps of its own.
 * Position in that list IS the step number in /onboarding/[step] and the value stored in
 * `Account.onboardingStep`, so steps may be reordered or omitted per vertical but their ids must
 * stay stable — the id is what picks the component to render.
 *
 * Every vertical must be able to answer the phone with only `account`, `businessBasics` and
 * `phone` completed; nothing else may be load-bearing for taking a call.
 */
export const STEP = {
  account: { id: "account", title: "Create your account", short: "Sign up" },
  businessBasics: { id: "business-basics", title: "Business basics", short: "Basics" },
  hours: { id: "hours", title: "Hours & escalation", short: "Hours" },
  voice: { id: "voice", title: "Voice & greeting", short: "Voice" },
  phone: { id: "phone", title: "Phone number", short: "Phone" },
  payment: { id: "payment", title: "Payment", short: "Pay" },
} as const satisfies Record<string, OnboardingStep>;

/** Field-service steps: where you will drive, what you sell, and what counts as an emergency. */
export const FIELD_SERVICE_STEP = {
  serviceArea: { id: "service-area", title: "Service area", short: "Area" },
  services: { id: "services", title: "Services & pricing", short: "Services" },
  emergencies: { id: "emergencies", title: "Emergencies & technician", short: "Urgent" },
  dispatch: { id: "dispatch", title: "Dispatch & response", short: "Dispatch" },
} as const satisfies Record<string, OnboardingStep>;

/** Restaurant-only steps. They live here beside the shared set so every step id is greppable in one file. */
export const RESTAURANT_STEP = {
  menuPolicies: { id: "menu-policies", title: "Menu & policies", short: "Menu" },
  reservations: { id: "reservations", title: "Reservations", short: "Book" },
} as const satisfies Record<string, OnboardingStep>;
