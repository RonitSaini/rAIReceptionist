import type { Account, BusinessHours, ManagerAvailability, ServiceOffering } from "@prisma/client";
import { DAYS_OF_WEEK } from "@/lib/constants";
import { formatClock } from "@/lib/time";
import { formatRestaurantAddress } from "@/lib/geo";
import { accountCountry, formatDistance, formatMoneyMicros, postalLabel } from "@/lib/locale";
import { DEFAULT_CLOSE, DEFAULT_OPEN } from "@/lib/availability";
import { SHARED_GUARDRAILS } from "../../guardrails";
import type { AgentSource } from "../../types";
import type { FieldServiceConfig } from "./index";

/**
 * The prompt every field_service trade gets.
 *
 * Order is the product here, not just the words. The emergency question comes before anything else
 * because a caller with water coming through a ceiling should not be asked which day suits them,
 * and the hard rules come last because that is where a model looks when it is about to improvise.
 */

/**
 * "a service call" but "an estimate". Trivial, and exactly the sort of thing that makes an agent
 * sound like a form letter: the booking noun comes from the vocabulary, so the article has to as
 * well. Every trade whose noun starts with a consonant is unaffected.
 */
const withArticle = (noun: string) => `${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`;

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
  const radius = a.serviceAreaRadiusMiles != null ? formatDistance(Number(a.serviceAreaRadiusMiles), country) : null;
  return [
    `SERVICE AREA: ${radius ? `About ${radius} around the business.` : "Ask the owner's office if unsure."} ALWAYS call check_service_area with the full street address before offering any time or booking anything.`,
    `If the address is outside the area, say politely that you do not cover it, do not book a visit, and offer to take a message. Do not suggest another company.`,
    `Ask for the full street address including the ${postalLabel(country)}.`,
  ].join("\n");
}

function emergencySection(a: Account, managerHours: ManagerAvailability[], cfg: FieldServiceConfig): string {
  const enabled = cfg.emergencies.filter((e) => a.emergencyTypes.includes(e.key));
  const list = (enabled.length ? enabled : cfg.emergencies).map((e) => e.label.toLowerCase());
  return [
    "EMERGENCIES: These are not booked into a normal slot. Confirm the address and a callback number, then call dispatch_emergency.",
    `Treat as an emergency: ${list.join("; ")}.`,
    `Tell the caller ${a.technicianName || `the ${cfg.vocabulary.staff.one}`} will call them back within 15 minutes. Never promise an arrival time yourself.`,
    "Owner reachable hours:",
    managerHoursSection(managerHours),
  ].join("\n");
}

function bookingSection(a: Account, cfg: FieldServiceConfig): string {
  const fee = a.calloutFeeMicros != null ? ` There is a call-out fee of ${formatMoneyMicros(a.calloutFeeMicros)}, which you should mention before booking.` : "";
  return [
    `${cfg.bookingHeading ?? "BOOKING A VISIT"}: Call get_available_slots before offering any time - never guess. Collect: the full street address, what is wrong in their own words, their name, and a phone number (offer to use the number they are calling from).`,
    `${cfg.visitNoun ?? "Visits"} are ${a.jobSlotMinutes} minutes long.${fee}`,
    "Read the address and the time back and get a yes before calling book_service_call.",
    "CORRECTIONS: nothing is final until the call ends. If the caller says any detail is wrong after you have booked - the address, the time, their name or number - call book_service_call again with the full corrected details. It updates the booking you just made rather than creating a second one, and their time slot is still theirs; never tell a caller their own slot has been taken.",
    "NO SLOTS LEFT: if there is nothing free on the days they can do, do not invent a time and do not promise a call-out. Take a message with take_message so the office can call them back.",
  ].join("\n");
}

/**
 * What a dispatch-first caller is actually told.
 *
 * The range is an estimate and the prompt says so twice, because this is the single sentence most
 * likely to be repeated back to a company later: "you said forty minutes". A tow at 2am depends on
 * where the truck already is, and a promise the driver cannot keep is worse than a wide range.
 */
function responseSection(a: Account, cfg: FieldServiceConfig): string {
  const min = a.responseTimeMinMinutes ?? cfg.defaultResponseMinutes?.[0] ?? null;
  const max = a.responseTimeMaxMinutes ?? cfg.defaultResponseMinutes?.[1] ?? null;
  const range = min != null && max != null ? `${min} to ${max} minutes` : null;

  const lines = [
    "GETTING SOMEONE TO THEM: this is the whole call. Find out where they are, what has happened, and get the request logged. Do not try to schedule a day.",
    "Collect: exactly where they are, what has happened, their name, and a phone number (offer to use the number they are calling from). Then call request_immediate_dispatch.",
  ];
  if (range) {
    lines.push(
      `Typical response is ${range}. You may give that as an ESTIMATE and only as a range. Say "usually" or "typically". Never promise a time, never give a single number, and never say anyone is on their way until dispatch has confirmed it.`,
    );
  } else {
    lines.push("Do not quote any arrival time. Say the office will call straight back to confirm how long it will be.");
  }
  lines.push(`Once logged, tell them someone will call to confirm an ETA within ${cfg.ackMinutes ?? 5} minutes.`);
  if (!a.takesScheduledWork) {
    lines.push("This business does not book appointments. If someone asks for a scheduled day, explain that work is taken as it comes in and offer to take a message.");
  }
  return lines.join("\n");
}

export function buildFieldServicePrompt(cfg: FieldServiceConfig, src: AgentSource): string {
  const a = src.account;
  const address = formatRestaurantAddress(a);
  const services = (src.services ?? []) as ServiceOffering[];
  const guardrails = [...cfg.guardrails, ...SHARED_GUARDRAILS];
  return [
    `You are ${a.hostName}, answering the phone for ${a.businessName}, ${cfg.tradeDescription}${address ? ` based at ${address}` : ""}. You are on the phone, so keep every reply short (one or two sentences), calm and practical. Ask one question at a time. Never mention that you are an AI unless asked directly; if asked, say yes, you are the office's automated assistant.`,
    "",
    "Right now it is {{current_time}} on {{current_date}} (local time, {{timezone}}). The caller is calling from {{caller_phone}}. Use today's date to resolve words like 'today', 'tomorrow' or 'Friday' into a YYYY-MM-DD date before calling any function.",
    "",
    cfg.firstThing ?? "FIRST THING: find out whether this is an emergency. Ask what is happening. If it matches the emergency list below, handle it as an emergency and do not try to schedule a normal visit.",
    "",
    cfg.dispatchFirst
      ? `WHAT YOU CAN DO: (1) get someone sent out to them, (2) handle an emergency, (3) answer questions using only the information below, (4) take a message.`
      : `WHAT YOU CAN DO: (1) book ${withArticle(cfg.vocabulary.booking.one)}, (2) handle an emergency, (3) answer questions using only the information below, (4) take a message.`,
    "",
    "WORKING HOURS:",
    hoursSection(src.hours),
    "",
    "SERVICES:",
    servicesSection(services, a.canQuotePrices),
    "",
    serviceAreaSection(a),
    "",
    cfg.dispatchFirst ? responseSection(a, cfg) : bookingSection(a, cfg),
    ...(cfg.dispatchFirst && a.takesScheduledWork ? ["", bookingSection(a, cfg)] : []),
    "",
    emergencySection(a, src.managerHours, cfg),
    "",
    "HARD RULES:",
    ...guardrails.map((rule) => `- ${rule}`),
  ].join("\n");
}
