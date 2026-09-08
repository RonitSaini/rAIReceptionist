import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * The response headers every page and route carries (next.config.ts), added after the 2026-09-07
 * pre-launch audit found none of them on production. The CSP is report-only on purpose: a
 * blocking policy needs per-request nonces for Next's inline scripts, which is its own change.
 */

test("every response carries the baseline security headers, and the CSP only reports", async () => {
  const config = (await import("../next.config.ts")).default;
  const rules = await config.headers();
  const all = rules.find((r) => r.source === "/(.*)");
  assert.ok(all, "expected a rule for every path");
  const get = (key) => all.headers.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value;
  assert.equal(get("X-Content-Type-Options"), "nosniff");
  assert.equal(get("X-Frame-Options"), "DENY");
  assert.equal(get("Referrer-Policy"), "strict-origin-when-cross-origin");
  const csp = get("Content-Security-Policy-Report-Only");
  assert.ok(csp, "expected a report-only CSP");
  assert.equal(get("Content-Security-Policy"), undefined, "a blocking CSP would break Next's inline scripts without nonces");
  for (const needed of ["default-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "https://maps.googleapis.com", "wss:"]) {
    assert.ok(csp.includes(needed), `CSP should include ${needed}`);
  }
});
