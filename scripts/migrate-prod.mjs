/**
 * Apply pending migrations to production. The only script in the repo allowed to touch it.
 *
 *   npm run db:migrate:prod
 *
 * Three things make this safe rather than merely careful:
 *
 *   1. The credentials come from secrets/production.env, which Prisma and Next.js never load. There
 *      is no ambient path to production; you have to run this file.
 *   2. The connection string reaches Prisma through the child process's environment, never through
 *      argv. argv is what leaked it once already, because a failing execSync embedded the whole
 *      command line — password and all — in its own Error message.
 *   3. It shows what it is about to do and requires the branch name typed back. A y/N prompt is too
 *      easy to answer on autopilot.
 */
import { createInterface } from "node:readline/promises";
import { runSafe } from "./redact.mjs";
import { REPO_ROOT, loadProductionEnv } from "./db-env.mjs";

const CONFIRM = "production";

const { host } = loadProductionEnv();
const url = process.env.DATABASE_URL;
const directUrl = process.env.DIRECT_URL ?? url;

/** Migrations run over a direct connection; the pooler cannot hold the advisory lock Prisma takes. */
const childEnv = { ...process.env, DATABASE_URL: directUrl, DIRECT_URL: directUrl };

console.log(`Target: ${host}`);
console.log("");

const status = await runSafe("npx.cmd", ["prisma", "migrate", "status"], { env: childEnv, cwd: REPO_ROOT });
console.log(status.stdout.trim() || status.stderr.trim());
console.log("");

if (/Database schema is up to date/i.test(status.stdout)) {
  console.log("Nothing to apply.");
  process.exit(0);
}

if (!process.stdin.isTTY) {
  console.error("REFUSING: no terminal attached, so the confirmation cannot be typed.");
  console.error("Run this yourself in a terminal; it is not for scripts or CI.");
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = (await rl.question(`Apply these migrations to PRODUCTION? Type "${CONFIRM}" to continue: `)).trim();
rl.close();

if (answer !== CONFIRM) {
  console.log("Cancelled. Nothing was applied.");
  process.exit(1);
}

const result = await runSafe("npx.cmd", ["prisma", "migrate", "deploy"], { env: childEnv, cwd: REPO_ROOT });
console.log(result.stdout.trim() || result.stderr.trim());
if (!result.ok) {
  console.error(`\nmigrate deploy exited ${result.code}. Nothing further was attempted.`);
  process.exit(result.code ?? 1);
}
console.log("\nApplied.");
