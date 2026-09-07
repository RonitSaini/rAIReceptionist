import { z } from "zod";
import type { Account, BusinessHours, ManagerAvailability, MenuItem } from "@prisma/client";
import type { CustomTool, EndCallTool } from "@/lib/retell";
import { DAYS_OF_WEEK } from "@/lib/constants";
import { formatClock, formatHourRange } from "@/lib/time";
import { formatUsd } from "@/lib/form";
import { formatRestaurantAddress } from "@/lib/geo";
import { accountCountry, formatDistance, postalLabel, unitWord } from "@/lib/locale";
import { DEFAULT_CLOSE, DEFAULT_OPEN } from "@/lib/availability";
import { MESSAGE_REASONS, type AgentSource, type ClassifiedReason, type VerticalDefinition } from "./types";
import { DATE, END_CALL_TOOL, PHONE, TIME, customTool } from "./tools";
import { RESTAURANT_STEP, STEP } from "./steps";
import { SHARED_GUARDRAILS } from "./guardrails";
import { restaurantSmsTemplates } from "./restaurant.sms";

/**
 * Restaurant — the original vertical, and the one that proves the layer.
 *
 * Everything here was lifted verbatim out of src/lib/agent-config.ts and src/lib/sms.ts. Not one
 * character of caller-facing text was reworded in the move: tests/vertical-snapshot.test.mjs
 * compares the rendered prompt, tools, greeting and SMS against output captured before this file
 * existed, and a single differing byte fails it. If a future change to the framework cannot keep
 * that green, the framework is wrong.
 */

// ---------- Escalation ----------

/**
 * What a restaurant hands to a human. Owned here rather than in src/lib/constants.ts because
 * these are a property of the profession: a plumber escalates a gas smell, not a private event.
 * The onboarding checklist and the agent prompt both read this one list.
 */
export const RESTAURANT_ESCALATION_TRIGGERS: readonly ClassifiedReason[] = [
  { key: "large_party", label: "Party over the large-party threshold" },
  { key: "private_event", label: "Private event or buyout" },
  { key: "catering", label: "Catering request" },
  { key: "complaint", label: "Guest complaint" },
  { key: "allergy", label: "Allergy question that staff must answer" },
  { key: "press_vendor", label: "Press or vendor" },
];

// ---------- Prompt sections ----------

function hoursSection(hours: BusinessHours[]): string {
  if (hours.length === 0) return `Open every day ${formatClock(DEFAULT_OPEN)} to ${formatClock(DEFAULT_CLOSE)}.`;
  const lines: string[] = [];
  for (let d = 0; d < 7; d++) {
    const rows = hours.filter((h) => h.dayOfWeek === d).sort((a, b) => a.sortOrder - b.sortOrder);
    if (rows.length === 0 || rows.every((r) => r.isClosed)) {
      lines.push(`- ${DAYS_OF_WEEK[d]}: Closed`);
      continue;
    }
    const periods = rows.filter((r) => !r.isClosed).map((r) => `${r.periodName} ${formatHourRange(r.open, r.close)}`);
    lines.push(`- ${DAYS_OF_WEEK[d]}: ${periods.join(", ")}`);
  }
  return lines.join("\n");
}

function managerHoursSection(rows: ManagerAvailability[]): string {
  if (rows.length === 0) return "A manager can usually be reached during business hours.";
  return rows
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    .map((r) => `- ${DAYS_OF_WEEK[r.dayOfWeek]}: ${formatClock(r.start)}–${formatClock(r.end)}`)
    .join("\n");
}

function menuSection(menu: MenuItem[], canQuotePrices: boolean): string {
  const items = menu.filter((m) => m.enabled);
  if (items.length === 0) return "No menu has been provided. If asked about specific dishes or prices, say you don't have the menu in front of you and offer to take a message.";
  const byCat = new Map<string, MenuItem[]>();
  for (const m of items) {
    const cat = m.category?.trim() || "Menu";
    byCat.set(cat, [...(byCat.get(cat) ?? []), m]);
  }
  const lines: string[] = [];
  for (const [cat, rows] of byCat) {
    lines.push(`${cat}:`);
    for (const m of rows) {
      const price = canQuotePrices && m.price != null ? ` — ${formatUsd(m.price)}` : "";
      const tags = m.dietaryTags.length ? ` [${m.dietaryTags.join(", ")}]` : "";
      const desc = m.description ? `: ${m.description}` : "";
      lines.push(`- ${m.name}${price}${tags}${desc}`);
    }
  }
  return lines.join("\n");
}

