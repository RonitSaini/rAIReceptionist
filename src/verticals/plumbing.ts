import { z } from "zod";
import type { Account, BusinessHours, ManagerAvailability, ServiceOffering } from "@prisma/client";
import type { CustomTool, EndCallTool } from "@/lib/retell";
import { DAYS_OF_WEEK } from "@/lib/constants";
import { formatClock } from "@/lib/time";
import { formatRestaurantAddress } from "@/lib/geo";
import { accountCountry, formatDistance, formatMoneyMicros, postalLabel } from "@/lib/locale";
import { DEFAULT_CLOSE, DEFAULT_OPEN } from "@/lib/availability";
import { MESSAGE_REASONS, type AgentSource, type ClassifiedReason, type VerticalDefinition } from "./types";
import { DATE, END_CALL_TOOL, PHONE, TIME, customTool } from "./tools";
import { FIELD_SERVICE_STEP, STEP } from "./steps";
import { SHARED_GUARDRAILS } from "./guardrails";
import { plumbingSmsTemplates } from "./plumbing.sms";

/**
 * Plumbing — the first field_service vertical.
 *
 * The archetype's shape: the customer does not come to you, you drive to them. That changes three
 * things the restaurant never had to answer. Is the address inside the area at all. Is this an
 * emergency, in which case nothing is scheduled and a human is woken up. And what may be said about
 * price, which for a trade is almost always "we cannot know until we look".
 */

// ---------- What counts as urgent ----------

/**
 * A gas smell is in this list, but the prompt handles it before any of the others: it is the one
 * where the right first move is to get the caller out of the building rather than book anything.
 */
export const PLUMBING_EMERGENCIES: readonly ClassifiedReason[] = [
  { key: "burst_pipe", label: "Burst pipe" },
  { key: "no_water", label: "No water at all" },
  { key: "sewage_backup", label: "Sewage backing up" },
  { key: "flooding", label: "Flooding" },
  { key: "gas_smell", label: "Smell of gas" },
  { key: "no_hot_water", label: "No hot water" },
];

/** Non-emergencies that still want a person rather than the AI. */
export const PLUMBING_ESCALATIONS: readonly ClassifiedReason[] = [
  { key: "quote_request", label: "Quote for a large or unusual job" },
  { key: "complaint", label: "Complaint about previous work" },
  { key: "insurance", label: "Insurance or warranty claim" },
  { key: "commercial", label: "Commercial or landlord enquiry" },
  { key: "press_vendor", label: "Press or vendor" },
];

// ---------- Prompt sections ----------

function hoursSection(hours: BusinessHours[]): string {
  if (hours.length === 0) return `Working every day ${formatClock(DEFAULT_OPEN)} to ${formatClock(DEFAULT_CLOSE)}.`;
  const lines: string[] = [];
  for (let d = 0; d < 7; d++) {
    const rows = hours.filter((h) => h.dayOfWeek === d).sort((a, b) => a.sortOrder - b.sortOrder);
    if (rows.length === 0 || rows.every((r) => r.isClosed)) {
      lines.push(`- ${DAYS_OF_WEEK[d]}: Not working`);
      continue;
    }
    lines.push(`- ${DAYS_OF_WEEK[d]}: ${rows.filter((r) => !r.isClosed).map((r) => `${formatClock(r.open)}-${formatClock(r.close)}`).join(", ")}`);
  }
  return lines.join("\n");
}

function managerHoursSection(rows: ManagerAvailability[]): string {
  if (rows.length === 0) return "The owner can usually be reached during working hours.";
  return rows
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    .map((r) => `- ${DAYS_OF_WEEK[r.dayOfWeek]}: ${formatClock(r.start)}-${formatClock(r.end)}`)
    .join("\n");
}

function servicesSection(services: ServiceOffering[], canQuotePrices: boolean): string {
  const items = services.filter((s) => s.enabled);
  if (items.length === 0) {
    return "No service list has been provided. Describe what the caller needs in their own words and book a visit; never invent a service or a price.";
  }
  const byCategory = new Map<string, ServiceOffering[]>();
  for (const s of items) {
    const cat = s.category?.trim() || "Services";
    byCategory.set(cat, [...(byCategory.get(cat) ?? []), s]);
  }
  const lines: string[] = [];
  for (const [cat, rows] of byCategory) {
    lines.push(`${cat}:`);
    for (const s of rows) {
      // A price is only ever spoken when BOTH the account and that individual service allow it,
      // and always as a starting figure - a trade cannot quote a repair it has not seen.
      const price = canQuotePrices && s.canQuote && s.priceFromMicros != null ? ` - from ${formatMoneyMicros(s.priceFromMicros)}` : "";
      lines.push(`- ${s.name}${price}`);
    }
  }
  return lines.join("\n");
}

