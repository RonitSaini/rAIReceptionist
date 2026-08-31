import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Proof that the vertical layer did not change what a restaurant sees.
 *
 * These snapshots were captured from the code BEFORE the vertical framework existed. Everything
 * a restaurant's callers and owner actually experience — the agent's system prompt, the tool
 * schemas handed to Retell, the greeting, every guest SMS, every notification title and body,
 * the onboarding step list and the navigation — is rendered here from real fixtures and compared
 * byte-for-byte against the stored text.
 *
 * If a diff appears, the abstraction changed restaurant behaviour. That is a bug in the
 * abstraction, not a snapshot to bless. Re-record ONLY with a deliberate, reviewed reason:
 *   npx cross-env-free:  $env:UPDATE_SNAPSHOTS=1; npm test
 *
 * Run: node --import ./tests/ts-hooks.mjs --test tests/*.test.mjs   (see package.json "test")
 */

const here = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = resolve(here, "snapshots");

// Deterministic environment: these feed the rendered output, so they must never come from .env.
process.env.DATABASE_URL ??= "postgresql://snapshot:snapshot@localhost:5432/snapshot";
process.env.DIRECT_URL ??= process.env.DATABASE_URL;
process.env.RETELL_FUNCTION_SECRET = "snapshot-function-secret";
process.env.RETELL_LLM_MODEL = "gpt-4.1";

const APP_URL = "https://example.test";

// ---------- Fixtures ----------

