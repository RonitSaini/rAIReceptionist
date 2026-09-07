import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * Billing-paused mode in the prompt (docs/frontdesk-billing-spec.md §2, rule 7).
 *
 * The goldens prove the negative: a prompt for any account that is not paused is byte for byte what
 * it was. This is the positive: a paused account's prompt is that same text plus one appended
 * section, and the section says the three things that matter - book nothing, take name and number,
 * never hang up - without a word about billing for the caller to hear.
 *
 * The fixture is the restaurant golden's "full" variant, so the base prompt here is the very text
 * the snapshot locks.
 */

process.env.DATABASE_URL ??= "postgresql://snapshot:snapshot@localhost:5432/snapshot";
process.env.RETELL_FUNCTION_SECRET = "snapshot-function-secret";
process.env.RETELL_LLM_MODEL = "gpt-4.1";

const { buildGeneralPrompt, buildAgentConfig } = await import("../src/lib/agent-config.ts");

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
    isInternal: false,
    paymentFailedAt: null,
    subscriptionEndedAt: null,
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
    onboardingStepId: "done",
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

const src = (overrides) => ({ account: account(overrides), hours: HOURS, managerHours: MANAGER_HOURS, menu: MENU, services: [], appUrl: "https://example.test" });

function withEnv(vars, fn) {
  const before = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  Object.entries(vars).forEach(([k, v]) => (v === undefined ? delete process.env[k] : (process.env[k] = v)));
  try {
    return fn();
  } finally {
    Object.entries(before).forEach(([k, v]) => (v === undefined ? delete process.env[k] : (process.env[k] = v)));
  }
}

const SECTION_START = "BILLING PAUSED - THIS OVERRIDES EVERYTHING ABOVE ABOUT BOOKING:";

test("a paused account gets the unchanged prompt plus one appended section", () => {
  withEnv({ BILLING_REQUIRED: "true" }, () => {
    const base = buildGeneralPrompt(src({ subscriptionStatus: "active" }));
    const paused = buildGeneralPrompt(src({ subscriptionStatus: "none" }));
    assert.ok(!base.includes(SECTION_START), "an active account must not carry the section");
    assert.ok(paused.startsWith(`${base}\n\n${SECTION_START}`), "the paused prompt is the base prompt, then the section - nothing woven in");
  });
});

test("the section says the three things that matter, and nothing about billing for the caller", () => {
  withEnv({ BILLING_REQUIRED: "true" }, () => {
    const section = buildGeneralPrompt(src({ subscriptionStatus: "cancelled", subscriptionEndedAt: new Date() })).split(SECTION_START)[1];
    assert.match(section, /cannot book, schedule, reserve, order or dispatch anything/);
    assert.match(section, /take the caller's name, phone number and what they need/);
    assert.match(section, /call take_message/);
    assert.match(section, /Never hang up on the caller/);
    assert.match(section, /Do not mention billing, payment, subscriptions or account status to the caller/);
  });
});

test("grace is not paused: the agent keeps booking for ten days after a failed payment", () => {
  withEnv({ BILLING_REQUIRED: "true" }, () => {
    const inGrace = buildGeneralPrompt(src({ subscriptionStatus: "past_due", paymentFailedAt: new Date() }));
    assert.ok(!inGrace.includes(SECTION_START));
  });
});

test("an unpaid account's agent ends every call at three minutes; a paid one keeps twenty", () => {
  // The length half of the demo cap (spec §5) lives on the agent, so it holds whatever the browser
  // does. The golden's fixture is active, which is why the snapshot's AGENT CONFIG is unchanged.
  withEnv({ STRIPE_SECRET_KEY: "sk_test_cap_only_never_sent_anywhere" }, () => {
    assert.equal(buildAgentConfig(src({ subscriptionStatus: "none" }), "llm_x", "11labs-Adrian").max_call_duration_ms, 3 * 60_000);
    assert.equal(buildAgentConfig(src({ subscriptionStatus: "active" }), "llm_x", "11labs-Adrian").max_call_duration_ms, 20 * 60_000);
    assert.equal(buildAgentConfig(src({ subscriptionStatus: "none", isInternal: true }), "llm_x", "11labs-Adrian").max_call_duration_ms, 20 * 60_000);
  });
});

test("internal accounts and unenforced deployments never see the section", () => {
  withEnv({ BILLING_REQUIRED: "true" }, () => assert.ok(!buildGeneralPrompt(src({ subscriptionStatus: "none", isInternal: true })).includes(SECTION_START)));
  withEnv({ BILLING_REQUIRED: undefined }, () => assert.ok(!buildGeneralPrompt(src({ subscriptionStatus: "none" })).includes(SECTION_START)));
});
