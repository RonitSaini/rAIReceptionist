import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * What every field_service trade's callers actually get.
 *
 * One golden per vertical, all built by the same code, because that is the claim being tested: four
 * trades come out of one archetype and differ only where they are meant to. Plumbing's golden was
 * recorded before the archetype was extracted, so its continued byte-for-byte match is the proof
 * that the extraction changed nothing — if it moves, the abstraction is wrong, not the snapshot.
 *
 * Two accounts per vertical, chosen to exercise the branches that matter: a fully configured US
 * business, and a bare Canadian one with no services, no call-out fee, no technician and prices
 * switched off.
 */

const here = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = resolve(here, "snapshots");

process.env.DATABASE_URL ??= "postgresql://snapshot:snapshot@localhost:5432/snapshot";
process.env.DIRECT_URL ??= process.env.DATABASE_URL;
process.env.RETELL_FUNCTION_SECRET = "snapshot-function-secret";
process.env.RETELL_LLM_MODEL = "gpt-4.1";

const APP_URL = "https://example.test";

/**
 * Per-vertical fixture. Everything not named here is identical across the four on purpose: the same
 * hours, the same address, the same manager availability, so a diff between two goldens is a
 * difference between two trades and never a difference between two fixtures.
 */
const VERTICALS = [
  {
    slug: "plumbing",
    title: "Plumbing",
    usName: "Ridgeway Plumbing",
    caName: "Northside Plumbing",
    technician: "Mike",
    emergencyTypes: ["burst_pipe", "no_water", "sewage_backup", "flooding", "gas_smell", "no_hot_water"],
    services: [
      ["Drain unblocking", "Drains", 99_000_000n, true],
      ["Leak detection", "Leaks", 149_500_000n, true],
      ["Boiler repair", "Heating", 250_000_000n, false],
      ["Discontinued service", null, null, true],
    ],
    slotMinutes: 120,
    // The rule that must survive any edit, and the words it must survive with.
    safety: { line: "smell gas", must: [/STOP\./, /leave the building now/, /Never book a visit to a gas smell without giving that instruction first\./] },
    alsoInPrompt: ["NEVER diagnose a problem over the phone"],
  },
  {
    slug: "hvac",
    title: "HVAC",
    usName: "Ridgeway Heating & Cooling",
    caName: "Northside Climate",
    technician: "Dana",
    emergencyTypes: ["co_alarm", "gas_smell", "no_heat", "no_cooling", "burning_smell", "water_leak"],
    services: [
      ["Furnace service", "Heating", 129_000_000n, true],
      ["AC tune-up", "Cooling", 119_000_000n, true],
      ["Heat pump repair", "Heating", 300_000_000n, false],
      ["Discontinued service", null, null, true],
    ],
    slotMinutes: 120,
    safety: { line: "carbon monoxide alarm is going off", must: [/STOP\./, /get everyone out of the building now/, /call 911 from outside/] },
    alsoInPrompt: ["NEVER diagnose a fault over the phone", "never tell them to restart a furnace or boiler"],
  },
  {
    slug: "electrical",
    title: "Electrical",
    usName: "Ridgeway Electrical",
    caName: "Northside Electric",
    technician: "Ray",
    emergencyTypes: ["burning_smell", "smoke", "sparking", "exposed_wiring", "power_out", "water_contact"],
    services: [
      ["Fault finding", "Repairs", 139_000_000n, true],
      ["Outlet replacement", "Repairs", 89_000_000n, true],
      ["Panel upgrade", "Upgrades", 900_000_000n, false],
      ["Discontinued service", null, null, true],
    ],
    slotMinutes: 120,
    safety: { line: "burning smell or smoke", must: [/STOP\./, /get everyone out of the building now/, /call 911 from outside/] },
    alsoInPrompt: ["NEVER tell a caller to open, inspect, reset or touch a breaker panel", "This rule has no exceptions."],
  },
  {
    slug: "roofing",
    title: "Roofing",
    usName: "Ridgeway Roofing",
    caName: "Northside Roofing",
    technician: "Sal",
    emergencyTypes: ["active_leak", "storm_damage", "collapse_risk", "fallen_debris", "exposed_roof"],
    services: [
      ["Leak repair", "Repairs", 249_000_000n, true],
      ["Gutter clearing", "Maintenance", 129_000_000n, true],
      ["Full roof replacement", "Replacement", 900_000_000n, false],
      ["Discontinued service", null, null, true],
    ],
    slotMinutes: 180,
    safety: { line: "onto the roof", must: [/NEVER tell a caller to go onto the roof/, /up a ladder/] },
    alsoInPrompt: ["NEVER diagnose a roof over the phone", "Never promise that someone will come out during a storm"],
  },
  {
    slug: "locksmith",
    title: "Locksmith",
    usName: "Ridgeway Locks",
    caName: "Northside Locks",
    technician: "Nita",
    emergencyTypes: ["child_inside", "pet_inside", "unsafe_location", "break_in"],
    services: [
      ["Lockout entry", "Lockouts", 89_000_000n, true],
      ["Lock change", "Locks", 149_000_000n, true],
      ["Safe opening", "Specialist", null, false],
      ["Discontinued service", null, null, true],
    ],
    slotMinutes: 60,
    dispatchFirst: true,
    safety: { line: "government-issued photo ID", must: [/proof that they live at or own the property/, /before any lock is opened or changed/] },
    alsoInPrompt: ["You do NOT verify identity", "Never explain how to pick, force, bypass, shim", "GETTING SOMEONE TO THEM"],
  },
  {
    slug: "towing",
    title: "Towing",
    usName: "Ridgeway Towing",
    caName: "Northside Towing",
    technician: "Vic",
    emergencyTypes: ["accident", "blocking_traffic", "child_in_vehicle", "dangerous_position"],
    services: [
      ["Local tow", "Towing", 95_000_000n, true],
      ["Winch-out", "Recovery", 150_000_000n, true],
      ["Long-distance tow", "Towing", null, false],
      ["Discontinued service", null, null, true],
    ],
    slotMinutes: 60,
    dispatchFirst: true,
    // The opening instruction, not the hard rule: this is the first thing the model reads.
    safety: { line: "FIRST THING, BEFORE ANY OTHER QUESTION", must: [/somewhere safe and off the road/, /hang up and call 911 now/, /Do not ask for a name, a vehicle or a location until you have done this/] },
    alsoInPrompt: ["FIRST, BEFORE ANYTHING ELSE", "hang up and call 911 immediately", "Never promise an arrival time", "GETTING SOMEONE TO THEM"],
  },
];

