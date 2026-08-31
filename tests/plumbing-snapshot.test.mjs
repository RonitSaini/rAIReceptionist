import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * What a plumbing account's callers actually get.
 *
 * Unlike the restaurant snapshot, this one is not proving that nothing changed — there was nothing
 * before it. It is a lock on the wording: the emergency instructions, the refusal to diagnose, the
 * price rules and every SMS are the product, and a careless edit to any of them should have to be
 * argued for in review rather than slipping through.
 *
 * Two accounts, chosen to exercise the branches that matter: a fully configured US business, and a
 * bare Canadian one with no services, no call-out fee, no technician and prices switched off.
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
    id: "acct_plumbing",
    vertical: "plumbing",
    businessName: "Ridgeway Plumbing",
    ownerName: "Dave Ridgeway",
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
    retellAgentId: "agent_p",
    retellLlmId: "llm_p",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    subscriptionStatus: "active",
    subscriptionCurrentPeriodEnd: null,
    subscriptionCancelAtPeriodEnd: false,
    setupFeePaidAt: null,
    voiceId: "11labs-Adrian",
    greeting: null,
    hostName: "Sam",
    canQuotePrices: true,
    largePartyThreshold: 8,
    largePartyDepositFee: null,
    escalatesToManager: true,
    escalationTypes: ["quote_request", "complaint"],
    tableTurnMinutes: 90,
    reservationIntervalMinutes: 30,
    maxCoversPerSlot: null,
    seatingCapacity: null,
    takesTakeoutOrders: false,
    offersDelivery: false,
    serviceAreaZip: "07102",
    serviceAreaRadiusMiles: 25,
    technicianName: "Mike",
    emergencyTypes: ["burst_pipe", "no_water", "sewage_backup", "flooding", "gas_smell", "no_hot_water"],
    calloutFeeMicros: 89_000_000n,
    jobSlotMinutes: 120,
    maxJobsPerDay: 6,
    latitude: 40.7357,
    longitude: -74.1724,
    agentSyncedAt: null,
    agentSyncError: null,
    lastSeenAt: null,
    onboardingStep: 10,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

const HOURS = [
  { id: "h1", accountId: "acct_plumbing", dayOfWeek: 1, periodName: "Working", open: "08:00", close: "17:00", isClosed: false, sortOrder: 0 },
  { id: "h2", accountId: "acct_plumbing", dayOfWeek: 2, periodName: "Working", open: "08:00", close: "17:00", isClosed: false, sortOrder: 0 },
  { id: "h3", accountId: "acct_plumbing", dayOfWeek: 6, periodName: "Saturday", open: "09:00", close: "13:00", isClosed: false, sortOrder: 0 },
  { id: "h4", accountId: "acct_plumbing", dayOfWeek: 0, periodName: "Closed", open: "00:00", close: "00:00", isClosed: true, sortOrder: 0 },
];

const MANAGER_HOURS = [
  { id: "m1", accountId: "acct_plumbing", dayOfWeek: 1, start: "07:00", end: "20:00" },
  { id: "m2", accountId: "acct_plumbing", dayOfWeek: 2, start: "07:00", end: "20:00" },
];

const SERVICES = [
  { id: "s1", accountId: "acct_plumbing", name: "Drain unblocking", category: "Drains", enabled: true, priceFromMicros: 99_000_000n, canQuote: true, sortOrder: 0, createdAt: new Date(0), updatedAt: new Date(0) },
  { id: "s2", accountId: "acct_plumbing", name: "Leak detection", category: "Leaks", enabled: true, priceFromMicros: 149_500_000n, canQuote: true, sortOrder: 1, createdAt: new Date(0), updatedAt: new Date(0) },
  { id: "s3", accountId: "acct_plumbing", name: "Boiler repair", category: "Heating", enabled: true, priceFromMicros: 250_000_000n, canQuote: false, sortOrder: 2, createdAt: new Date(0), updatedAt: new Date(0) },
  { id: "s4", accountId: "acct_plumbing", name: "Discontinued service", category: null, enabled: false, priceFromMicros: null, canQuote: true, sortOrder: 3, createdAt: new Date(0), updatedAt: new Date(0) },
];

const VARIANTS = [
  { name: "full", src: { account: account(), hours: HOURS, managerHours: MANAGER_HOURS, menu: [], services: SERVICES, appUrl: APP_URL } },
  {
    name: "bare-canada",
    src: {
      account: account({
        businessName: "Northside Plumbing",
        country: "CA",
        state: "ON",
        city: "Toronto",
        zip: "M5V 2T6",
        serviceAreaZip: "M5V 2T6",
        timeZone: "America/Toronto",
        twilioNumber: null,
        canQuotePrices: false,
        technicianName: null,
        calloutFeeMicros: null,
        emergencyTypes: [],
        escalatesToManager: false,
        escalationTypes: [],
        serviceAreaRadiusMiles: 30,
        maxJobsPerDay: null,
      }),
      hours: [],
      managerHours: [],
      menu: [],
      services: [],
      appUrl: APP_URL,
    },
  },
];

