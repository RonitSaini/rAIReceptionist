import type { Account, BusinessHours, ManagerAvailability, ServiceOffering } from "@prisma/client";
import { DAYS_OF_WEEK } from "@/lib/constants";
import { formatClock } from "@/lib/time";
import { formatRestaurantAddress } from "@/lib/geo";
import { formatMoneyMicros } from "@/lib/locale";
import { formatUsPhone } from "@/lib/form";
import { DEFAULT_CLOSE, DEFAULT_OPEN } from "@/lib/availability";
import { SHARED_GUARDRAILS } from "../../guardrails";
import type { AgentSource } from "../../types";
import type { ShopAppointmentConfig } from "./index";

/**
 * The prompt every shop_appointment vertical gets.
 *
 * The structure differs from field_service in one way that matters more than all the cosmetic
 * differences: the emergency section is not about sending anyone out, it is about handing the
 * caller to someone who can help. For a vet that branch depends on the clock, and the closed branch
 * has to come out before any intake questions at all — a dog that cannot breathe is not a form to
 * be filled in first.
 */

const withArticle = (noun: string) => `${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`;

function hoursSection(hours: BusinessHours[]): string {
  if (hours.length === 0) return `Open every day ${formatClock(DEFAULT_OPEN)} to ${formatClock(DEFAULT_CLOSE)}.`;
  const lines: string[] = [];
  for (let d = 0; d < 7; d++) {
    const rows = hours.filter((h) => h.dayOfWeek === d).sort((a, b) => a.sortOrder - b.sortOrder);
    if (rows.length === 0 || rows.every((r) => r.isClosed)) {
      lines.push(`- ${DAYS_OF_WEEK[d]}: Closed`);
      continue;
    }
    lines.push(`- ${DAYS_OF_WEEK[d]}: ${rows.filter((r) => !r.isClosed).map((r) => `${formatClock(r.open)}-${formatClock(r.close)}`).join(", ")}`);
  }
  return lines.join("\n");
}

function managerHoursSection(rows: ManagerAvailability[]): string {
  if (rows.length === 0) return "The owner can usually be reached during opening hours.";
  return rows
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    .map((r) => `- ${DAYS_OF_WEEK[r.dayOfWeek]}: ${formatClock(r.start)}-${formatClock(r.end)}`)
    .join("\n");
}

function servicesSection(services: ServiceOffering[], canQuotePrices: boolean): string {
  const items = services.filter((s) => s.enabled);
  if (items.length === 0) {
    return "No service list has been provided. Describe what the caller needs in their own words and book them in; never invent a service or a price.";
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
      const price = canQuotePrices && s.canQuote && s.priceFromMicros != null ? ` - from ${formatMoneyMicros(s.priceFromMicros)}` : "";
      lines.push(`- ${s.name}${price}`);
    }
  }
  return lines.join("\n");
}

function bookingSection(a: Account, cfg: ShopAppointmentConfig): string {
  const words = cfg.vocabulary;
  return [
    `BOOKING ${withArticle(words.booking.one).toUpperCase()}: Call get_available_slots before offering any time - never guess. Collect what is written under WHAT TO ASK below, their name, and a phone number (offer to use the number they are calling from).`,
    `${words.booking.Many} are ${a.jobSlotMinutes} minutes long. The ${words.customer.one} comes to us, so give the shop address if they ask and do not offer to go to them.`,
    `Read the details and the time back and get a yes before calling book_appointment.`,
    `NO SLOTS LEFT: do not invent a time. Offer another day, and if none work take a message with take_message so the ${words.business.one} can call them back.`,
  ].join("\n");
}

/**
 * The handover.
 *
 * Written so that the number appears in the same sentence as the instruction to use it: a model
 * that has to look two paragraphs up for a phone number will sometimes not bother, and the one
 * situation this section exists for is the one where it must never improvise.
 */