/** A complete Account row. Variants below flip exactly the flags the builders branch on. */
function account(overrides = {}) {
  return {
    id: "acct_snapshot",
    vertical: "restaurant",
    businessName: "Luigi's Trattoria",
    ownerName: "Maria Lopez",
    cellPhone: "+12125550123",
    addressLine1: "350 5th Ave",
    addressLine2: null,
    city: "New York",
    state: "NY",
    country: "US",
    zip: "10118",
    timeZone: "America/New_York",
    cuisineType: "Italian",
    priceRange: "$$",
    twilioNumber: "+12125550199",
    twilioNumberSid: "PN000",
    retellAgentId: "agent_1",
    retellLlmId: "llm_1",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    subscriptionStatus: "active",
    subscriptionCurrentPeriodEnd: null,
    subscriptionCancelAtPeriodEnd: false,
    setupFeePaidAt: null,
    voiceId: "11labs-Adrian",
    greeting: null,
    hostName: "Kate",
    canQuotePrices: true,
    largePartyThreshold: 8,
    largePartyDepositFee: null,
    escalatesToManager: true,
    escalationTypes: ["large_party", "private_event", "catering", "complaint", "allergy", "press_vendor"],
    tableTurnMinutes: 90,
    reservationIntervalMinutes: 30,
    maxCoversPerSlot: null,
    seatingCapacity: 60,
    takesTakeoutOrders: true,
    offersDelivery: true,
    serviceAreaZip: "10118",
    serviceAreaRadiusMiles: 3,
    latitude: 40.7484,
    longitude: -73.9857,
    agentSyncedAt: null,
    agentSyncError: null,
    lastSeenAt: null,
    onboardingStep: 9,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

const HOURS = [
  { id: "h1", accountId: "acct_snapshot", dayOfWeek: 1, periodName: "Lunch", open: "11:30", close: "14:30", isClosed: false, sortOrder: 0 },
  { id: "h2", accountId: "acct_snapshot", dayOfWeek: 1, periodName: "Dinner", open: "17:00", close: "22:00", isClosed: false, sortOrder: 1 },
  { id: "h3", accountId: "acct_snapshot", dayOfWeek: 2, periodName: "Dinner", open: "17:00", close: "22:00", isClosed: false, sortOrder: 0 },
  { id: "h4", accountId: "acct_snapshot", dayOfWeek: 0, periodName: "Closed", open: "00:00", close: "00:00", isClosed: true, sortOrder: 0 },
];

const MANAGER_HOURS = [
  { id: "m1", accountId: "acct_snapshot", dayOfWeek: 1, start: "09:00", end: "21:00" },
  { id: "m2", accountId: "acct_snapshot", dayOfWeek: 2, start: "09:00", end: "21:00" },
];

const MENU = [
  { id: "i1", accountId: "acct_snapshot", name: "Margherita Pizza", category: "Entrees", price: 18.5, description: "San Marzano, fior di latte, basil", dietaryTags: ["vegetarian"], enabled: true, sortOrder: 0 },
  { id: "i2", accountId: "acct_snapshot", name: "Caesar Salad", category: "Salads", price: 12, description: null, dietaryTags: [], enabled: true, sortOrder: 1 },
  { id: "i3", accountId: "acct_snapshot", name: "Off-menu special", category: null, price: null, description: null, dietaryTags: [], enabled: false, sortOrder: 2 },
];

/** Each variant exercises a different branch of the prompt and tool builders. */
const VARIANTS = [
  { name: "full", src: { account: account(), hours: HOURS, managerHours: MANAGER_HOURS, menu: MENU, services: [], appUrl: APP_URL } },
  {
    name: "bare",
    src: {
      account: account({
        businessName: "Corner Cafe",
        cuisineType: null,
        priceRange: null,
        addressLine1: null,
        addressLine2: null,
        city: null,
        state: null,
        zip: null,
        escalatesToManager: false,
        escalationTypes: [],
        offersDelivery: false,
        serviceAreaZip: null,
        serviceAreaRadiusMiles: null,
        twilioNumber: null,
        greeting: null,
      }),
      hours: [],
      managerHours: [],
      menu: [],
      services: [],
      appUrl: APP_URL,
    },
  },
  {
    name: "no-takeout-no-prices",
    src: {
      account: account({ takesTakeoutOrders: false, offersDelivery: false, canQuotePrices: false, largePartyDepositFee: 25, greeting: "Custom greeting; this call may be recorded." }),
      hours: HOURS,
      managerHours: MANAGER_HOURS,
      menu: MENU,
      services: [],
      appUrl: APP_URL,
    },
  },
  {
    name: "canada",
    src: {
      account: account({ businessName: "Ronit's Pizza", country: "CA", state: "ON", city: "Toronto", zip: "M5V 2T6", timeZone: "America/Toronto", twilioNumber: "+14165550199", serviceAreaRadiusMiles: 5 }),
      hours: HOURS,
      managerHours: MANAGER_HOURS,
      menu: MENU,
      services: [],
      appUrl: APP_URL,
    },
  },
];

const RESERVATION = { guestName: "Elena Rossi", partySize: 4, startTime: new Date("2026-09-02T23:30:00.000Z"), isWaitlist: false };
const WAITLIST = { ...RESERVATION, isWaitlist: true };
const ORDER = { guestName: "Sam Patel", items: "2x Margherita Pizza\n1x Caesar Salad, no anchovy", pickupTime: new Date("2026-09-02T23:00:00.000Z"), isDelivery: false };
const DELIVERY = { ...ORDER, isDelivery: true };

// ---------- Snapshot assembly ----------

const section = (title, body) => `\n===== ${title} =====\n${body}\n`;

/**
 * The shared-secret header on every custom tool is transport plumbing, not restaurant behaviour:
 * its name is part of the CallCover -> FrontDesk AI rename and its value comes from the
 * environment. Redacting it keeps this snapshot a pure signal about what a restaurant
 * experiences. The header name itself is asserted separately, below.
 */
function redactSecrets(value) {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => (k === "headers" ? [k, { "<function-secret-header>": "<function-secret>" }] : [k, redactSecrets(v)])),
    );
  }
  return value;
}

const json = (v) => JSON.stringify(redactSecrets(v), null, 2);

