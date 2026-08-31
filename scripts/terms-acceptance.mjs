/**
 * The dispute lookup: every terms acceptance on record for one customer.
 *
 *   node scripts/terms-acceptance.mjs someone@example.com                        (local / dev DB)
 *   node scripts/terms-acceptance.mjs someone@example.com --confirm production   (the real thing)
 *
 * Production credentials come only from secrets/production.env via db-env.mjs, never argv, and the
 * production target must be named explicitly — same contract as db:migrate:prod. Output is the
 * record you produce in a dispute: version accepted, timestamp, IP. Stripe holds its own second
 * record for the payment step (Dashboard -> the payment -> Checkout summary shows the consent).
 */
import { pathToFileURL } from "node:url";
import { PRODUCTION_ENV_FILE, REPO_ROOT, assertNotProduction, hostOf, loadEnvFile, readEnvFile } from "./db-env.mjs";

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email || email.startsWith("--")) {
  console.error("usage: node scripts/terms-acceptance.mjs <email> [--confirm production]");
  process.exit(1);
}

let url;
if (process.argv.includes("--confirm")) {
  if (process.argv[process.argv.indexOf("--confirm") + 1] !== "production") {
    console.error("REFUSING: --confirm must be followed by the word production");
    process.exit(1);
  }
  url = readEnvFile(PRODUCTION_ENV_FILE).DIRECT_URL;
} else {
  loadEnvFile(REPO_ROOT + "/.env.local");
  loadEnvFile(REPO_ROOT + "/.env");
  assertNotProduction({ what: "The terms-acceptance lookup (pass --confirm production to target production)" });
  url = process.env.DIRECT_URL || process.env.DATABASE_URL;
}
console.log("target:", hostOf(url));

const { PrismaClient } = await import(pathToFileURL(REPO_ROOT + "/node_modules/@prisma/client/index.js").href);
const prisma = new PrismaClient({ datasources: { db: { url } } });

const user = await prisma.user.findUnique({
  where: { email },
  select: {
    id: true,
    email: true,
    createdAt: true,
    account: { select: { businessName: true, vertical: true } },
    termsAcceptances: { orderBy: { acceptedAt: "asc" } },
  },
});

if (!user) {
  console.log(`no user with email ${email}`);
} else {
  console.log(`user      ${user.email} (${user.id}), signed up ${user.createdAt.toISOString()}`);
  console.log(`business  ${user.account ? `${user.account.businessName} (${user.account.vertical})` : "none yet"}`);
  if (user.termsAcceptances.length === 0) {
    console.log("acceptances: NONE ON RECORD");
  } else {
    console.log("acceptances:");
    for (const t of user.termsAcceptances) {
      console.log(`  version ${t.termsVersion}  accepted ${t.acceptedAt.toISOString()}  ip ${t.ipAddress ?? "(not captured)"}`);
    }
  }
}
await prisma.$disconnect();