function account(v, overrides = {}) {
  return {
    id: `acct_${v.slug}`,
    vertical: v.slug,
    businessName: v.usName,
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
    technicianName: v.technician,
    emergencyTypes: v.emergencyTypes,
    calloutFeeMicros: 89_000_000n,
    jobSlotMinutes: v.slotMinutes,
    maxJobsPerDay: 6,
    takesScheduledWork: !v.dispatchFirst,
    responseTimeMinMinutes: v.dispatchFirst ? 30 : null,
    responseTimeMaxMinutes: v.dispatchFirst ? 60 : null,
    escalationAckMinutes: null,
    unacknowledgedMessage: null,
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

const HOURS = (slug) => [
  { id: "h1", accountId: `acct_${slug}`, dayOfWeek: 1, periodName: "Working", open: "08:00", close: "17:00", isClosed: false, sortOrder: 0 },
  { id: "h2", accountId: `acct_${slug}`, dayOfWeek: 2, periodName: "Working", open: "08:00", close: "17:00", isClosed: false, sortOrder: 0 },
  { id: "h3", accountId: `acct_${slug}`, dayOfWeek: 6, periodName: "Saturday", open: "09:00", close: "13:00", isClosed: false, sortOrder: 0 },
  { id: "h4", accountId: `acct_${slug}`, dayOfWeek: 0, periodName: "Closed", open: "00:00", close: "00:00", isClosed: true, sortOrder: 0 },
];

const MANAGER_HOURS = (slug) => [
  { id: "m1", accountId: `acct_${slug}`, dayOfWeek: 1, start: "07:00", end: "20:00" },
  { id: "m2", accountId: `acct_${slug}`, dayOfWeek: 2, start: "07:00", end: "20:00" },
];

const services = (v) =>
  v.services.map(([name, category, priceFromMicros, canQuote], i) => ({
    id: `s${i + 1}`,
    accountId: `acct_${v.slug}`,
    name,
    category,
    enabled: name !== "Discontinued service",
    priceFromMicros,
    canQuote,
    sortOrder: i,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  }));

function variantsFor(v) {
  return [
    { name: "full", src: { account: account(v), hours: HOURS(v.slug), managerHours: MANAGER_HOURS(v.slug), menu: [], services: services(v), appUrl: APP_URL } },
    {
      name: "bare-canada",
      src: {
        account: account(v, {
          businessName: v.caName,
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
          takesScheduledWork: true,
          responseTimeMinMinutes: null,
          responseTimeMaxMinutes: null,
        }),
        hours: [],
        managerHours: [],
        menu: [],
        services: [],
        appUrl: APP_URL,
      },
    },
  ];
}

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

async function buildSnapshot(v) {
  const { verticalFor } = await import("../src/verticals/index.ts");
  const agentConfig = await import("../src/lib/agent-config.ts");
  const definition = verticalFor(v.slug);

  const out = [`${v.title}: the rendered prompt, the tools the agent is given, and every customer SMS.`];

  for (const { name, src } of variantsFor(v)) {
    out.push(section(`AGENT PROMPT · ${name}`, agentConfig.buildGeneralPrompt(src)));
    out.push(section(`AGENT TOOLS · ${name}`, json(agentConfig.buildTools(src))));

    const a = src.account;
    out.push(
      section(
        `CUSTOMER SMS · ${name}`,
        [
          `booked:            ${definition.smsTemplates.bookingConfirmation(a, BOOKED)}`,
          `emergency:         ${definition.smsTemplates.bookingConfirmation(a, EMERGENCY)}`,
          `no time yet:       ${definition.smsTemplates.bookingConfirmation(a, UNSCHEDULED)}`,
          `escalation (open): ${definition.smsTemplates.escalationFollowUp(a, "Monday 8:00 AM")}`,
          `escalation (none): ${definition.smsTemplates.escalationFollowUp(a, null)}`,
          `cancel job:        ${definition.smsTemplates.cancellationReply(a, "job", BOOKED.when)}`,
          `cancel other:      ${definition.smsTemplates.cancellationReply(a, "reservation", BOOKED.when)}`,
          ...(definition.smsTemplates.unacknowledged ? [`no acknowledgement: ${definition.smsTemplates.unacknowledged(a)}`] : []),
        ].join("\n"),
      ),
    );
  }

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
        dashboardModules: definition.dashboardModules,
        agentFunctions: definition.agentFunctions,
        guardrails: definition.guardrails,
        ...(definition.dispatchFirst ? { dispatchFirst: true, ackMinutes: definition.ackMinutes } : {}),
        defaults: definition.defaults,
      }),
    ),
  );

  return out.join("\n");
}

