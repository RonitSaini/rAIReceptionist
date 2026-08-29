export const APP_NAME = "CallCover";

export const ONBOARDING_LAST_STEP = 8;
export const ONBOARDING_DONE = 9;

export const ONBOARDING_STEPS: { step: number; title: string; short: string }[] = [
  { step: 1, title: "Create your account", short: "Sign up" },
  { step: 2, title: "Business basics", short: "Basics" },
  { step: 3, title: "Hours & escalation", short: "Hours" },
  { step: 4, title: "Menu & policies", short: "Menu" },
  { step: 5, title: "Reservations", short: "Book" },
  { step: 6, title: "Voice & greeting", short: "Voice" },
  { step: 7, title: "Phone number", short: "Phone" },
  { step: 8, title: "Payment", short: "Pay" },
];

export const US_TIME_ZONES: { id: string; label: string }[] = [
  { id: "America/New_York", label: "Eastern (New York)" },
  { id: "America/Chicago", label: "Central (Chicago)" },
  { id: "America/Denver", label: "Mountain (Denver)" },
  { id: "America/Phoenix", label: "Arizona (Phoenix, no DST)" },
  { id: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { id: "America/Anchorage", label: "Alaska (Anchorage)" },
  { id: "Pacific/Honolulu", label: "Hawaii (Honolulu)" },
];

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

export const ESCALATION_TYPES: { key: string; label: string }[] = [
  { key: "large_party", label: "Party over the large-party threshold" },
  { key: "private_event", label: "Private event or buyout" },
  { key: "catering", label: "Catering request" },
  { key: "complaint", label: "Guest complaint" },
  { key: "allergy", label: "Allergy question that staff must answer" },
  { key: "press_vendor", label: "Press or vendor" },
];

export const DIETARY_TAGS = ["vegetarian", "vegan", "gluten-free", "dairy-free", "nut-free", "spicy", "contains shellfish"];

export const MENU_CATEGORIES = ["Appetizers", "Salads", "Soups", "Entrees", "Sides", "Desserts", "Drinks", "Kids", "Specials"];

export const SEATING_PREFERENCES = ["No preference", "Indoor", "Outdoor / patio", "Bar", "Booth", "Window", "Quiet area", "High chair needed", "Wheelchair accessible"];

/** Voice options offered on the Voice & greeting step. IDs are real Retell (ElevenLabs) voice IDs, verified against /list-voices. */
export const VOICES: { id: string; name: string; description: string; sampleText: string; pitch: number; rate: number }[] = [
  { id: "11labs-Adrian", name: "Adrian", description: "Male · warm, friendly, unhurried", sampleText: "Thanks for calling! I'd be happy to help you with a reservation.", pitch: 0.9, rate: 0.95 },
  { id: "11labs-Kate", name: "Kate", description: "Female · bright, upbeat, clear", sampleText: "Thanks for calling! I'd be happy to help you with a reservation.", pitch: 1.15, rate: 1.0 },
  { id: "11labs-Lucas", name: "Lucas", description: "Male · calm, professional", sampleText: "Thanks for calling! I'd be happy to help you with a reservation.", pitch: 0.8, rate: 0.9 },
  { id: "11labs-Lily", name: "Lily", description: "Female · soft, polished, welcoming", sampleText: "Thanks for calling! I'd be happy to help you with a reservation.", pitch: 1.05, rate: 0.92 },
];

export const RECORDING_DISCLOSURE = "this call may be recorded";

export const RESERVATION_STATUSES = ["booked", "confirmed", "seated", "completed", "cancelled", "no_show"] as const;
export const TAKEOUT_STATUSES = ["new", "confirmed", "ready", "picked_up", "cancelled"] as const;
export const NOTIFICATION_TYPES = ["reservation", "takeout", "waitlist", "message", "escalation", "missed_call", "system"] as const;

export const NOTIFICATION_POLL_MS = 30_000;

export function humanize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
