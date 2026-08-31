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

/**
 * The confirmation, one of two ways.
 *
 * Normally it is typed at a prompt. But a deploy is sometimes driven from something with no
 * terminal, and the point of the confirmation is that the migration cannot happen by accident, not
 * that a human's fingers must be on the keys. So `--confirm production` is accepted instead: it has
 * to be written into the command, naming the target, which no CI job or stray script does by
 * mistake. There is still no ambient path — no environment variable, no default, no bare --yes.
 */
const flagIndex = process.argv.indexOf("--confirm");
const flagged = flagIndex !== -1 ? process.argv[flagIndex + 1] : null;

let answer = flagged;
if (answer === null) {
  if (!process.stdin.isTTY) {
    console.error("REFUSING: no terminal attached, so the confirmation cannot be typed.");
    console.error(`If this is a deliberate, authorized deploy, re-run with: --confirm ${CONFIRM}`);
    process.exit(1);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  answer = (await rl.question(`Apply these migrations to PRODUCTION? Type "${CONFIRM}" to continue: `)).trim();
  rl.close();
}

if (answer !== CONFIRM) {
  console.log("Cancelled. Nothing was applied.");
  process.exit(1);
}
console.log(flagged !== null ? `Confirmed on the command line (--confirm ${CONFIRM}).` : "Confirmed.");

const result = await runSafe("npx.cmd", ["prisma", "migrate", "deploy"], { env: childEnv, cwd: REPO_ROOT });
console.log(result.stdout.trim() || result.stderr.trim());
if (!result.ok) {
  console.error(`\nmigrate deploy exited ${result.code}. Nothing further was attempted.`);
  process.exit(result.code ?? 1);
}
console.log("\nApplied.");
