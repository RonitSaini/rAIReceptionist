/**
 * Create (or refresh) a plumbing test account.
 *
 * Phase 2a needs a real account on a real database to exercise the field_service archetype: the
 * fixtures in tests/ prove the agent's *output* is right, but they cannot prove that onboarding
 * writes the columns, that Schedule reads them back, or that a Job survives a round trip.
 *
 * DEVELOPMENT BRANCHES ONLY. The guard below refuses to run against production, because this
 * writes an account with a fake phone number and a fake address, and a stray run against the live
 * database would put it in front of real customers.
 *
 *   node scripts/seed-plumbing-test.mjs --yes
 */
import { scryptSync, randomBytes } from "node:crypto";
import { REPO_ROOT, assertNotProduction, loadEnvFile } from "./db-env.mjs";

// .env.local first and with override, then the guard, then Prisma. Importing @prisma/client runs its
// own dotenv on `.env`, and ES imports evaluate before any of this, so the load has to override and
// the client has to be pulled in afterwards.
loadEnvFile(REPO_ROOT + "/.env.local");
const { host, branch } = assertNotProduction({ what: "The plumbing test seeder" });

if (!process.argv.includes("--yes")) {
  console.error(`About to seed a plumbing test account into ${host} (branch: ${branch || "unset"}).`);
  console.error("Re-run with --yes to confirm.");
  process.exit(1);
}

const { PrismaClient } = await import("@prisma/client");

const EMAIL = "plumbing-test@frontdesk.test";
const prisma = new PrismaClient();

/** Must match src/lib/password.ts exactly (scrypt$<salt hex>$<hash hex>, 64-byte key) or sign-in fails. */
function hashPassword(plain) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(plain, salt, 64).toString("hex")}`;
}

const HOURS = [
  { dayOfWeek: 0, periodName: "Closed", open: "00:00", close: "00:00", isClosed: true },
  { dayOfWeek: 1, periodName: "Working", open: "08:00", close: "17:00", isClosed: false },
  { dayOfWeek: 2, periodName: "Working", open: "08:00", close: "17:00", isClosed: false },
  { dayOfWeek: 3, periodName: "Working", open: "08:00", close: "17:00", isClosed: false },
  { dayOfWeek: 4, periodName: "Working", open: "08:00", close: "17:00", isClosed: false },
  { dayOfWeek: 5, periodName: "Working", open: "08:00", close: "17:00", isClosed: false },
  { dayOfWeek: 6, periodName: "Saturday", open: "09:00", close: "13:00", isClosed: false },
];

const SERVICES = [
  { name: "Drain unblocking", category: "Drains", priceFromMicros: 99_000_000n, canQuote: true, sortOrder: 0 },
  { name: "Leak detection", category: "Leaks", priceFromMicros: 149_000_000n, canQuote: true, sortOrder: 1 },
  { name: "Tap and toilet repairs", category: "General", priceFromMicros: 89_000_000n, canQuote: true, sortOrder: 2 },
  { name: "Water heater repair", category: "Heating", priceFromMicros: null, canQuote: false, sortOrder: 3 },
  { name: "Boiler replacement", category: "Heating", priceFromMicros: null, canQuote: false, sortOrder: 4 },
];

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: EMAIL }, select: { accountId: true } });
  if (existing?.accountId) {
    // Rebuild from scratch so re-running is idempotent rather than additive.
    await prisma.account.delete({ where: { id: existing.accountId } });
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    console.log("removed the previous test account");
  }

  const account = await prisma.account.create({
    data: {
      vertical: "plumbing",
      businessName: "Ridgeway Plumbing",
      ownerName: "Dave Ridgeway",
      cellPhone: "+12125550188",
      addressLine1: "44 Mill Lane",
      city: "Newark",
      state: "NJ",
      country: "US",
      zip: "07102",
      timeZone: "America/New_York",
      hostName: "Sam",
      // A 555-01xx number: reserved for fiction, so it can never reach a real handset.
      twilioNumber: "+12125550111",
      // Newark City Hall, so the service-area maths has a real point to measure from.
      latitude: 40.7357,
      longitude: -74.1724,
      serviceAreaZip: "07102",
      serviceAreaRadiusMiles: 25,
      technicianName: "Mike",
      emergencyTypes: ["burst_pipe", "no_water", "sewage_backup", "flooding", "gas_smell", "no_hot_water"],
      calloutFeeMicros: 89_000_000n,
      jobSlotMinutes: 120,
      maxJobsPerDay: 6,
      canQuotePrices: true,
      escalatesToManager: true,
      escalationTypes: ["quote_request", "complaint"],
      takesTakeoutOrders: false,
      offersDelivery: false,
      onboardingStep: 10,
      businessHours: { create: HOURS.map((h, i) => ({ ...h, sortOrder: i })) },
      managerAvailability: { create: [1, 2, 3, 4, 5].map((d) => ({ dayOfWeek: d, start: "07:00", end: "20:00" })) },
      serviceOfferings: { create: SERVICES.map((s) => ({ ...s, enabled: true })) },
    },
  });

  await prisma.user.create({
    data: { email: EMAIL, name: "Dave Ridgeway", passwordHash: hashPassword("plumbing-test-1234"), accountId: account.id },
  });

  console.log(`account ${account.id} — ${account.businessName} (${account.vertical})`);
  console.log(`sign in: ${EMAIL} / plumbing-test-1234`);
  console.log(`host: ${host}`);
}

main()
  .catch((e) => {
    // Never let a Prisma error print the connection string it was holding.
    console.error(String(e?.message ?? e).replace(/postgres(ql)?:\/\/[^\s"]+/gi, "<REDACTED-DSN>"));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