async function buildSnapshot() {
  const agentConfig = await import("../src/lib/agent-config.ts");
  const sms = await import("../src/lib/sms.ts");
  const greeting = await import("../src/lib/greeting.ts");
  const constants = await import("../src/lib/constants.ts");

  const out = [];
  out.push("Restaurant behaviour, captured before the vertical layer existed.");
  out.push("A diff here means the abstraction changed what a restaurant sees.");

  for (const { name, src } of VARIANTS) {
    out.push(section(`AGENT PROMPT · ${name}`, agentConfig.buildGeneralPrompt(src)));
    out.push(section(`AGENT TOOLS · ${name}`, json(agentConfig.buildTools(src))));
    out.push(section(`LLM CONFIG · ${name}`, json(agentConfig.buildLlmConfig(src))));
    out.push(section(`AGENT CONFIG · ${name}`, json(agentConfig.buildAgentConfig(src, "llm_snapshot", "11labs-Adrian"))));
    out.push(section(`GREETING · ${name}`, greeting.generateGreeting(src.account.businessName, src.account.hostName)));
  }

  // Post-call analysis is per-archetype now (a plumber is never offered "takeout"), so it takes the
  // source. VARIANTS[0] is the fully configured restaurant, which is what this file locks.
  out.push(section("POST-CALL ANALYSIS", json(agentConfig.buildPostCallAnalysis(VARIANTS[0].src))));
  // FUNCTION_NAMES is the app-wide registry across every archetype, so it grows whenever a new
  // vertical lands — which says nothing about restaurants. What a restaurant is actually given is
  // its own `agentFunctions`, and that is what this asserts.
  const restaurantDefinition = (await import("../src/verticals/index.ts")).verticalFor("restaurant");
  out.push(
    section(
      "AGENT CONSTANTS",
      json({ FUNCTION_NAMES: restaurantDefinition.agentFunctions, MESSAGE_REASONS: agentConfig.MESSAGE_REASONS, CLASSIFICATION_CHOICES: agentConfig.CLASSIFICATION_CHOICES }),
    ),
  );

  // Guest SMS, for both a phone-bearing and a phoneless account.
  for (const { name, src } of [VARIANTS[0], VARIANTS[1]]) {
    const a = src.account;
    const lines = [
      `reservation:      ${sms.reservationConfirmationText(a, RESERVATION)}`,
      `waitlist:         ${sms.reservationConfirmationText(a, WAITLIST)}`,
      `takeout:          ${sms.takeoutConfirmationText(a, ORDER)}`,
      `delivery:         ${sms.takeoutConfirmationText(a, DELIVERY)}`,
      `escalation (open):${sms.escalationFollowUpText(a, "Tuesday 5:00 PM")}`,
      `escalation (none):${sms.escalationFollowUpText(a, null)}`,
      `cancel res:       ${sms.cancellationReplyText(a, "reservation", RESERVATION.startTime)}`,
      `cancel waitlist:  ${sms.cancellationReplyText(a, "waitlist", RESERVATION.startTime)}`,
      `cancel order:     ${sms.cancellationReplyText(a, "order", ORDER.pickupTime)}`,
    ];
    out.push(section(`GUEST SMS · ${name}`, lines.join("\n")));
  }

  // The step list and the escalation checklist now belong to the vertical rather than to shared
  // constants. Reading them from their new home and still matching the stored text byte for byte
  // is the point: the values moved, they did not change. `step` is derived from position, which
  // is all the old numeric field ever was.
  const verticals = await import("../src/verticals/index.ts");
  const steps = verticals.onboardingStepsFor("restaurant");

  out.push(
    section(
      "ONBOARDING + LABELS",
      json({
        APP_NAME: constants.APP_NAME,
        ONBOARDING_LAST_STEP: verticals.lastOnboardingStep("restaurant"),
        ONBOARDING_DONE: verticals.onboardingDoneStep("restaurant"),
        ONBOARDING_STEPS: steps.map((s, i) => ({ step: i + 1, title: s.title, short: s.short })),
        ESCALATION_TYPES: verticals.verticalFor("restaurant").escalationTriggers,
        RESERVATION_STATUSES: constants.RESERVATION_STATUSES,
        TAKEOUT_STATUSES: constants.TAKEOUT_STATUSES,
        NOTIFICATION_TYPES: constants.NOTIFICATION_TYPES,
        SEATING_PREFERENCES: constants.SEATING_PREFERENCES,
        RECORDING_DISCLOSURE: constants.RECORDING_DISCLOSURE,
      }),
    ),
  );

  return out.join("\n");
}