function escalationSection(a: Account, managerHours: ManagerAvailability[]): string {
  const labels = RESTAURANT_ESCALATION_TRIGGERS.filter((t) => a.escalationTypes.includes(t.key)).map((t) => t.label.toLowerCase());
  const thresholdRule = `- A party larger than ${a.largePartyThreshold} people: NEVER book it yourself. Take their name, phone, date, time and party size, then call take_message with reason "large_party".`;
  if (!a.escalatesToManager) {
    return [
      "MANAGER ESCALATION: The restaurant has not enabled live manager escalation. For anything you cannot handle (private events, catering, complaints, allergy questions you can't answer from the menu, press or vendors, large parties), take a detailed message with take_message (escalate = false) and say someone from the restaurant will call them back.",
      thresholdRule,
    ].join("\n");
  }
  return [
    "MANAGER ESCALATION: Do not try to resolve these on the call. Collect the caller's name, phone number and the details, then call take_message with escalate = true and the matching reason. Tell the caller a manager will call them back within 15 minutes if it's during manager hours, otherwise when the restaurant next opens.",
    labels.length ? `Escalate for: ${labels.join("; ")}.` : "Escalate for: anything a manager must personally handle.",
    thresholdRule,
    "Manager reachable hours:",
    managerHoursSection(managerHours),
  ].join("\n");
}

function takeoutSection(a: Account): string {
  if (!a.takesTakeoutOrders) return "TAKEOUT: This restaurant does not take orders by phone. If asked, politely say so and offer to answer questions or take a message.";
  const lines = [
    "TAKEOUT ORDERS: Take pickup orders. Only accept items that are on the menu above; if they ask for something not listed, say you don't have that and suggest what's listed. Collect: each item with quantity and any modifications, the caller's name, a phone number, and the pickup time. Read the full order back and confirm before calling take_takeout_order.",
  ];
  if (a.offersDelivery) {
    lines.push(
      `DELIVERY: Offered within ${a.serviceAreaRadiusMiles != null ? formatDistance(Number(a.serviceAreaRadiusMiles), accountCountry(a)) : `a few ${unitWord(accountCountry(a))}`} of the restaurant. Before accepting a delivery order, ask for the full street address including city and ${postalLabel(accountCountry(a))} and call check_delivery_area. If the address is outside the area or the check is uncertain, apologize, say delivery isn't available there, and offer pickup instead. Never promise delivery to an address that hasn't passed the check.`,
    );
  } else {
    lines.push("DELIVERY: Not offered. If asked, politely say you don't deliver and offer pickup instead.");
  }
  return lines.join("\n");
}

function reservationSection(a: Account): string {
  const deposit = a.largePartyDepositFee != null ? ` Parties over ${a.largePartyThreshold} require a deposit of ${formatUsd(a.largePartyDepositFee)} per person, which the manager will arrange.` : "";
  return [
    "RESERVATIONS: Always call get_available_times before offering a time — never guess availability. Collect: date, time, party size, the guest's name, and a phone number (offer to use the number they're calling from). Ask about seating preference or special requests only if they bring it up or after the essentials. Repeat the details back and get a yes before calling book_reservation.",
    `Tables are held for about ${a.tableTurnMinutes} minutes. Times are offered every ${a.reservationIntervalMinutes} minutes.${deposit}`,
    "FULLY BOOKED: If the requested time isn't available, offer the nearest available times before and after it (get_available_times returns them). If none work, offer to add them to the waitlist with join_waitlist. If they decline the waitlist, offer to take a message with take_message so the restaurant can call them if something opens up.",
  ].join("\n");
}

