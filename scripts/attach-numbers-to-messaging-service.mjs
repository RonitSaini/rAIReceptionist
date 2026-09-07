/**
 * Backfill: put every provisioned customer number into the A2P Messaging Service sender pool and
 * record it on the account (docs/frontdesk-sms-spec.md §7).
 *
 *   node scripts/attach-numbers-to-messaging-service.mjs                 # the dev branch in .env
 *   node scripts/attach-numbers-to-messaging-service.mjs --production    # secrets/production.env
 *   ... --service MGxxxxxxxx                                              # override TWILIO_MESSAGING_SERVICE_SID
 *   ... --dry-run                                                         # say what would be attached
 *
 * Only numbers Twilio actually owns are attached: a test account holding a made-up +1212555 number
 * is reported and skipped rather than failing the run. Idempotent - a number already in the pool
 * is a success, not an error - so it is safe to run after every campaign change.
 *
 * Twilio credentials and the service SID come from .env (they are the same account in every
 * environment); only the DATABASE connection switches with --production, the same way
 * scripts/migrate-prod.mjs does it. Prints numbers and business names, never a credential.
 */
import { createRequire } from "node:module";
import { readEnvFile, loadProductionEnv, REPO_ROOT } from "./db-env.mjs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const PROD = args.includes("--production");
const serviceArg = args[args.indexOf("--service") + 1];

const env = readEnvFile(resolve(REPO_ROOT, ".env"));
const sid = env.TWILIO_ACCOUNT_SID;
const token = env.TWILIO_AUTH_TOKEN;
const service = (args.includes("--service") && serviceArg) || env.TWILIO_MESSAGING_SERVICE_SID;
if (!sid || !token) throw new Error("TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN missing from .env");
if (!service) throw new Error("No Messaging Service: set TWILIO_MESSAGING_SERVICE_SID in .env or pass --service MG...");

if (PROD) {
  const { host } = loadProductionEnv();
  console.log(`database: PRODUCTION (${host})`);
} else {
  console.log(`database: ${env.NEON_BRANCH ?? "the branch in .env"}`);
}
console.log(`messaging service: ${service}${DRY ? "   (dry run)" : ""}`);

const { PrismaClient } = createRequire(resolve(REPO_ROOT, "package.json"))("@prisma/client");
const prisma = new PrismaClient(PROD ? { datasources: { db: { url: process.env.DATABASE_URL } } } : undefined);

const auth = "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
const twilio = async (method, url, form) => {
  const res = await fetch(url, { method, headers: { Authorization: auth, ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) }, body: form ? new URLSearchParams(form) : undefined });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw Object.assign(new Error(data.message || `Twilio ${res.status}`), { code: data.code, status: res.status });
  return data;
};

const owned = new Map(((await twilio("GET", `https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json?PageSize=100`)).incoming_phone_numbers ?? []).map((n) => [n.sid, n.phone_number]));
const accounts = await prisma.account.findMany({ where: { twilioNumberSid: { not: null } }, select: { id: true, businessName: true, twilioNumber: true, twilioNumberSid: true, smsPoolAttachedAt: true } });
console.log(`accounts with a number: ${accounts.length}   numbers Twilio owns: ${owned.size}\n`);

let attached = 0, skipped = 0, failed = 0;
for (const a of accounts) {
  const label = `${a.businessName.padEnd(24)} ${a.twilioNumber}`;
  if (!owned.has(a.twilioNumberSid)) { console.log(`  skip     ${label}  (not a number this Twilio account owns)`); skipped++; continue; }
  if (DRY) { console.log(`  would    ${label}${a.smsPoolAttachedAt ? "  (already recorded)" : ""}`); continue; }
  try {
    await twilio("POST", `https://messaging.twilio.com/v1/Services/${service}/PhoneNumbers`, { PhoneNumberSid: a.twilioNumberSid });
    await prisma.account.update({ where: { id: a.id }, data: { smsPoolAttachedAt: new Date() } });
    console.log(`  attached ${label}`);
    attached++;
  } catch (e) {
    if (e.code === 21712) {
      await prisma.account.update({ where: { id: a.id }, data: { smsPoolAttachedAt: new Date() } });
      console.log(`  present  ${label}  (already in the pool)`);
      attached++;
    } else {
      console.log(`  FAILED   ${label}  ${String(e.message).replace(/AC[a-f0-9]{32}/gi, "<sid>").slice(0, 120)}`);
      failed++;
    }
  }
}
console.log(`\nattached=${attached} skipped=${skipped} failed=${failed}`);
await prisma.$disconnect();
process.exit(failed ? 1 : 0);
