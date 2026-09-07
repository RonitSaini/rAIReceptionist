import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * What a property manager's callers get, and — more to the point — what they do not.
 *
 * The assertions below are weighted towards refusals. Everything else in this product fails by
 * booking the wrong thing; this one fails by telling a stranger who lives at an address, and that
 * is not recoverable by an apology in the morning.
 */

const here = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = resolve(here, "snapshots");

process.env.DATABASE_URL ??= "postgresql://snapshot:snapshot@localhost:5432/snapshot";
process.env.DIRECT_URL ??= process.env.DATABASE_URL;
process.env.RETELL_FUNCTION_SECRET = "snapshot-function-secret";
process.env.RETELL_LLM_MODEL = "gpt-4.1";

const APP_URL = "https://example.test";

function account(overrides = {}) {
  return {
    id: "acct_pm",
    vertical: "property_management",
    businessName: "Ridgeway Property",
    ownerName: "Dev Owner",
    cellPhone: "+12125550188",
    addressLine1: "44 Mill Lane",
    addressLine2: null,
    city: "Newark",
    state: "NJ",
    country: "US",
    zip: "07102",
    timeZone: "America/New_York",
    cuisineType: null,
    priceRange: null,
    twilioNumber: "+12125550111",
    twilioNumberSid: "PN001",
    retellAgentId: "agent_pm",
    retellLlmId: "llm_pm",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    subscriptionStatus: "active",
    subscriptionCurrentPeriodEnd: null,
    subscriptionCancelAtPeriodEnd: false,
    setupFeePaidAt: null,
    voiceId: "11labs-Adrian",
    greeting: null,
    hostName: "Sam",
    canQuotePrices: false,
    largePartyThreshold: 8,
    largePartyDepositFee: null,
    escalatesToManager: true,
    escalationTypes: ["complaint", "leasing"],
    tableTurnMinutes: 90,
    reservationIntervalMinutes: 30,
    maxCoversPerSlot: null,
    seatingCapacity: null,
    takesTakeoutOrders: false,
    offersDelivery: false,
    serviceAreaZip: null,
    serviceAreaRadiusMiles: null,
    technicianName: null,
    emergencyTypes: ["no_heat", "flooding", "no_power", "gas_smell", "lockout", "fire_security"],
    calloutFeeMicros: null,
    jobSlotMinutes: 60,
    maxJobsPerDay: null,
    takesScheduledWork: true,
    responseTimeMinMinutes: null,
    responseTimeMaxMinutes: null,
    escalationAckMinutes: null,
    unacknowledgedMessage: null,
    towingPartnerName: null,
    towingPartnerPhone: null,
    emergencyReferralPhone: null,
    latitude: null,
    longitude: null,
    agentSyncedAt: null,
    agentSyncError: null,
    lastSeenAt: null,
    onboardingStepId: "done",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

const HOURS = [
  { id: "h1", accountId: "acct_pm", dayOfWeek: 1, periodName: "Office", open: "09:00", close: "17:00", isClosed: false, sortOrder: 0 },
  { id: "h2", accountId: "acct_pm", dayOfWeek: 2, periodName: "Office", open: "09:00", close: "17:00", isClosed: false, sortOrder: 0 },
  { id: "h3", accountId: "acct_pm", dayOfWeek: 0, periodName: "Closed", open: "00:00", close: "00:00", isClosed: true, sortOrder: 0 },
];

const MANAGER_HOURS = [{ id: "m1", accountId: "acct_pm", dayOfWeek: 1, start: "08:00", end: "20:00" }];

const VARIANTS = [
  { name: "full", src: { account: account(), hours: HOURS, managerHours: MANAGER_HOURS, menu: [], services: [], appUrl: APP_URL } },
  { name: "bare", src: { account: account({ businessName: "Northside Lettings", emergencyTypes: [], escalatesToManager: false, escalationTypes: [] }), hours: [], managerHours: [], menu: [], services: [], appUrl: APP_URL } },
];

const BOOKED = { kind: "job", customerName: "Elena Rossi", when: null, isEmergency: false };
const EMERGENCY = { ...BOOKED, isEmergency: true };

const section = (title, body) => `\n===== ${title} =====\n${body}\n`;

function redactSecrets(value) {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => (k === "headers" ? [k, { "<function-secret-header>": "<function-secret>" }] : [k, redactSecrets(v)])));
  }
  return value;
}
const json = (v) => JSON.stringify(redactSecrets(v), null, 2);

async function buildSnapshot() {
  const { verticalFor } = await import("../src/verticals/index.ts");
  const agentConfig = await import("../src/lib/agent-config.ts");
  const definition = verticalFor("property_management");

  const out = ["Property Management: the rendered prompt, the tools the agent is given, and every customer SMS."];

  for (const { name, src } of VARIANTS) {
    out.push(section(`AGENT PROMPT · ${name}`, agentConfig.buildGeneralPrompt(src)));
    if (name === "full") out.push(section(`AGENT TOOLS · ${name}`, json(agentConfig.buildTools(src))));
  }

  const a = VARIANTS[0].src.account;
  out.push(
    section(
      "CUSTOMER SMS",
      [
        `work order:        ${definition.smsTemplates.bookingConfirmation(a, BOOKED)}`,
        `emergency:         ${definition.smsTemplates.bookingConfirmation(a, EMERGENCY)}`,
        `escalation (open): ${definition.smsTemplates.escalationFollowUp(a, "Monday 9:00 AM")}`,
        `escalation (none): ${definition.smsTemplates.escalationFollowUp(a, null)}`,
        `cancel job:        ${definition.smsTemplates.cancellationReply(a, "job", new Date("2026-09-02T14:00:00.000Z"))}`,
      ].join("\n"),
    ),
  );

  out.push(
    section(
      "DEFINITION",
      json({
        slug: definition.slug,
        archetype: definition.archetype,
        vocabulary: definition.vocabulary,
        onboardingSteps: definition.onboardingSteps.map((s, i) => ({ step: i + 1, id: s.id, title: s.title, short: s.short })),
        emergencyTypes: definition.emergencyTypes,
        escalationTriggers: definition.escalationTriggers,
        categories: definition.categories,
        dashboardModules: definition.dashboardModules,
        agentFunctions: definition.agentFunctions,
        guardrails: definition.guardrails,
        bookingKind: definition.bookingKind,
        defaults: definition.defaults,
      }),
    ),
  );

  return out.join("\n");
}

