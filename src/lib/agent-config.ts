import type { Account, BusinessHours, ManagerAvailability, MenuItem } from "@prisma/client";
import type { AgentRequest, CustomTool, EndCallTool, PostCallAnalysisField, RetellLlmRequest } from "./retell";
import { functionSecret } from "./retell";
import { DAYS_OF_WEEK, ESCALATION_TYPES } from "./constants";
import { formatClock } from "./time";
import { formatUsd } from "./form";
import { generateGreeting } from "./greeting";
import { formatRestaurantAddress } from "./geo";
import { DEFAULT_CLOSE, DEFAULT_OPEN } from "./availability";

/**
 * Builds the Retell LLM + agent configuration for one restaurant from its settings.
 * Everything the AI is allowed to say comes from here — it never invents items, prices or policies.
 */

export type AgentSource = {
  account: Account;
  hours: BusinessHours[];
  managerHours: ManagerAvailability[];
  menu: MenuItem[];
  appUrl: string;
};

export const FUNCTION_NAMES = ["get_available_times", "book_reservation", "join_waitlist", "take_takeout_order", "check_delivery_area", "take_message"] as const;
export type FunctionName = (typeof FUNCTION_NAMES)[number];

export const MESSAGE_REASONS = ["general_question", "large_party", "private_event", "catering", "complaint", "allergy", "press_vendor", "callback_request", "other"] as const;

export const CLASSIFICATION_CHOICES = ["reservation", "takeout", "question", "waitlist", "message", "escalation", "other"] as const;

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
    const periods = rows.filter((r) => !r.isClosed).map((r) => `${r.periodName} ${formatClock(r.open)}–${formatClock(r.close)}`);
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
  const labels = ESCALATION_TYPES.filter((t) => a.escalationTypes.includes(t.key)).map((t) => t.label.toLowerCase());
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
      `DELIVERY: Offered within ${a.deliveryRadiusMiles != null ? Number(a.deliveryRadiusMiles) : "a few"} miles of the restaurant. Before accepting a delivery order, ask for the full street address including city and ZIP code and call check_delivery_area. If the address is outside the area or the check is uncertain, apologize, say delivery isn't available there, and offer pickup instead. Never promise delivery to an address that hasn't passed the check.`,
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

export function buildGeneralPrompt(src: AgentSource): string {
  const a = src.account;
  const address = formatRestaurantAddress(a);
  const priceNote = a.canQuotePrices ? "You may state menu prices exactly as listed." : "Do NOT state prices. If asked, say prices are on the menu at the restaurant and offer to help with anything else.";
  return [
    `You are ${a.hostName}, the friendly phone host for ${a.restaurantName}${a.cuisineType ? `, a ${a.cuisineType} restaurant` : ""}${a.priceRange ? ` (${a.priceRange})` : ""}${address ? ` located at ${address}` : ""}. You are talking on the phone, so keep every reply short (one or two sentences), warm and natural. Ask one question at a time. Never mention that you are an AI unless asked directly; if asked, say yes, you're the restaurant's automated assistant.`,
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
    "- Never invent a menu item, a price, a policy, hours, or anything not written here. If the answer isn't here, say you're not sure and offer to take a message with take_message so the restaurant can call back.",
    "- Phone numbers must be 10-digit US numbers. Read numbers back digit by digit to confirm.",
    "- Dietary questions: you may share the dietary tags and descriptions listed. For allergy questions you cannot answer from the menu, do not guess — take a message with reason \"allergy\".",
    "- If you get confused, the caller is frustrated, or you are going in circles: apologize, collect their name and phone number, promise a call back, and call take_message with reason \"callback_request\".",
    "- NEVER hang up on a caller. Only use end_call after the caller confirms they're done and you've said goodbye.",
    "- Do not read function results verbatim; turn them into natural speech.",
  ].join("\n");
}

// ---------- Tools ----------

function tool(name: FunctionName, description: string, properties: Record<string, unknown>, required: string[], appUrl: string, extra: Partial<CustomTool> = {}): CustomTool {
  return {
    type: "custom",
    name,
    description,
    url: `${appUrl}/api/retell/functions/${name}`,
    method: "POST",
    headers: { "x-callcover-secret": functionSecret() },
    parameters: { type: "object", properties, required },
    speak_during_execution: true,
    speak_after_execution: true,
    execution_message_description: "Say a short natural filler like 'One moment while I check that.'",
    timeout_ms: 15000,
    ...extra,
  };
}