const BOOKED = { kind: "job", customerName: "Elena Rossi", when: new Date("2026-09-02T14:00:00.000Z"), address: "12 Oak Street, Newark, NJ 07102", technician: "Mike", isEmergency: false };
const EMERGENCY = { ...BOOKED, isEmergency: true, when: null };
const UNSCHEDULED = { ...BOOKED, when: null, isEmergency: false, technician: null };

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
  const plumbing = verticalFor("plumbing");

  const out = ["Plumbing: the rendered prompt, the tools the agent is given, and every customer SMS."];

  for (const { name, src } of VARIANTS) {
    out.push(section(`AGENT PROMPT · ${name}`, agentConfig.buildGeneralPrompt(src)));
    out.push(section(`AGENT TOOLS · ${name}`, json(agentConfig.buildTools(src))));

    const a = src.account;
    out.push(
      section(
        `CUSTOMER SMS · ${name}`,
        [
          `booked:            ${plumbing.smsTemplates.bookingConfirmation(a, BOOKED)}`,
          `emergency:         ${plumbing.smsTemplates.bookingConfirmation(a, EMERGENCY)}`,
          `no time yet:       ${plumbing.smsTemplates.bookingConfirmation(a, UNSCHEDULED)}`,
          `escalation (open): ${plumbing.smsTemplates.escalationFollowUp(a, "Monday 8:00 AM")}`,
          `escalation (none): ${plumbing.smsTemplates.escalationFollowUp(a, null)}`,
          `cancel job:        ${plumbing.smsTemplates.cancellationReply(a, "job", BOOKED.when)}`,
          `cancel other:      ${plumbing.smsTemplates.cancellationReply(a, "reservation", BOOKED.when)}`,
        ].join("\n"),
      ),
    );
  }

  out.push(
    section(
      "DEFINITION",
      json({
        slug: plumbing.slug,
        archetype: plumbing.archetype,
        vocabulary: plumbing.vocabulary,
        onboardingSteps: plumbing.onboardingSteps.map((s, i) => ({ step: i + 1, id: s.id, title: s.title, short: s.short })),
        emergencyTypes: plumbing.emergencyTypes,
        escalationTriggers: plumbing.escalationTriggers,
        dashboardModules: plumbing.dashboardModules,
        agentFunctions: plumbing.agentFunctions,
        guardrails: plumbing.guardrails,
        defaults: plumbing.defaults,
      }),
    ),
  );

  return out.join("\n");
}

test("plumbing agent output and SMS are locked", async () => {
  const actual = await buildSnapshot();
  const file = resolve(SNAP_DIR, "plumbing.snap.txt");

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
    assert.fail(`Plumbing output changed at line ${i + 1}\n  expected: ${JSON.stringify(b[i])}\n  actual:   ${JSON.stringify(a[i])}`);
  }
});

test("the plumbing agent is never given a restaurant's tools", async () => {
  const { verticalFor } = await import("../src/verticals/index.ts");
  const { buildTools } = await import("../src/lib/agent-config.ts");
  const names = buildTools(VARIANTS[0].src)
    .filter((t) => t.type === "custom")
    .map((t) => t.name);

  assert.deepEqual(names, ["check_service_area", "get_available_slots", "book_service_call", "dispatch_emergency", "take_message"]);
  for (const restaurantOnly of ["book_reservation", "join_waitlist", "take_takeout_order", "check_delivery_area", "get_available_times"]) {
    assert.ok(!names.includes(restaurantOnly), `${restaurantOnly} must not be offered to a plumber`);
  }
  assert.deepEqual([...verticalFor("plumbing").agentFunctions], names);
});

test("the gas-smell instruction comes before anything else in the prompt", async () => {
  const { buildGeneralPrompt } = await import("../src/lib/agent-config.ts");
  const prompt = buildGeneralPrompt(VARIANTS[0].src);

  // The specific failure this guards against: an edit that keeps the words "gas" and "leave" but
  // loses the ordering, so the agent books a visit and only then mentions evacuating.
  const rule = prompt.split("\n").find((l) => l.includes("smell gas"));
  assert.ok(rule, "prompt must carry a gas-smell rule");
  assert.match(rule, /STOP\./);
  assert.match(rule, /leave the building now/);
  assert.match(rule, /Never book a visit to a gas smell without giving that instruction first\./);
  assert.ok(prompt.includes("NEVER diagnose a problem over the phone"), "prompt must forbid remote diagnosis");
});
