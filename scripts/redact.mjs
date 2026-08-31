/**
 * Redaction wrapper for anything that can carry a connection string.
 *
 * Lives in the repo rather than a scratch directory because it is operational safety equipment,
 * not a one-off: any future script that touches a database URL, a Stripe key or a Neon token
 * should go through runSafe() rather than child_process directly.
 *
 * The credential leak in this project came from `execSync`: the command failed, and Node's own
 * Error message embedded the full command line — including a postgres:// URL with its password —
 * which then landed verbatim in a terminal transcript. The lesson is that it is not enough to
 * avoid PRINTING a secret; anything that can THROW while holding one has to be wrapped.
 *
 * Two rules enforced here:
 *   1. Secrets travel by stdin or environment, never in argv.
 *   2. Every byte that comes back out — stdout, stderr, and error messages — is scrubbed before
 *      it can reach a log, a console or a transcript.
 */
import { spawn } from "node:child_process";

/** Patterns for things that must never be echoed. Ordered most specific first. */
const PATTERNS = [
  // postgres/mysql/redis/amqp URLs: keep the scheme, role and host, drop the password.
  [/\b([a-z][a-z0-9+.-]*:\/\/[^:/\s@]+:)[^@\s]+@/gi, "$1<REDACTED>@"],
  // Bare provider secrets.
  [/\bnpg_[A-Za-z0-9]{8,}/g, "<REDACTED-NEON-PW>"],
  [/\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]{8,}/g, "<REDACTED-STRIPE-KEY>"],
  [/\bwhsec_[A-Za-z0-9]{8,}/g, "<REDACTED-STRIPE-WHSEC>"],
  [/\bSG\.[A-Za-z0-9_\-.]{16,}/g, "<REDACTED-SENDGRID-KEY>"],
  [/\bAIza[A-Za-z0-9_\-]{20,}/g, "<REDACTED-GOOGLE-KEY>"],
  [/\bAC[a-f0-9]{32}\b/gi, "<REDACTED-TWILIO-SID>"],
  [/\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/g, "<REDACTED-JWT>"],
];

/** Scrub a string of anything credential-shaped. Safe to call on any output. */
export function redact(text) {
  let out = String(text ?? "");
  for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement);
  return out;
}

/** Additionally scrub literal values the caller knows are secret (e.g. the password just generated). */
export function redactWith(text, secrets = []) {
  let out = redact(text);
  for (const s of secrets) {
    if (s && String(s).length >= 6) out = out.split(String(s)).join("<REDACTED>");
  }
  return out;
}

/**
 * Run a command, returning scrubbed output and never throwing an un-scrubbed error.
 *
 * @param {string} file            executable
 * @param {string[]} args          arguments — MUST NOT contain a secret
 * @param {object} opts
 * @param {string} [opts.input]    written to stdin; this is where secrets belong
 * @param {string[]} [opts.secrets] extra literals to scrub from the output
 */
export function runSafe(file, args = [], opts = {}) {
  const { input, secrets = [], env = process.env, cwd, shell = false, timeoutMs = 600000 } = opts;

  const offending = args.find((a) => redact(a) !== a);
  if (offending) {
    throw new Error("runSafe: an argument looks like a credential. Pass it on stdin or via env, never in argv.");
  }

  return new Promise((resolve) => {
    const child = spawn(file, args, { env, cwd, shell, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);

    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => (stderr += `\n${e.message}`));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        code,
        ok: code === 0,
        stdout: redactWith(stdout, secrets),
        stderr: redactWith(stderr, secrets),
      });
    });

    if (input !== undefined) child.stdin.write(input);
    child.stdin.end();
  });
}