const PHONE = { type: "string", description: "10-digit US phone number, digits only or formatted, e.g. 2125550123. Use the caller's number if they say to use it." };
const DATE = { type: "string", description: "Date in YYYY-MM-DD format, resolved using today's date." };
const TIME = { type: "string", description: "Time in 24-hour HH:MM format, e.g. 18:30 for 6:30 PM." };

export function buildTools(src: AgentSource): (CustomTool | EndCallTool)[] {
  const u = src.appUrl;
  const a = src.account;
  const tools: (CustomTool | EndCallTool)[] = [
    tool(
      "get_available_times",
      "Check reservation availability for a date and party size. Call this before offering any time. Returns whether the preferred time is open and the nearest alternatives.",
      { date: DATE, party_size: { type: "integer", description: "Number of guests." }, preferred_time: { ...TIME, description: `${TIME.description} The time the caller asked for, if any.` } },
      ["date", "party_size"],
      u,
      { execution_message_description: "Say something like 'Let me check the book for you.'" },
    ),
    tool(
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
    tool(
      "join_waitlist",
      "Add the caller to the waitlist for a date and time that is fully booked, after they agree.",
      { guest_name: { type: "string" }, guest_phone: PHONE, party_size: { type: "integer" }, date: DATE, time: TIME, notes: { type: "string", description: "Optional notes." } },
      ["guest_name", "guest_phone", "party_size", "date", "time"],
      u,
    ),
    tool(
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
      tool(
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
          delivery_address: { type: "string", description: "Full street address including city and ZIP, required for delivery." },
        },
        ["guest_name", "guest_phone", "items", "pickup_time"],
        u,
      ),
    );
    if (a.offersDelivery) {
      tools.push(
        tool(
          "check_delivery_area",
          "Check whether a full street address is inside the delivery area. Always call before accepting a delivery order.",
          { address: { type: "string", description: "Full street address including city, state and ZIP code." } },
          ["address"],
          u,
          { execution_message_description: "Say 'Let me check if we deliver there.'" },
        ),
      );
    }
  }

  tools.push({ type: "end_call", name: "end_call", description: "End the call. Only use after the caller confirms they are finished and you have said goodbye." });
  return tools;
}

// ---------- Post-call analysis ----------

export function buildPostCallAnalysis(): PostCallAnalysisField[] {
  return [
    { type: "enum", name: "classification", description: "What the call was mainly about.", choices: [...CLASSIFICATION_CHOICES] },
    { type: "string", name: "caller_name", description: "The caller's name if they gave one." },
    { type: "boolean", name: "caller_frustrated", description: "Whether the caller sounded frustrated or confused at any point." },
    { type: "boolean", name: "needs_callback", description: "Whether the restaurant still owes the caller a call back." },
  ];
}

// ---------- Assembled config ----------

export function buildLlmConfig(src: AgentSource): RetellLlmRequest {
  const a = src.account;
  return {
    model: process.env.RETELL_LLM_MODEL || "gpt-4.1",
    model_temperature: 0.2,
    start_speaker: "agent",
    begin_message: a.greeting || generateGreeting(a.restaurantName, a.hostName),
    general_prompt: buildGeneralPrompt(src),
    general_tools: buildTools(src),
    default_dynamic_variables: {
      restaurant_name: a.restaurantName,
      host_name: a.hostName,
      timezone: a.timeZone,
      current_date: "today",
      current_time: "now",
      caller_phone: "an unknown number",
    },
  };
}

export function buildAgentConfig(src: AgentSource, llmId: string, voiceId: string): AgentRequest {
  const a = src.account;
  return {
    response_engine: { type: "retell-llm", llm_id: llmId },
    agent_name: `CallCover · ${a.restaurantName}`.slice(0, 100),
    voice_id: voiceId,
    language: "en-US",
    webhook_url: `${src.appUrl}/api/retell/webhook`,
    webhook_timeout_ms: 10000,
    post_call_analysis_data: buildPostCallAnalysis(),
    max_call_duration_ms: 20 * 60_000,
    end_call_after_silence_ms: 45_000,
    interruption_sensitivity: 0.8,
    responsiveness: 0.9,
    enable_backchannel: true,
    normalize_for_speech: true,
    begin_message_delay_ms: 300,
  };
}
