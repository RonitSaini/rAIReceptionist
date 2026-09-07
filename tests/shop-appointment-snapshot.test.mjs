import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * What a shop's callers actually get.
 *
 * Three accounts per vertical rather than two, because the branch that matters here is not the
 * country, it is whether the referral number exists. A vet with no emergency number configured is
 * the single worst state this product can be in, and the golden records exactly what the agent says
 * in it — so that if anyone ever "simplifies" the fallback away, the diff is unmissable.
 */

const here = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = resolve(here, "snapshots");

process.env.DATABASE_URL ??= "postgresql://snapshot:snapshot@localhost:5432/snapshot";
process.env.DIRECT_URL ??= process.env.DATABASE_URL;
process.env.RETELL_FUNCTION_SECRET = "snapshot-function-secret";
process.env.RETELL_LLM_MODEL = "gpt-4.1";

const APP_URL = "https://example.test";

const VERTICALS = [
  {
    slug: "auto_repair",
    title: "Auto Repair",
    usName: "Ridgeway Motors",
    caName: "Northside Auto",
    staff: "Ray",
    emergencyTypes: ["brake_failure", "overheating", "not_drivable", "warning_light"],
    slotMinutes: 60,
    referral: { towingPartnerName: "Ridgeway Towing", towingPartnerPhone: "+12125550155" },
    services: [
      ["Oil change", "Servicing", 79_000_000n, true],
      ["Brake inspection", "Brakes", 49_000_000n, true],
      ["Diagnostics", "Diagnostics", null, false],
      ["Discontinued service", null, null, true],
    ],
    mustSay: [
      "the service advisor will assess it when they see the vehicle",
      "NEVER estimate what a repair will cost",
      "tell them not to drive the vehicle",
    ],
  },
  {
    slug: "veterinary",
    title: "Veterinary",
    usName: "Ridgeway Veterinary",
    caName: "Northside Animal Clinic",
    staff: "Nita",
    emergencyTypes: ["breathing", "hit_by_car", "toxin", "seizure", "bloat", "urinary_blockage", "bleeding"],
    slotMinutes: 30,
    referral: { emergencyReferralPhone: "+12125550188" },
    services: [
      ["Consultation", "General", 65_000_000n, true],
      ["Vaccination", "Preventive", 45_000_000n, true],
      ["Dental", "Surgery", null, false],
      ["Discontinued service", null, null, true],
    ],
    mustSay: [
      "NEVER give medical advice of any kind",
      "NEVER tell a caller to wait and see",
      "bring the animal in immediately",
    ],
  },
];

function account(v, overrides = {}) {
  return {
    id: `acct_${v.slug}`,
    vertical: v.slug,
    businessName: v.usName,
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
    retellAgentId: "agent_s",
    retellLlmId: "llm_s",
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
    escalationTypes: ["quote_request"],
    tableTurnMinutes: 90,
    reservationIntervalMinutes: 30,
    maxCoversPerSlot: null,
    seatingCapacity: null,
    takesTakeoutOrders: false,
    offersDelivery: false,
    serviceAreaZip: null,
    serviceAreaRadiusMiles: null,
    technicianName: v.staff,
    emergencyTypes: v.emergencyTypes,
    calloutFeeMicros: null,
    jobSlotMinutes: v.slotMinutes,
    maxJobsPerDay: 8,
    takesScheduledWork: true,
    responseTimeMinMinutes: null,
    responseTimeMaxMinutes: null,
    escalationAckMinutes: null,
    unacknowledgedMessage: null,
    towingPartnerName: null,
    towingPartnerPhone: null,
    emergencyReferralPhone: null,
    latitude: 40.7357,
    longitude: -74.1724,
    agentSyncedAt: null,
    agentSyncError: null,
    lastSeenAt: null,
    onboardingStepId: "done",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...v.referral,
    ...overrides,
  };
}

const HOURS = (slug) => [
  { id: "h1", accountId: `acct_${slug}`, dayOfWeek: 1, periodName: "Open", open: "08:00", close: "17:00", isClosed: false, sortOrder: 0 },
  { id: "h2", accountId: `acct_${slug}`, dayOfWeek: 2, periodName: "Open", open: "08:00", close: "17:00", isClosed: false, sortOrder: 0 },
  { id: "h3", accountId: `acct_${slug}`, dayOfWeek: 6, periodName: "Saturday", open: "09:00", close: "13:00", isClosed: false, sortOrder: 0 },
  { id: "h4", accountId: `acct_${slug}`, dayOfWeek: 0, periodName: "Closed", open: "00:00", close: "00:00", isClosed: true, sortOrder: 0 },
];