/** This profession's own hard instructions. Shared ones are appended in the definition below. */
const RESTAURANT_OWN_GUARDRAILS: readonly string[] = [
  "Never invent a menu item, a price, a policy, hours, or anything not written here. If the answer isn't here, say you're not sure and offer to take a message with take_message so the restaurant can call back.",
  "Phone numbers must be 10-digit US or Canadian numbers. Read numbers back digit by digit to confirm.",
  'Dietary questions: you may share the dietary tags and descriptions listed. For allergy questions you cannot answer from the menu, do not guess — take a message with reason "allergy".',
  'If you get confused, the caller is frustrated, or you are going in circles: apologize, collect their name and phone number, promise a call back, and call take_message with reason "callback_request".',
  "NEVER hang up on a caller. Only use end_call after the caller confirms they're done and you've said goodbye.",
  "Do not read function results verbatim; turn them into natural speech.",
];

/** What the prompt renders: this profession's rules, then the ones every vertical inherits. */
const RESTAURANT_GUARDRAILS: readonly string[] = [...RESTAURANT_OWN_GUARDRAILS, ...SHARED_GUARDRAILS];

function buildRestaurantPrompt(src: AgentSource): string {
  const a = src.account;
  const address = formatRestaurantAddress(a);
  const priceNote = a.canQuotePrices ? "You may state menu prices exactly as listed." : "Do NOT state prices. If asked, say prices are on the menu at the restaurant and offer to help with anything else.";
  return [
    `You are ${a.hostName}, the friendly phone host for ${a.businessName}${a.cuisineType ? `, a ${a.cuisineType} restaurant` : ""}${a.priceRange ? ` (${a.priceRange})` : ""}${address ? ` located at ${address}` : ""}. You are talking on the phone, so keep every reply short (one or two sentences), warm and natural. Ask one question at a time. Never mention that you are an AI unless asked directly; if asked, say yes, you're the restaurant's automated assistant.`,
    "",
    "Right now it is {{current_time}} on {{current_date}} (restaurant local time, {{timezone}}). The caller is calling from {{caller_phone}}. Use today's date to resolve words like 'tonight', 'tomorrow' or 'this Friday' into a YYYY-MM-DD date before calling any function.",
    "",
    "WHAT YOU CAN DO: (1) book reservations, (2) take takeout orders, (3) answer questions using only the information below, (4) take a message or escalate to a manager. Early in the call, figure out which of these the caller needs.",
    "",
    "HOURS:",
    hoursSection(src.hours),
    "",
    "MENU:",
    menuSection(src.menu, a.canQuotePrices),
    priceNote,
    "",
    reservationSection(a),
    "",
    takeoutSection(a),
    "",
    escalationSection(a, src.managerHours),
    "",
    "HARD RULES:",
    ...RESTAURANT_GUARDRAILS.map((rule) => `- ${rule}`),
  ].join("\n");
}

// ---------- Tools ----------

