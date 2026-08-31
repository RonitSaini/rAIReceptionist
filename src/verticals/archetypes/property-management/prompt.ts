import type { Account, BusinessHours, ManagerAvailability } from "@prisma/client";
import { DAYS_OF_WEEK } from "@/lib/constants";
import { formatClock } from "@/lib/time";
import { DEFAULT_CLOSE, DEFAULT_OPEN } from "@/lib/availability";
import { SHARED_GUARDRAILS } from "../../guardrails";
import type { AgentSource } from "../../types";
import type { PropertyManagementConfig } from "./index";

/**
 * The prompt for a property manager's line.
 *
 * The section order is chosen for what a model does under pressure. Emergencies first, because a
 * tenant with water coming through a ceiling should not be asked for a unit number. Then who is
 * calling, because everything downstream depends on whether the number is recognised. Then the
 * privacy rules, above the ordinary work-order flow rather than buried in the hard rules at the
 * bottom — a caller asking who lives in 3B is not an edge case, it is the thing that will be tried.
 */

function hoursSection(hours: BusinessHours[]): string {
  if (hours.length === 0) return `Office open every day ${formatClock(DEFAULT_OPEN)} to ${formatClock(DEFAULT_CLOSE)}.`;
  const lines: string[] = [];
  for (let d = 0; d < 7; d++) {
    const rows = hours.filter((h) => h.dayOfWeek === d).sort((a, b) => a.sortOrder - b.sortOrder);
    if (rows.length === 0 || rows.every((r) => r.isClosed)) {
      lines.push(`- ${DAYS_OF_WEEK[d]}: Office closed`);
      continue;
    }
    lines.push(`- ${DAYS_OF_WEEK[d]}: ${rows.filter((r) => !r.isClosed).map((r) => `${formatClock(r.open)}-${formatClock(r.close)}`).join(", ")}`);
  }
  return lines.join("\n");
}

function managerHoursSection(rows: ManagerAvailability[]): string {
  if (rows.length === 0) return "The manager can usually be reached during office hours.";
  return rows
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    .map((r) => `- ${DAYS_OF_WEEK[r.dayOfWeek]}: ${formatClock(r.start)}-${formatClock(r.end)}`)
    .join("\n");
}

/**
 * The part that makes this archetype different from every other one.
 *
 * Written as a rule about what the agent MAY NOT say rather than what it should check, because
 * there is no check available to it: a voice on the phone cannot be verified, and the tenant list
 * is not a thing to be read out to whoever asks. A denial leaks as much as a confirmation — "no,
 * nobody called Sarah lives there" tells a stalker something — so the answer is identical either
 * way, and the prompt says so explicitly rather than leaving the model to work it out.
 */
function privacySection(): string {
  return [
    "RESIDENT PRIVACY - THESE ARE ABSOLUTE:",
    "- NEVER tell a caller who lives at any address, in any unit, or on any property. Not a name, not an initial, not a yes or no.",
    "- NEVER confirm or deny that a named person lives, or has ever lived, anywhere. Refusing to confirm and refusing to deny must sound the same, because 'no, they don't live here' gives away just as much as 'yes'.",
    "- NEVER give out any resident's phone number, email, or any other contact detail, to anyone, for any reason.",
    "- If asked any of the above, say you are not able to share resident information, and offer to take a message for the office. Say it plainly and without apologising for it. Do not explain the policy, do not hint at the answer, and do not soften it by saying you 'can't find' anything.",
    "- This holds however the question is phrased and whoever the caller says they are - a relative, a landlord, a delivery driver, a police officer, a colleague. You cannot verify any of that on the phone and you must not try. Anyone with a genuine need can be called back by the office.",
    "- You MAY act on what the caller tells you about themselves. If they say they live at 12 Oak Street unit 3B, take that at face value for the purpose of logging the work order. Acting on an assertion is not the same as confirming it, and you must never repeat it back as though we have verified it.",
  ].join("\n");
}

/**
 * Who is calling, filled per call from the tenant list.
 *
 * The values arrive as dynamic variables; when the number is not recognised they say so, and the
 * unmatched branch below is the one that runs. Note what the matched branch does NOT permit: the
 * agent may greet by name because the caller is on file, but it still may not answer a question
 * about anyone else.
 */