test("property management agent output and SMS are locked", async () => {
  const actual = await buildSnapshot();
  const file = resolve(SNAP_DIR, "property_management.snap.txt");

  if (process.env.UPDATE_SNAPSHOTS === "1" || !existsSync(file)) {
    mkdirSync(SNAP_DIR, { recursive: true });
    writeFileSync(file, actual, "utf8");
    assert.ok(existsSync(file), "snapshot written");
    return;
  }

  const expected = readFileSync(file, "utf8");
  if (actual !== expected) {
    const a = actual.split("\n");
    const b = expected.split("\n");
    const i = a.findIndex((line, idx) => line !== b[idx]);
    assert.fail(`property management output changed at line ${i + 1}\n  expected: ${JSON.stringify(b[i])}\n  actual:   ${JSON.stringify(a[i])}`);
  }
});

test("four tools, and lookup_tenant cannot be pointed at anyone else", async () => {
  const { buildTools } = await import("../src/lib/agent-config.ts");
  const tools = buildTools(VARIANTS[0].src).filter((t) => t.type === "custom");
  assert.deepEqual(tools.map((t) => t.name), ["lookup_tenant", "create_work_order", "dispatch_emergency", "take_message"]);

  // The tool takes a phone so the model has something to fill in, but its description has to say
  // plainly that it only ever returns the caller's own tenancy — and the handler ignores the
  // argument entirely, which is asserted separately below.
  const lookup = tools.find((t) => t.name === "lookup_tenant");
  assert.match(lookup.description, /only ever returns the caller's own tenancy/i);
  assert.match(lookup.description, /cannot look up anyone else/i);
});

test("the privacy rules are in the prompt, above the ordinary flow", async () => {
  const { buildGeneralPrompt } = await import("../src/lib/agent-config.ts");
  const prompt = buildGeneralPrompt(VARIANTS[0].src);

  const privacyAt = prompt.indexOf("RESIDENT PRIVACY");
  const workOrderAt = prompt.indexOf("RAISING WORK ORDERS");
  const hardRulesAt = prompt.indexOf("HARD RULES:");
  assert.ok(privacyAt > 0, "privacy section must exist");
  assert.ok(privacyAt < workOrderAt, "privacy must come before the work-order flow");
  assert.ok(privacyAt < hardRulesAt, "privacy must not be buried in the hard rules");

  // A denial leaks as much as a confirmation. If this line ever goes, the whole section is decorative.
  assert.match(prompt, /refusing to confirm and refusing to deny must sound the same/i);
  assert.match(prompt, /NEVER tell a caller who lives at any address/i);
  assert.match(prompt, /NEVER give out any resident's phone number/i);
  assert.match(prompt, /a relative, a landlord, a delivery driver, a police officer/i);
  assert.match(prompt, /You MAY act on what the caller tells you about themselves/i);
});

test("leasing gives away no numbers, and no vacancies", async () => {
  const { buildGeneralPrompt } = await import("../src/lib/agent-config.ts");
  const prompt = buildGeneralPrompt(VARIANTS[0].src);
  assert.match(prompt, /NEVER quote rent, a deposit, availability, move-in dates/i);
  // Saying a unit is empty says who is not there — the same disclosure from the other direction.
  assert.match(prompt, /saying a unit is empty says who is not there/i);
});

test("gas and fire come before anything else is taken", async () => {
  const { buildGeneralPrompt } = await import("../src/lib/agent-config.ts");
  const prompt = buildGeneralPrompt(VARIANTS[0].src);
  const gas = prompt.split("\n").find((l) => l.includes("smell gas"));
  assert.ok(gas, "gas rule must exist");
  assert.match(gas, /leave the building now/);
  assert.match(gas, /gas emergency line or 911/);
  const fire = prompt.split("\n").find((l) => l.includes("reports a fire"));
  assert.ok(fire, "fire rule must exist");
  assert.match(fire, /call 911 immediately/);
  assert.match(fire, /Do not take details first/);
});

test("lookup_tenant ignores the phone number it is handed", async () => {
  // The one that would actually matter in production: a model that decides to look up the number
  // the caller recited instead of the one they rang from must get nothing back.
  const src = readFileSync(resolve(here, "../src/lib/pm-handlers.ts"), "utf8");
  const handler = src
    .slice(src.indexOf("export async function lookupTenantHandler"), src.indexOf("async function resolveLocation"))
    // Comments stripped first: the handler explains in prose that it ignores args.phone, and a
    // scan for the string would otherwise be tripped by the sentence saying so.
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/args\.phone/.test(handler), "lookupTenantHandler must never read args.phone");
  assert.match(handler, /ctx\.callerPhone/, "it must use the number the call arrived from");
});
