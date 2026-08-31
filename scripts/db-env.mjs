/**
 * Which database a script is about to talk to, and whether it is allowed to.
 *
 * The problem this exists to stop: `.env` is the file Prisma's CLI reads by default, and for a
 * while it held the production connection string. Every `prisma migrate`, every seed script, every
 * one-off `node` script that imported the client, silently defaulted to production. Nothing warned;
 * a guard in one seed script was the only reason test data did not land in front of real customers.
 *
 * So production credentials now live in secrets/production.env, which neither Prisma nor Next.js
 * loads under any circumstances, and every other script asserts it is NOT pointed at production
 * before it does anything. The default is a development branch; production is opt-in, explicit, and
 * goes through scripts/migrate-prod.mjs.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const REPO_ROOT = resolve(import.meta.dirname, "..");
export const PRODUCTION_ENV_FILE = resolve(REPO_ROOT, "secrets/production.env");

/**
 * Host fragments that mean production. Endpoint ids are hostnames, not secrets, so naming them here
 * is safe and makes the guard specific rather than heuristic. If the production compute is ever
 * recreated its endpoint id changes, so this list has to be updated with it — the branch-name check
 * below is the backstop for that.
 */
export const PRODUCTION_HOSTS = ["ep-dry-flower-a5nzfxsf"];

/** Parse a KEY=value file. Quotes stripped, `#` comments and blanks ignored. */
export function readEnvFile(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
  }
  return out;
}

/**
 * Load a KEY=value file into process.env, overriding what is already there.
 *
 * Overriding is the point. Importing @prisma/client runs its own dotenv on `.env` first — ES imports
 * are evaluated before any statement in the importing module — so a loader that politely skips
 * already-set keys leaves Prisma's value in place and the script talks to the wrong database.
 */
export function loadEnvFile(path) {
  const values = readEnvFile(path);
  for (const [k, v] of Object.entries(values)) process.env[k] = v;
  return Object.keys(values);
}

/** The host a connection string points at, with no credentials attached. Safe to print. */
export function hostOf(url) {
  return String(url ?? "").match(/@([^/:?]+)/)?.[1] ?? "(unknown)";
}

export function isProductionUrl(url) {
  const host = hostOf(url);
  return PRODUCTION_HOSTS.some((h) => host.includes(h));
}

/**
 * Refuse to continue if this process is pointed at production.
 *
 * Call it at the top of anything that writes. It reports the host, which is not a secret, and never
 * the credentials, which are.
 */
export function assertNotProduction({ what = "This script" } = {}) {
  const url = process.env.DATABASE_URL ?? "";
  const host = hostOf(url);
  const branch = process.env.NEON_BRANCH ?? "";

  if (!url) {
    console.error(`REFUSING: DATABASE_URL is not set, so ${what.toLowerCase()} cannot tell which database it would write to.`);
    process.exit(1);
  }
  if (isProductionUrl(url) || branch === "production") {
    console.error(`REFUSING: DATABASE_URL points at production (${host}${branch ? `, branch: ${branch}` : ""}).`);
    console.error(`${what} is for development branches. Production migrations go through: npm run db:migrate:prod`);
    process.exit(1);
  }
  return { host, branch };
}

/**
 * Load production credentials, deliberately, from the one file that holds them.
 *
 * Asserts the opposite of assertNotProduction: if this file does not actually point at production,
 * something has been mis-copied and the caller must not go on believing it is talking to prod.
 */
export function loadProductionEnv() {
  if (!existsSync(PRODUCTION_ENV_FILE)) {
    console.error(`Missing ${PRODUCTION_ENV_FILE}.`);
    console.error("It holds the production DATABASE_URL and DIRECT_URL, is gitignored, and is read by nothing else.");
    process.exit(1);
  }
  loadEnvFile(PRODUCTION_ENV_FILE);
  const url = process.env.DATABASE_URL ?? "";
  if (!isProductionUrl(url)) {
    console.error(`REFUSING: ${PRODUCTION_ENV_FILE} does not point at a known production host (got ${hostOf(url)}).`);
    process.exit(1);
  }
  return { host: hostOf(url) };
}
