import type { Vocabulary } from "@/verticals/types";

export const APP_NAME = "FrontDesk AI";

// Onboarding numbering, escalation triggers and the agent vocabulary are per-profession and live
// in src/verticals. What stays here is genuinely shared (days, time zones, voices) or is content
// only a restaurant renders (cuisines, menu categories, seating preferences).

export const US_TIME_ZONES: { id: string; label: string }[] = [
  { id: "America/New_York", label: "Eastern (New York)" },
  { id: "America/Chicago", label: "Central (Chicago)" },
  { id: "America/Denver", label: "Mountain (Denver)" },
  { id: "America/Phoenix", label: "Arizona (Phoenix, no DST)" },
  { id: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { id: "America/Anchorage", label: "Alaska (Anchorage)" },
  { id: "Pacific/Honolulu", label: "Hawaii (Honolulu)" },
];

export const CA_TIME_ZONES: { id: string; label: string }[] = [
  { id: "America/St_Johns", label: "Newfoundland (St. John's)" },
  { id: "America/Halifax", label: "Atlantic (Halifax)" },
  { id: "America/Toronto", label: "Eastern (Toronto, Montréal)" },
  { id: "America/Winnipeg", label: "Central (Winnipeg)" },
  { id: "America/Regina", label: "Saskatchewan (Regina, no DST)" },
  { id: "America/Edmonton", label: "Mountain (Edmonton, Calgary)" },
  { id: "America/Vancouver", label: "Pacific (Vancouver)" },
];

/** Every zone the app accepts, grouped for the time-zone picker. */
export const TIME_ZONE_GROUPS: { label: string; zones: { id: string; label: string }[] }[] = [
  { label: "United States", zones: US_TIME_ZONES },
  { label: "Canada", zones: CA_TIME_ZONES },
];
export const ALL_TIME_ZONES = [...US_TIME_ZONES, ...CA_TIME_ZONES];
export function timeZonesFor(country: "US" | "CA"): { id: string; label: string }[] {
  return country === "CA" ? CA_TIME_ZONES : US_TIME_ZONES;
}

export const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

/**
 * The zone most of a state or province lives in — a handful straddle two (TX, ID, TN, …), so this
 * is a default for the picker to land on, never a fact the owner cannot correct. Keys and values
 * both come from the lists above.
 */
const US_STATE_ZONE: Record<string, string> = {
  CT: "America/New_York", DE: "America/New_York", DC: "America/New_York", FL: "America/New_York", GA: "America/New_York", IN: "America/New_York", KY: "America/New_York", ME: "America/New_York", MD: "America/New_York", MA: "America/New_York", MI: "America/New_York", NH: "America/New_York", NJ: "America/New_York", NY: "America/New_York", NC: "America/New_York", OH: "America/New_York", PA: "America/New_York", RI: "America/New_York", SC: "America/New_York", VT: "America/New_York", VA: "America/New_York", WV: "America/New_York",
  AL: "America/Chicago", AR: "America/Chicago", IL: "America/Chicago", IA: "America/Chicago", KS: "America/Chicago", LA: "America/Chicago", MN: "America/Chicago", MS: "America/Chicago", MO: "America/Chicago", NE: "America/Chicago", ND: "America/Chicago", OK: "America/Chicago", SD: "America/Chicago", TN: "America/Chicago", TX: "America/Chicago", WI: "America/Chicago",
  CO: "America/Denver", ID: "America/Denver", MT: "America/Denver", NM: "America/Denver", UT: "America/Denver", WY: "America/Denver",
  AZ: "America/Phoenix",
  CA: "America/Los_Angeles", NV: "America/Los_Angeles", OR: "America/Los_Angeles", WA: "America/Los_Angeles",
  AK: "America/Anchorage",
  HI: "Pacific/Honolulu",
};

const CA_PROVINCE_ZONE: Record<string, string> = {
  NL: "America/St_Johns",
  NB: "America/Halifax", NS: "America/Halifax", PE: "America/Halifax",
  ON: "America/Toronto", QC: "America/Toronto", NU: "America/Toronto",
  MB: "America/Winnipeg",
  SK: "America/Regina",
  AB: "America/Edmonton", NT: "America/Edmonton",
  BC: "America/Vancouver", YT: "America/Vancouver",
};

/** The time zone a picked state/province implies, or null for a region we don't know. */
export function timeZoneForRegion(country: "US" | "CA", region: string): string | null {
  const key = region.trim().toUpperCase();
  return (country === "CA" ? CA_PROVINCE_ZONE : US_STATE_ZONE)[key] ?? null;
}

export const CUISINE_TYPES = [
  "American",
  "Italian",
  "Mexican",
  "Chinese",
  "Japanese",
  "Sushi",
  "Thai",
  "Indian",
  "Mediterranean",
  "Greek",
  "French",
  "Steakhouse",
  "Seafood",
  "BBQ",
  "Pizza",
  "Burgers",
  "Vegetarian / Vegan",
  "Cafe / Bakery",
  "Bar & Grill",
  "Other",
];

export const PRICE_RANGES: { value: string; label: string }[] = [
  { value: "$", label: "$ — under $15 per person" },
  { value: "$$", label: "$$ — $15 to $30 per person" },
  { value: "$$$", label: "$$$ — $30 to $60 per person" },
  { value: "$$$$", label: "$$$$ — over $60 per person" },
];

export const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const DIETARY_TAGS = ["vegetarian", "vegan", "gluten-free", "dairy-free", "nut-free", "spicy", "contains shellfish"];

export const MENU_CATEGORIES = ["Appetizers", "Salads", "Soups", "Entrees", "Sides", "Desserts", "Drinks", "Kids", "Specials"];

export const SEATING_PREFERENCES = ["No preference", "Indoor", "Outdoor / patio", "Bar", "Booth", "Window", "Quiet area", "High chair needed", "Wheelchair accessible"];

/** Voice options offered on the Voice & greeting step. IDs are real Retell (ElevenLabs) voice IDs, verified against /list-voices. */
export const VOICES: { id: string; name: string; description: string; sampleText: string; pitch: number; rate: number }[] = [
  { id: "11labs-Adrian", name: "Adrian", description: "Male · warm, friendly, unhurried", sampleText: "Thanks for calling! I'd be happy to help you with a reservation.", pitch: 0.9, rate: 0.95 },
  { id: "11labs-Grace", name: "Grace", description: "Female · natural, warm, easygoing (Retell recommended)", sampleText: "Thanks for calling! I'd be happy to help you with a reservation.", pitch: 1.1, rate: 0.97 },
  { id: "11labs-Nico", name: "Nico", description: "Male · relaxed, conversational (Retell recommended)", pitch: 0.85, rate: 0.95, sampleText: "Thanks for calling! I'd be happy to help you with a reservation." },
  { id: "11labs-Lily", name: "Lily", description: "Female · soft, polished, welcoming", sampleText: "Thanks for calling! I'd be happy to help you with a reservation.", pitch: 1.05, rate: 0.92 },
];

export const RECORDING_DISCLOSURE = "this call may be recorded";

export const RESERVATION_STATUSES = ["booked", "confirmed", "seated", "completed", "cancelled", "no_show"] as const;
export const TAKEOUT_STATUSES = ["new", "confirmed", "ready", "picked_up", "cancelled"] as const;
export const NOTIFICATION_TYPES = ["reservation", "takeout", "waitlist", "message", "escalation", "missed_call", "system"] as const;

/** A trade never gets a reservation, a takeout order or a waitlist entry; it gets jobs. */
export const FIELD_SERVICE_NOTIFICATION_TYPES = ["job", "message", "escalation", "missed_call", "system"] as const;

export const NOTIFICATION_POLL_MS = 30_000;

export function humanize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * What to call a call's outcome.
 *
 * `service_call` is one value covering every trade, so it reads in the vocabulary: "Service call"
 * for a plumber, "Estimate" for a roofer. Everything else humanizes.
 */
export function classificationLabel(value: string, words?: Vocabulary): string {
  if (words && value === "service_call") return words.booking.One;
  return humanize(value);
}