function serviceAreaSection(a: Account): string {
  const country = accountCountry(a);
  const radius = a.deliveryRadiusMiles != null ? formatDistance(Number(a.deliveryRadiusMiles), country) : null;
  return [
    `SERVICE AREA: ${radius ? `About ${radius} around the business.` : "Ask the owner's office if unsure."} ALWAYS call check_service_area with the full street address before offering any time or booking anything.`,
    `If the address is outside the area, say politely that you do not cover it, do not book a visit, and offer to take a message. Do not suggest another company.`,
    `Ask for the full street address including the ${postalLabel(country)}.`,
  ].join("\n");
}

function emergencySection(a: Account, managerHours: ManagerAvailability[]): string {
  const enabled = PLUMBING_EMERGENCIES.filter((e) => a.emergencyTypes.includes(e.key));
  const list = (enabled.length ? enabled : PLUMBING_EMERGENCIES).map((e) => e.label.toLowerCase());
  return [
    "EMERGENCIES: These are not booked into a normal slot. Confirm the address and a callback number, then call dispatch_emergency.",
    `Treat as an emergency: ${list.join("; ")}.`,
    `Tell the caller ${a.technicianName || "the plumber"} will call them back within 15 minutes. Never promise an arrival time yourself.`,
    "Owner reachable hours:",
    managerHoursSection(managerHours),
  ].join("\n");
}

function bookingSection(a: Account): string {
  const fee = a.calloutFeeMicros != null ? ` There is a call-out fee of ${formatMoneyMicros(a.calloutFeeMicros)}, which you should mention before booking.` : "";
  return [
    "BOOKING A VISIT: Call get_available_slots before offering any time - never guess. Collect: the full street address, what is wrong in their own words, their name, and a phone number (offer to use the number they are calling from).",
    `Visits are ${a.jobSlotMinutes} minutes long.${fee}`,
    "Read the address and the time back and get a yes before calling book_service_call.",
    "NO SLOTS LEFT: if there is nothing free on the days they can do, do not invent a time and do not promise a call-out. Take a message with take_message so the office can call them back.",
  ].join("\n");
}

/** Plumbing's own hard rules. The shared ones are appended in the definition. */
const PLUMBING_OWN_GUARDRAILS: readonly string[] = [
  "If the caller says they can smell gas: STOP. Before anything else, tell them to leave the building now, not to touch light switches or anything electrical, and to call their gas emergency line from outside. Only once you have said that should you offer to log an emergency visit. Never book a visit to a gas smell without giving that instruction first.",
  "NEVER diagnose a problem over the phone and never say what is causing it, how much it will cost to fix, or how long it will take. You are not a plumber. Describe what the caller told you, and let the plumber diagnose it on site.",
  "Never quote a repair price. You may only state a starting price for a listed service, and only when it is written above. If they press, say the plumber will confirm the price on site before doing the work.",
  "Never tell a caller to shut off, drain, dismantle or repair anything, with one exception: if water is actively flooding you may ask whether they can reach their stop tap, because that limits the damage while they wait.",
  "Never promise an arrival time you have not booked, and never say someone is 'on the way' unless dispatch_emergency has been called.",
  "Phone numbers must be 10-digit US or Canadian numbers. Read numbers back digit by digit to confirm.",
];

const PLUMBING_GUARDRAILS: readonly string[] = [...PLUMBING_OWN_GUARDRAILS, ...SHARED_GUARDRAILS];

function buildPlumbingPrompt(src: AgentSource): string {
  const a = src.account;
  const address = formatRestaurantAddress(a);
  const services = (src.services ?? []) as ServiceOffering[];
  return [
    `You are ${a.hostName}, answering the phone for ${a.restaurantName}, a plumbing business${address ? ` based at ${address}` : ""}. You are on the phone, so keep every reply short (one or two sentences), calm and practical. Ask one question at a time. Never mention that you are an AI unless asked directly; if asked, say yes, you are the office's automated assistant.`,
    "",
    "Right now it is {{current_time}} on {{current_date}} (local time, {{timezone}}). The caller is calling from {{caller_phone}}. Use today's date to resolve words like 'today', 'tomorrow' or 'Friday' into a YYYY-MM-DD date before calling any function.",
    "",
    "FIRST THING: find out whether this is an emergency. Ask what is happening. If it matches the emergency list below, handle it as an emergency and do not try to schedule a normal visit.",
    "",
    "WHAT YOU CAN DO: (1) book a service call, (2) handle an emergency, (3) answer questions using only the information below, (4) take a message.",
    "",
    "WORKING HOURS:",
    hoursSection(src.hours),
    "",
    "SERVICES:",
    servicesSection(services, a.canQuotePrices),
    "",
    serviceAreaSection(a),
    "",
    bookingSection(a),
    "",
    emergencySection(a, src.managerHours),
    "",
    "HARD RULES:",
    ...PLUMBING_GUARDRAILS.map((rule) => `- ${rule}`),
  ].join("\n");
}

// ---------- Tools ----------