function emergencySection(a: Account, cfg: ShopAppointmentConfig, managerHours: ManagerAvailability[]): string {
  const enabled = cfg.emergencies.filter((e) => a.emergencyTypes.includes(e.key));
  const list = (enabled.length ? enabled : cfg.emergencies).map((e) => e.label.toLowerCase());
  const number = (a[cfg.referral.field] as string | null) ?? null;
  const referralName = cfg.referral.nameField ? ((a[cfg.referral.nameField] as string | null) ?? null) : null;

  const lines = ["URGENT CASES:", `Treat as urgent: ${list.join("; ")}.`];

  if (cfg.emergencyMeansComeInNow) {
    lines.push(
      `IF WE ARE OPEN RIGHT NOW: tell them to bring ${cfg.vocabulary.subject.one === "pet" ? "the animal" : `the ${cfg.vocabulary.subject.one}`} in immediately, do not book a slot, and call take_message with escalate set to true so someone is told at once.`,
      number
        ? `IF WE ARE CLOSED: give them this number FIRST, before any other question - ${formatUsPhone(number)}${referralName ? ` (${referralName})` : ""}. Say it clearly, offer to repeat it, and only afterwards take their details.`
        : `IF WE ARE CLOSED: ${cfg.referral.fallback} Say that FIRST, before any other question.`,
    );
  } else {
    lines.push(
      number
        ? `Give them this number and let them decide - ${formatUsPhone(number)}${referralName ? ` (${referralName})` : ""}. Then take a message with escalate set to true.`
        : `${cfg.referral.fallback} Then take a message with escalate set to true.`,
    );
  }

  lines.push(...(cfg.emergencyExtra ?? []), "Owner reachable hours:", managerHoursSection(managerHours));
  return lines.join("\n");
}

/**
 * Who is calling, when we already know.
 *
 * The variables are filled per call in /api/twilio/voice from the Customer table; when the number
 * is unrecognised they say so, and the instruction below reads correctly either way. Deliberately
 * phrased as "ask", never "assume": a phone is shared, and being told confidently that you are
 * someone else is worse than being asked.
 */
function returningCallerSection(cfg: ShopAppointmentConfig): string {
  return [
    "WHO IS CALLING: {{caller_name}}. On file: {{caller_context}}.",
    `If a name is given above, greet them by it once, naturally. If exactly one ${cfg.vocabulary.subject.one} is on file, ask whether the call is about that one by name before asking anything else about it. Never assume - a number can be shared, and if they say no, take the details fresh.`,
    "If nothing is on file, do not mention it. Just take the details as normal.",
  ].join("\n");
}

export function buildShopPrompt(cfg: ShopAppointmentConfig, src: AgentSource): string {
  const a = src.account;
  const address = formatRestaurantAddress(a);
  const services = (src.services ?? []) as ServiceOffering[];
  const guardrails = [...cfg.guardrails, ...SHARED_GUARDRAILS];
  const words = cfg.vocabulary;

  return [
    `You are ${a.hostName}, answering the phone for ${a.businessName}, ${cfg.tradeDescription}${address ? ` at ${address}` : ""}. You are on the phone, so keep every reply short (one or two sentences), calm and practical. Ask one question at a time. Never mention that you are an AI unless asked directly; if asked, say yes, you are the office's automated assistant.`,
    "",
    "Right now it is {{current_time}} on {{current_date}} (local time, {{timezone}}). The caller is calling from {{caller_phone}}. Use today's date to resolve words like 'today', 'tomorrow' or 'Friday' into a YYYY-MM-DD date before calling any function.",
    "",
    cfg.firstThing ?? "FIRST THING: find out what the call is about, and check it against the urgent list below before offering any appointment.",
    "",
    `WHAT YOU CAN DO: (1) book ${withArticle(words.booking.one)}, (2) handle an urgent case, (3) answer questions using only the information below, (4) take a message.`,
    "",
    returningCallerSection(cfg),
    "",
    "OPENING HOURS:",
    hoursSection(src.hours),
    "",
    "SERVICES:",
    servicesSection(services, a.canQuotePrices),
    "",
    "WHAT TO ASK:",
    ...Object.entries(cfg.intakeProperties).map(([key, prop]) => `- ${key.replace(/_/g, " ")}: ${prop.description ?? ""}`),
    "",
    bookingSection(a, cfg),
    "",
    emergencySection(a, cfg, src.managerHours),
    "",
    "HARD RULES:",
    ...guardrails.map((rule) => `- ${rule}`),
  ].join("\n");
}