function buildRestaurantTools(src: AgentSource): (CustomTool | EndCallTool)[] {
  const u = src.appUrl;
  const a = src.account;
  const tools: (CustomTool | EndCallTool)[] = [
    customTool(
      "get_available_times",
      "Check reservation availability for a date and party size. Call this before offering any time. Returns whether the preferred time is open and the nearest alternatives.",
      { date: DATE, party_size: { type: "integer", description: "Number of guests." }, preferred_time: { ...TIME, description: `${TIME.description} The time the caller asked for, if any.` } },
      ["date", "party_size"],
      u,
      { execution_message_description: "Say something like 'Let me check the book for you.'" },
    ),
    customTool(
      "book_reservation",
      "Book a reservation after the caller has confirmed all details. Only call with a time that get_available_times reported as available.",
      {
        guest_name: { type: "string", description: "Guest's name for the reservation." },
        guest_phone: PHONE,
        party_size: { type: "integer", description: "Number of guests." },
        date: DATE,
        time: TIME,
        seating_preference: { type: "string", description: "Optional seating preference, e.g. patio, booth, window, high chair." },
        special_requests: { type: "string", description: "Optional notes: birthday, allergy, accessibility, etc." },
      },
      ["guest_name", "guest_phone", "party_size", "date", "time"],
      u,
    ),
    customTool(
      "join_waitlist",
      "Add the caller to the waitlist for a date and time that is fully booked, after they agree.",
      { guest_name: { type: "string" }, guest_phone: PHONE, party_size: { type: "integer" }, date: DATE, time: TIME, notes: { type: "string", description: "Optional notes." } },
      ["guest_name", "guest_phone", "party_size", "date", "time"],
      u,
    ),
    customTool(
      "take_message",
      "Record a message or escalate to a manager. Use for anything you can't handle, callback requests, complaints, large parties, private events, catering, allergy questions, press or vendors.",
      {
        caller_name: { type: "string" },
        caller_phone: PHONE,
        message: { type: "string", description: "Clear summary of what the caller needs, including any dates, party sizes or details they gave." },
        reason: { type: "string", enum: [...MESSAGE_REASONS], description: "Why the message is being taken." },
        escalate: { type: "boolean", description: "true when a manager must call back urgently per the escalation rules; false for a normal message." },
      },
      ["caller_name", "caller_phone", "message", "reason", "escalate"],
      u,
    ),
  ];

  if (a.takesTakeoutOrders) {
    tools.push(
      customTool(
        "take_takeout_order",
        "Place a takeout (pickup) or delivery order after the caller confirms the full order. For delivery, check_delivery_area must have approved the address first.",
        {
          guest_name: { type: "string" },
          guest_phone: PHONE,
          items: { type: "string", description: "The complete order as dictated, one item per line with quantities and modifications." },
          pickup_date: { ...DATE, description: "Pickup/delivery date, YYYY-MM-DD. Defaults to today." },
          pickup_time: { ...TIME, description: "Requested pickup or delivery time, HH:MM 24-hour." },
          notes: { type: "string", description: "Optional notes." },
          is_delivery: { type: "boolean", description: "true for delivery, false for pickup." },
          delivery_address: { type: "string", description: "Full street address including city and ZIP or postal code, required for delivery." },
        },
        ["guest_name", "guest_phone", "items", "pickup_time"],
        u,
      ),
    );
    if (a.offersDelivery) {
      tools.push(
        customTool(
          "check_delivery_area",
          "Check whether a full street address is inside the delivery area. Always call before accepting a delivery order.",
          { address: { type: "string", description: "Full street address including city, state or province, and ZIP or postal code." } },
          ["address"],
          u,
          { execution_message_description: "Say 'Let me check if we deliver there.'" },
        ),
      );
    }
  }

  tools.push(END_CALL_TOOL);
  return tools;
}

// ---------- Definition ----------

export const restaurant: VerticalDefinition = {
  slug: "restaurant",
  label: "Restaurant",
  blurb: "Reservations, takeout orders and questions, answered on the phone.",
  archetype: "restaurant",

  vocabulary: {
    booking: { one: "reservation", many: "reservations", One: "Reservation", Many: "Reservations" },
    customer: { one: "guest", many: "guests", One: "Guest", Many: "Guests" },
    staff: { one: "host", many: "hosts", One: "Host", Many: "Hosts" },
    business: { one: "restaurant", many: "restaurants", One: "Restaurant", Many: "Restaurants" },
  },

  onboardingSteps: [STEP.account, STEP.businessBasics, STEP.hours, RESTAURANT_STEP.menuPolicies, RESTAURANT_STEP.reservations, STEP.voice, STEP.payment, STEP.phone],

  /**
   * Restaurants predate the `details` JSON column: a reservation's fields are real, indexed
   * columns on the Reservation table. There is nothing extra for the agent to collect, so this
   * is deliberately empty rather than a second, drifting copy of the table's shape.
   */
  intakeSchema: z.object({}).strict(),

  /** A restaurant has no life-safety emergencies; a slow night is not a burst pipe. */
  emergencyTypes: [],
  escalationTriggers: RESTAURANT_ESCALATION_TRIGGERS,

  dashboardModules: ["home", "notifications", "book", "takeout", "calls", "settings"],
  agentFunctions: ["get_available_times", "book_reservation", "join_waitlist", "take_takeout_order", "check_delivery_area", "take_message"],

  agentPromptTemplate: buildRestaurantPrompt,
  agentTools: buildRestaurantTools,

  smsTemplates: restaurantSmsTemplates,
  guardrails: RESTAURANT_GUARDRAILS,

  defaults: { slotMinutes: 90, intervalMinutes: 30 },
};