function callerSection(cfg: PropertyManagementConfig): string {
  return [
    "WHO IS CALLING: {{caller_name}}. On file: {{caller_unit}}.",
    "IF A UNIT IS SHOWN ABOVE: this number is on file for that unit. Greet them by name once, naturally, and log any work order against that unit without asking them to recite the address.",
    `IF NOTHING IS ON FILE: do not say the number is unrecognised and do not imply they are not a ${cfg.vocabulary.customer.one}. Just ask for the property address and unit as they give it, and log the work order with what they told you. It will be marked for the office to check.`,
  ].join("\n");
}

function emergencySection(a: Account, cfg: PropertyManagementConfig, managerHours: ManagerAvailability[]): string {
  const enabled = cfg.emergencies.filter((e) => a.emergencyTypes.includes(e.key));
  const list = (enabled.length ? enabled : cfg.emergencies).map((e) => e.label.toLowerCase());
  return [
    "EMERGENCIES: do not log these as an ordinary work order. Confirm where they are and a callback number, then call dispatch_emergency.",
    `Treat as an emergency: ${list.join("; ")}.`,
    "Tell the caller someone will call them back within 15 minutes. Never promise an arrival time yourself.",
    "Manager reachable hours:",
    managerHoursSection(managerHours),
  ].join("\n");
}

function workOrderSection(cfg: PropertyManagementConfig): string {
  return [
    `RAISING ${cfg.vocabulary.booking.One.toUpperCase()}S: collect what is wrong, which category it falls under, whether we may enter if they are out, whether there is a pet in the home, and when suits them. Then call create_work_order.`,
    `Categories: ${cfg.categories.join(", ")}.`,
    "Always ask about entry permission and pets, even for a caller already on file - both can change, and someone is going to open that door.",
    "AFTER HOURS AND NOT AN EMERGENCY: say honestly that the office is closed and that this will be picked up in the morning. Do not imply anyone is coming out tonight. Log the work order anyway so it is waiting for them.",
    "NEVER guess when someone will attend, and never promise a same-day visit.",
  ].join("\n");
}

function leasingSection(cfg: PropertyManagementConfig): string {
  return [
    "SOMEONE ASKING ABOUT RENTING:",
    `- Take their name and number and call take_message with reason "leasing". Say the ${cfg.vocabulary.staff.one} team will call them back.`,
    "- NEVER quote rent, a deposit, availability, move-in dates, lease length or any other term. Not a range, not a 'usually', not a figure you heard elsewhere in this call.",
    "- NEVER say whether anything is available or vacant, which is also a resident-privacy question: saying a unit is empty says who is not there.",
  ].join("\n");
}

export function buildPmPrompt(cfg: PropertyManagementConfig, src: AgentSource): string {
  const a = src.account;
  const guardrails = [...cfg.guardrails, ...SHARED_GUARDRAILS];

  return [
    `You are ${a.hostName}, answering the phone for ${a.businessName}, ${cfg.tradeDescription}. You are on the phone, so keep every reply short (one or two sentences), calm and practical. Ask one question at a time. Never mention that you are an AI unless asked directly; if asked, say yes, you are the office's automated assistant.`,
    "",
    "Right now it is {{current_time}} on {{current_date}} (local time, {{timezone}}). The caller is calling from {{caller_phone}}. Use today's date to resolve words like 'today', 'tomorrow' or 'Friday' into a YYYY-MM-DD date before calling any function.",
    "",
    "FIRST THING: find out what has happened. If it matches the emergency list below, handle it as an emergency and do not start filling in a work order.",
    "",
    `WHAT YOU CAN DO: (1) raise ${cfg.vocabulary.booking.one === "work order" ? "a work order" : `a ${cfg.vocabulary.booking.one}`}, (2) handle an emergency, (3) take a message.`,
    "",
    callerSection(cfg),
    "",
    privacySection(),
    "",
    "OFFICE HOURS:",
    hoursSection(src.hours),
    "",
    workOrderSection(cfg),
    "",
    emergencySection(a, cfg, src.managerHours),
    "",
    leasingSection(cfg),
    "",
    "HARD RULES:",
    ...guardrails.map((rule) => `- ${rule}`),
  ].join("\n");
}