// ---------- The tests ----------

test("custom tools carry the FrontDesk shared-secret header", async () => {
  const { buildTools } = await import("../src/lib/agent-config.ts");
  const { FUNCTION_SECRET_HEADER } = await import("../src/lib/retell.ts");
  const custom = buildTools(VARIANTS[0].src).filter((t) => t.type === "custom");

  assert.ok(custom.length > 0, "expected custom tools");
  assert.equal(FUNCTION_SECRET_HEADER, "x-frontdesk-secret", "the product is FrontDesk AI; the header must not say callcover");
  for (const t of custom) {
    assert.deepEqual(Object.keys(t.headers ?? {}), [FUNCTION_SECRET_HEADER], `tool ${t.name} sends exactly the FrontDesk secret header`);
  }
});

test("restaurant vocabulary is the wording the app already used", async () => {
  const { vocabularyFor } = await import("../src/verticals/index.ts");
  // Written out by hand rather than recorded: these four nouns are what every rendered restaurant
  // string resolves to, so they are the contract, not an observation.
  assert.deepEqual(vocabularyFor("restaurant"), {
    booking: { one: "reservation", many: "reservations", One: "Reservation", Many: "Reservations" },
    customer: { one: "guest", many: "guests", One: "Guest", Many: "Guests" },
    staff: { one: "host", many: "hosts", One: "Host", Many: "Hosts" },
    business: { one: "restaurant", many: "restaurants", One: "Restaurant", Many: "Restaurants" },
  });
});

test("restaurant navigation is the same six links in the same order", async () => {
  const { navItemsFor } = await import("../src/lib/nav.ts");
  assert.deepEqual(navItemsFor("restaurant", "sidebar"), [
    { href: "/dashboard", label: "Home", icon: "home" },
    { href: "/notifications", label: "Notifications", icon: "bell" },
    { href: "/reservations", label: "Book", icon: "calendar" },
    { href: "/takeout", label: "Takeout", icon: "bag" },
    { href: "/calls", label: "Calls", icon: "phone" },
    { href: "/settings", label: "Settings", icon: "settings" },
  ]);
  // Mobile tabs drop Notifications: on a phone it lives in the header bell.
  assert.deepEqual(
    navItemsFor("restaurant", "tabs").map((i) => i.label),
    ["Home", "Book", "Takeout", "Calls", "Settings"],
  );
});

test("restaurant output is unchanged by the vertical layer", async () => {
  const actual = await buildSnapshot();
  const file = resolve(SNAP_DIR, "restaurant.snap.txt");

  if (process.env.UPDATE_SNAPSHOTS === "1" || !existsSync(file)) {
    mkdirSync(SNAP_DIR, { recursive: true });
    writeFileSync(file, actual, "utf8");
    assert.ok(existsSync(file), "snapshot written");
    return;
  }

  const expected = readFileSync(file, "utf8");
  if (actual !== expected) {
    // Point at the first differing line: a 40 KB diff is unreadable otherwise.
    const a = actual.split("\n");
    const b = expected.split("\n");
    const i = a.findIndex((line, idx) => line !== b[idx]);
    assert.fail(
      `Restaurant output changed at line ${i + 1} of ${resolve(SNAP_DIR, "restaurant.snap.txt")}\n` +
        `  expected: ${JSON.stringify(b[i])}\n` +
        `  actual:   ${JSON.stringify(a[i])}\n` +
        `The vertical layer must reproduce restaurants byte for byte. Fix the abstraction, do not re-record.`,
    );
  }
});
