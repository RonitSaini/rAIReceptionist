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