const MANAGER_HOURS = (slug) => [
  { id: "m1", accountId: `acct_${slug}`, dayOfWeek: 1, start: "07:00", end: "19:00" },
  { id: "m2", accountId: `acct_${slug}`, dayOfWeek: 2, start: "07:00", end: "19:00" },
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
  const base = { hours: HOURS(v.slug), managerHours: MANAGER_HOURS(v.slug), menu: [], services: services(v), appUrl: APP_URL };
  return [
    { name: "full", src: { ...base, account: account(v) } },
    {
      name: "bare-canada",
      src: {
        ...base,
        account: account(v, { businessName: v.caName, country: "CA", state: "ON", city: "Toronto", zip: "M5V 2T6", timeZone: "America/Toronto", twilioNumber: null, canQuotePrices: false, technicianName: null, emergencyTypes: [], escalatesToManager: false, escalationTypes: [] }),
        hours: [],
        managerHours: [],
        services: [],
      },
    },
    // The state the fallback exists for: nobody ever filled the referral in.
    {
      name: "no-referral",
      src: { ...base, account: account(v, { towingPartnerName: null, towingPartnerPhone: null, emergencyReferralPhone: null }) },
    },
  ];
}

const BOOKED = { kind: "job", customerName: "Elena Rossi", when: new Date("2026-09-02T14:00:00.000Z"), items: "2014 Honda Civic", isEmergency: false };
const UNSCHEDULED = { ...BOOKED, when: null };

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
    if (name === "full") out.push(section(`AGENT TOOLS · ${name}`, json(agentConfig.buildTools(src))));

    const a = src.account;
    if (name === "full") {
      out.push(
        section(
          `CUSTOMER SMS · ${name}`,
          [
            `booked:            ${definition.smsTemplates.bookingConfirmation(a, BOOKED)}`,
            `no time yet:       ${definition.smsTemplates.bookingConfirmation(a, UNSCHEDULED)}`,
            `escalation (open): ${definition.smsTemplates.escalationFollowUp(a, "Monday 8:00 AM")}`,
            `escalation (none): ${definition.smsTemplates.escalationFollowUp(a, null)}`,
            `cancel job:        ${definition.smsTemplates.cancellationReply(a, "job", BOOKED.when)}`,
            `cancel other:      ${definition.smsTemplates.cancellationReply(a, "reservation", BOOKED.when)}`,
          ].join("\n"),
        ),
      );
    }
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
        referral: definition.referral,
        bookingKind: definition.bookingKind,
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

  test(`${v.slug}: three tools, and none of them dispatch anyone`, async () => {
    const { verticalFor } = await import("../src/verticals/index.ts");
    const { buildTools } = await import("../src/lib/agent-config.ts");
    const names = buildTools(variantsFor(v)[0].src)
      .filter((t) => t.type === "custom")
      .map((t) => t.name);

    assert.deepEqual(names, ["get_available_slots", "book_appointment", "take_message"]);
    // The customer comes here. Nothing about a service area or a dispatch belongs in this archetype.
    for (const wrong of ["check_service_area", "request_immediate_dispatch", "dispatch_emergency", "book_service_call", "book_reservation", "check_delivery_area"]) {
      assert.ok(!names.includes(wrong), `${wrong} must not be offered to a ${v.slug} account`);
    }
    assert.deepEqual([...verticalFor(v.slug).agentFunctions], names);
  });

  test(`${v.slug}: the things it must never say, and the ones it must`, async () => {
    const { buildGeneralPrompt } = await import("../src/lib/agent-config.ts");
    const prompt = buildGeneralPrompt(variantsFor(v)[0].src);
    for (const phrase of v.mustSay) assert.ok(prompt.includes(phrase), `prompt must contain: ${phrase}`);
  });
}

test("a vet with no referral number still tells the caller what to do", async () => {
  const { buildGeneralPrompt } = await import("../src/lib/agent-config.ts");
  const vet = VERTICALS.find((v) => v.slug === "veterinary");
  const noReferral = variantsFor(vet).find((x) => x.name === "no-referral");
  const prompt = buildGeneralPrompt(noReferral.src);

  // The failure this guards against: someone deletes the fallback because "the number is required
  // anyway", and an account created before that rule shipped answers an emergency with silence.
  assert.match(prompt, /call the nearest emergency animal hospital/i);
  assert.match(prompt, /Do not leave them without an instruction/i);
  assert.ok(!/IF WE ARE CLOSED: give them this number/.test(prompt), "must not claim to have a number it does not have");
});

test("the referral number appears in the same breath as the instruction to use it", async () => {
  const { buildGeneralPrompt } = await import("../src/lib/agent-config.ts");
  const vet = VERTICALS.find((v) => v.slug === "veterinary");
  const prompt = buildGeneralPrompt(variantsFor(vet)[0].src);
  const line = prompt.split("\n").find((l) => l.includes("IF WE ARE CLOSED"));
  assert.ok(line, "closed-hours branch must exist");
  assert.match(line, /\(212\) 555-0188/, "the number must be on the same line as the instruction");
  assert.match(line, /FIRST, before any other question/i);
});