for (const v of VERTICALS) {
  test(`${v.slug}: agent output and SMS are locked`, async () => {
    const actual = await buildSnapshot(v);
    const file = resolve(SNAP_DIR, `${v.slug}.snap.txt`);

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
      assert.fail(`${v.slug} output changed at line ${i + 1}\n  expected: ${JSON.stringify(b[i])}\n  actual:   ${JSON.stringify(a[i])}`);
    }
  });

  test(`${v.slug}: the agent is never given a restaurant's tools`, async () => {
    const { verticalFor } = await import("../src/verticals/index.ts");
    const { buildTools } = await import("../src/lib/agent-config.ts");
    const names = buildTools(variantsFor(v)[0].src)
      .filter((t) => t.type === "custom")
      .map((t) => t.name);

    const expected = v.dispatchFirst
      ? ["check_service_area", "request_immediate_dispatch", "dispatch_emergency", "take_message"]
      : ["check_service_area", "get_available_slots", "book_service_call", "dispatch_emergency", "take_message"];
    assert.deepEqual(names, expected);
    for (const restaurantOnly of ["book_reservation", "join_waitlist", "take_takeout_order", "check_delivery_area", "get_available_times"]) {
      assert.ok(!names.includes(restaurantOnly), `${restaurantOnly} must not be offered to a ${v.slug} account`);
    }
    // agentFunctions is the superset the vertical may use; every offered tool must be in it.
    const allowed = new Set(verticalFor(v.slug).agentFunctions);
    for (const n of names) assert.ok(allowed.has(n), `${n} is offered but not in agentFunctions`);
  });

  test(`${v.slug}: the life-safety instruction survives`, async () => {
    const { buildGeneralPrompt } = await import("../src/lib/agent-config.ts");
    const prompt = buildGeneralPrompt(variantsFor(v)[0].src);

    // The specific failure this guards against: an edit that keeps the words but loses the ordering,
    // so the agent books a visit and only afterwards mentions getting out of the building.
    const rule = prompt.split("\n").find((l) => l.includes(v.safety.line));
    assert.ok(rule, `prompt must carry the ${v.slug} safety rule`);
    for (const pattern of v.safety.must) assert.match(rule, pattern);
    for (const phrase of v.alsoInPrompt) assert.ok(prompt.includes(phrase), `prompt must contain: ${phrase}`);
  });
}

test("every field_service vertical books the right kind of job", async () => {
  const { verticalFor } = await import("../src/verticals/index.ts");
  // The distinction bookingKind exists for: a roofer's calls end in an estimate, not a repair.
  assert.equal(verticalFor("roofing").bookingKind, "estimate");
  for (const slug of ["plumbing", "hvac", "electrical"]) {
    assert.equal(verticalFor(slug).bookingKind, "service_call", `${slug} books service calls`);
  }
});
