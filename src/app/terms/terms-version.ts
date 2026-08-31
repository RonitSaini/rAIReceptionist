/**
 * The version of /terms currently in force — date-based, and deliberately living next to the page
 * so editing the terms and bumping the version happen in the same place. Everything keys off this
 * one constant: the effective date shown on the page, the version recorded in TermsAcceptance at
 * signup and on the re-consent interstitial, and the interstitial itself (a signed-in user without
 * an acceptance row AT THIS VERSION is blocked before the dashboard). Bump it only for a material
 * change to the terms; bumping re-prompts every existing user on their next visit.
 */
export const TERMS_VERSION = "2026-08-31";

/** "August 31, 2026" — derived so the page can never disagree with the recorded version. */
export const TERMS_EFFECTIVE = new Date(`${TERMS_VERSION}T12:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
