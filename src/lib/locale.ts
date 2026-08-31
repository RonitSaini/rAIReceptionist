/**
 * US + Canada conventions. The country is inferred from the state/province code on the account (no schema
 * change): Canadian provinces → "CA", everything else → "US". Distances are stored in miles everywhere;
 * Canadian restaurants see and hear kilometres.
 */

export type Country = "US" | "CA";

export const CA_PROVINCES = ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"] as const;
const PROVINCE_SET = new Set<string>(CA_PROVINCES);

export function countryOf(state: string | null | undefined): Country {
  return state && PROVINCE_SET.has(state.toUpperCase()) ? "CA" : "US";
}

const US_ZIP = /^\d{5}(?:-\d{4})?$/;
const CA_POSTAL = /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d$/i;

/** US ZIP (12345 or 12345-6789) or Canadian postal code (A1A 1A1). */
export function isPostalCode(s: string): boolean {
  const v = s.trim();
  return US_ZIP.test(v) || CA_POSTAL.test(v);
}

/** Canonical form: ZIPs unchanged, Canadian codes upper-case with the single space ("m5v 3l9" → "M5V 3L9"). */
export function normalizePostalCode(s: string): string {
  const v = s.trim();
  if (CA_POSTAL.test(v)) {
    const c = v.replace(/[ -]/g, "").toUpperCase();
    return `${c.slice(0, 3)} ${c.slice(3)}`;
  }
  return v;
}

/** First ZIP or Canadian postal code inside free text (a spoken address). */
export function extractPostalCode(text: string): string | null {
  const ca = /\b([ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z])[ -]?(\d[ABCEGHJ-NPRSTV-Z]\d)\b/i.exec(text);
  if (ca) return `${ca[1]}${ca[2]}`.toUpperCase().replace(/^(.{3})/, "$1 ");
  const us = /\b(\d{5})(?:-\d{4})?\b/.exec(text);
  return us ? us[1] : null;
}

export function postalLabel(country: Country): string {
  return country === "CA" ? "postal code" : "ZIP code";
}

export function regionLabel(country: Country): string {
  return country === "CA" ? "province" : "state";
}

// ---------- Distance ----------

export const KM_PER_MILE = 1.609344;

export function distanceUnit(country: Country): "mi" | "km" {
  return country === "CA" ? "km" : "mi";
}

export function unitWord(country: Country, n = 2): string {
  return country === "CA" ? (n === 1 ? "kilometre" : "kilometres") : n === 1 ? "mile" : "miles";
}

/** Miles → the number shown to this restaurant (km for Canada), 1 decimal. */
export function displayDistance(miles: number, country: Country): number {
  const v = country === "CA" ? miles * KM_PER_MILE : miles;
  return Math.round(v * 10) / 10;
}

/** A radius typed by the owner in their unit → miles for storage. */
export function toMiles(value: number, unit: "mi" | "km"): number {
  return unit === "km" ? value / KM_PER_MILE : value;
}

export function formatDistance(miles: number, country: Country): string {
  const v = displayDistance(miles, country);
  return `${v} ${unitWord(country, v)}`;
}

// ---------- Country on the account ----------

export const COUNTRIES: { code: Country; name: string }[] = [
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
];

export function asCountry(v: string | null | undefined): Country | null {
  return v === "US" || v === "CA" ? v : null;
}

/** The stored country, with the province inference as a safety net for rows saved before the column existed. */
export function accountCountry(a: { country?: string | null; state?: string | null }): Country {
  return asCountry(a.country) ?? countryOf(a.state);
}

/** Postal-code validity for one specific country (the form knows which one the owner chose). */
export function isPostalCodeFor(s: string, country: Country): boolean {
  const v = s.trim();
  return country === "CA" ? CA_POSTAL.test(v) : US_ZIP.test(v);
}

// ---------- Money ----------

/**
 * Format a price held in micro-units (1,000,000 micros = 1 unit).
 *
 * Prices that are only ever summed and displayed are stored as integers so rounding cannot drift.
 * Both supported countries use dollars, so the symbol is the same; the currency itself is USD
 * everywhere for now, which is a product decision rather than a locale one.
 */
export function formatMoneyMicros(micros: bigint | number | null | undefined): string {
  if (micros == null) return "";
  const units = Number(micros) / 1_000_000;
  return units % 1 === 0 ? `$${units}` : `$${units.toFixed(2)}`;
}