const ADDRESS = { type: "string", description: "Full street address of the property, including city and ZIP or postal code." };

function buildPlumbingTools(src: AgentSource): (CustomTool | EndCallTool)[] {
  const u = src.appUrl;
  const tools: (CustomTool | EndCallTool)[] = [
    customTool(
      "check_service_area",
      "Check whether an address is inside the service area. Always call this before offering a time or booking a visit.",
      { address: ADDRESS },
      ["address"],
      u,
      { execution_message_description: "Say 'Let me check if we cover that area.'" },
    ),
    customTool(
      "get_available_slots",
      "Find the free visit windows on a day. Call before offering any time. For an emergency this returns no times and tells you to dispatch instead.",
      { date: DATE, is_emergency: { type: "boolean", description: "true when the caller's situation matches the emergency list." } },
      ["date"],
      u,
      { execution_message_description: "Say something like 'Let me look at the diary.'" },
    ),
    customTool(
      "book_service_call",
      "Book a plumbing visit after the caller has confirmed the address and the time. Only call with a window get_available_slots reported as free.",
      {
        customer_name: { type: "string", description: "Who the visit is for." },
        customer_phone: PHONE,
        address: ADDRESS,
        description: { type: "string", description: "What is wrong, in the caller's own words. Do not diagnose." },
        date: DATE,
        time: TIME,
        water_shut_off: { type: "boolean", description: "Whether the water is currently shut off at the property." },
        occupancy: { type: "string", enum: ["owner", "tenant"], description: "Whether the caller owns the property or rents it." },
      },
      ["customer_name", "customer_phone", "address", "description", "date", "time"],
      u,
    ),
    customTool(
      "dispatch_emergency",
      "Log an emergency and alert the business immediately. Use instead of booking when the situation matches the emergency list.",
      {
        customer_name: { type: "string" },
        customer_phone: PHONE,
        address: ADDRESS,
        emergency_type: { type: "string", enum: PLUMBING_EMERGENCIES.map((e) => e.key), description: "Which emergency this is." },
        description: { type: "string", description: "What the caller said is happening." },
        water_shut_off: { type: "boolean", description: "Whether the water is currently shut off at the property." },
      },
      ["customer_name", "customer_phone", "address", "emergency_type"],
      u,
      { execution_message_description: "Say 'Let me get someone on this right now.'" },
    ),
    customTool(
      "take_message",
      "Record a message or escalate to the owner. Use when you cannot book, cannot answer, or the caller wants a quote for something unusual.",
      {
        caller_name: { type: "string" },
        caller_phone: PHONE,
        message: { type: "string", description: "Clear summary of what the caller needs, including the address if they gave one." },
        reason: { type: "string", enum: [...MESSAGE_REASONS], description: "Why the message is being taken." },
        escalate: { type: "boolean", description: "true when the owner must call back urgently; false for a normal message." },
      },
      ["caller_name", "caller_phone", "message", "reason", "escalate"],
      u,
    ),
  ];
  tools.push(END_CALL_TOOL);
  return tools;
}

// ---------- Definition ----------

export const plumbing: VerticalDefinition = {
  slug: "plumbing",
  label: "Plumbing",
  blurb: "Service calls, emergencies and a service area.",
  archetype: "field_service",

  vocabulary: {
    booking: { one: "service call", many: "service calls", One: "Service call", Many: "Service calls" },
    customer: { one: "customer", many: "customers", One: "Customer", Many: "Customers" },
    staff: { one: "plumber", many: "plumbers", One: "Plumber", Many: "Plumbers" },
    business: { one: "business", many: "businesses", One: "Business", Many: "Businesses" },
  },

  onboardingSteps: [STEP.account, STEP.businessBasics, STEP.hours, FIELD_SERVICE_STEP.serviceArea, FIELD_SERVICE_STEP.services, FIELD_SERVICE_STEP.emergencies, STEP.voice, STEP.phone, STEP.payment],

  /**
   * What the agent collects beyond the columns on Job. Kept small on purpose: anything the office
   * actually filters or sorts by belongs in a column, not in JSON.
   */
  intakeSchema: z
    .object({
      water_shut_off: z.boolean().optional(),
      occupancy: z.enum(["owner", "tenant"]).optional(),
    })
    .strip(),

  emergencyTypes: PLUMBING_EMERGENCIES,
  escalationTriggers: PLUMBING_ESCALATIONS,

  dashboardModules: ["home", "notifications", "schedule", "jobs", "customers", "services", "calls", "settings"],
  agentFunctions: ["check_service_area", "get_available_slots", "book_service_call", "dispatch_emergency", "take_message"],

  agentPromptTemplate: buildPlumbingPrompt,
  agentTools: buildPlumbingTools,

  smsTemplates: plumbingSmsTemplates,
  guardrails: PLUMBING_GUARDRAILS,

  defaults: { slotMinutes: 120, intervalMinutes: 120, maxPerDay: 6 },
};
