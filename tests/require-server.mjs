/**
 * Say why, once, when the server-backed tests have no server.
 *
 * Three test files talk to a running app (the Retell function endpoint, notifications polling, the
 * Stripe webhook). When the dev server is not there they used to fail as seven unrelated-looking
 * red lines - which read as a regression until somebody noticed every one was ECONNREFUSED. Twice
 * on 2026-09-06/07 that "regression" was the machine having been restarted, which ends the
 * detached dev server and nothing restarts it.
 *
 * So each of those files runs this first. If the server answers, nothing happens. If it does not,
 * the file's tests fail with one unmistakable message naming the cause and the fix, and it is
 * printed once more above the summary so it cannot be missed in a long run. Failing rather than
 * skipping on purpose: a silent skip would hide a server that should have been up.
 */
import { before } from "node:test";

let announced = false;

export function requireServer(base) {
  before(async () => {
    let reason;
    try {
      const res = await fetch(`${base}/api/auth/csrf`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) reason = `HTTP ${res.status} from ${base}/api/auth/csrf`;
    } catch (e) {
      // A refused connection surfaces as `fetch failed` with an AggregateError cause whose message
      // is EMPTY - only its code says ECONNREFUSED. Read the code first, and never let a blank
      // reason read as success (that exact blank let the first version of this hook pass silently).
      const cause = e instanceof Error && e.cause instanceof Error ? e.cause : null;
      reason = (cause && ("code" in cause && cause.code ? String(cause.code) : cause.message)) || (e instanceof Error && e.message) || String(e) || "unreachable";
    }
    if (!reason) return;
    const message = `No dev server at ${base} (${reason}). These tests need it running: \`npm run dev:3001\` (then BASE_URL=http://localhost:3001 npm test). This is NOT an application regression - the server is simply not up; after a reboot it never is.`;
    if (!announced) {
      announced = true;
      console.error(`\n!!! ${message}\n`);
    }
    throw new Error(message);
  });
}
