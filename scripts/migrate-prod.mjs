/**
 * Apply pending migrations to production. The only script in the repo allowed to touch it.
 *
 *   npm run db:migrate:prod
 *
 * Four things make this safe rather than merely careful:
 *
 *   1. The credentials come from secrets/production.env, which Prisma and Next.js never load. There
 *      is no ambient path to production; you have to run this file.
 *   2. The connection string reaches Prisma through the child process's environment, never through
 *      argv. argv is what leaked it once already, because a failing execSync embedded the whole
 *      command line — password and all — in its own Error message.
 *   3. Pending migrations are scanned for DROP, ALTER COLUMN, RENAME, TRUNCATE and DELETE FROM,
 *      and refused unless --allow-destructive is passed.
 *   4. It shows what it is about to do and requires the branch name typed back. A y/N prompt is too
 *      easy to answer on autopilot.
 */
import { createInterface } from "node:readline/promises";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
 * Read the pending migrations and refuse the destructive ones.
 *
 * Every migration in this project so far has been additive, and that is a promise to the accounts
 * already on production rather than a habit. A DROP, an ALTER COLUMN or a RENAME cannot be undone by
 * running something else afterwards: the data is gone, or the old name is gone, and the previous
 * deploy — which is still serving while the migration runs — starts failing on a column that no
 * longer answers to that name. TRUNCATE and DELETE FROM are worse in one respect: they leave the
 * schema looking perfectly healthy while the rows are gone. So all of them are refused by default
 * and have to be asked for.
 *
 * Deliberately a dumb text scan. It reads the SQL, strips comments and quoted strings so a table
 * called "dropbox" or a comment explaining a past drop cannot trip it, and looks for the verbs. A
 * parser would be more precise and would be one more thing that can be wrong about something this
 * consequential; a scan that occasionally over-refuses fails in the safe direction.
 */
const DESTRUCTIVE = [
  [/\bDROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX|TYPE|SCHEMA|DATABASE|VIEW|SEQUENCE|FUNCTION|TRIGGER|NOT\s+NULL|DEFAULT)\b/i, "DROP"],
  [/\bALTER\s+COLUMN\b/i, "ALTER COLUMN"],
  [/\bRENAME\b/i, "RENAME"],
  // Rows, not shape. A migration that empties a table takes customer data with it and leaves the
  // schema looking perfectly healthy afterwards, which is exactly why it has to be asked for out
  // loud rather than spotted in review.
  [/\bTRUNCATE\b/i, "TRUNCATE"],
  [/\bDELETE\s+FROM\b/i, "DELETE FROM"],
];

/** Strip `--` and block comments and quoted literals, so only real SQL keywords are scanned. */
function sqlWithoutCommentsAndStrings(sql) {
  return sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:[^']|'')*'/g, " '' ")
    .replace(/"(?:[^"]|"")*"/g, ' "" ');
}

const pending = (status.stdout.match(/^\s*[\w-]*\d{6,}[\w-]*\s*$/gm) ?? []).map((s) => s.trim()).filter(Boolean);
const findings = [];
for (const name of pending) {
  let sql;
  try {
    sql = readFileSync(resolve(REPO_ROOT, "prisma/migrations", name, "migration.sql"), "utf8");
  } catch {
    findings.push({ name, verb: "UNREADABLE", line: 0, text: "could not read its migration.sql" });
    continue;
  }
  const lines = sqlWithoutCommentsAndStrings(sql).split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const [pattern, verb] of DESTRUCTIVE) {
      if (pattern.test(line)) findings.push({ name, verb, line: i + 1, text: sql.split(/\r?\n/)[i].trim().slice(0, 120) });
    }
  });
}

console.log(`Pending: ${pending.length ? pending.join(", ") : "(could not parse the list)"}`);
if (findings.length === 0) {
  console.log("Destructive-SQL scan: clean — no DROP, ALTER COLUMN, RENAME, TRUNCATE or DELETE FROM.");
} else {
  console.log(`Destructive-SQL scan: ${findings.length} statement(s) found:`);
  for (const f of findings) console.log(`  ${f.name}:${f.line}  [${f.verb}]  ${f.text}`);
  if (!process.argv.includes("--allow-destructive")) {
    console.error("\nREFUSING: this would drop, alter, rename or delete something on production.");
    console.error("If that is genuinely intended, re-run with --allow-destructive.");
    process.exit(1);
  }
  console.log("\n--allow-destructive given; continuing.");
}
console.log("");

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
