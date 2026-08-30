/**
 * Regression: reading notifications must never mark them read.
 *
 * Polls and page GETs are side-effect-free — readAt changes only through the explicit actions
 * (mark read / mark all read / acknowledge / open). This hits a RUNNING server as the demo user:
 *   BASE_URL=http://localhost:3000 npm test        (defaults shown; set DEMO_EMAIL / DEMO_PASSWORD to override)
 * Requires at least one unread notification for the demo account (run `npm run db:seed` to top one up).
 */
import test from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.DEMO_EMAIL ?? "demo@callcover.app";
const PASSWORD = process.env.DEMO_PASSWORD ?? "password123";

/** Minimal cookie jar over fetch (Node's fetch doesn't persist cookies). */
function client() {
  const jar = new Map();
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const absorb = (res) => {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  };
  return async (path, init = {}) => {
    const res = await fetch(BASE + path, { ...init, redirect: "manual", headers: { ...(init.headers ?? {}), cookie: cookieHeader() } });
    absorb(res);
    return res;
  };
}

async function login(get) {
  const csrf = await (await get("/api/auth/csrf")).json();
  const body = new URLSearchParams({ csrfToken: csrf.csrfToken, email: EMAIL, password: PASSWORD, json: "true" });
  const res = await get("/api/auth/callback/credentials", { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" } });
  assert.ok([200, 302].includes(res.status), `login failed: ${res.status}`);
  const me = await get("/api/notifications/recent");
  assert.equal(me.status, 200, "not authenticated after login — is the demo user seeded?");
}

const snapshot = async (get) => {
  const { count, items } = await (await get("/api/notifications/recent")).json();
  return { count, readAt: items.map((n) => `${n.id}:${n.readAt ?? "unread"}`) };
};

test("polling and page GETs never change readAt", async () => {
  const get = client();
  await login(get);

  const before = await snapshot(get);
  assert.ok(before.count > 0, "test needs ≥1 unread notification (run `npm run db:seed`)");

  // Everything a signed-in, idle client does on its own: the poll (twice), the dashboard inbox,
  // the notifications page, plus a second poll after those pages rendered.
  await get("/api/notifications/recent");
  await get("/api/notifications/recent");
  for (const page of ["/dashboard", "/notifications", "/notifications?unread=1"]) {
    const res = await get(page);
    assert.equal(res.status, 200, `${page} -> ${res.status}`);
    const html = await res.text();
    // Guard against a side-effecting GET coming back as a link target (it was once a route handler).
    assert.doesNotMatch(html, /\/notifications\/open\//, `${page} renders a link to a mark-read GET`);
  }
  const after = await snapshot(get);

  assert.equal(after.count, before.count, "unread count changed with no explicit mark-read action");
  assert.deepEqual(after.readAt, before.readAt, "readAt changed on some notification with no explicit action");
});

test("the old mark-read GET route is gone", async () => {
  const get = client();
  await login(get);
  const { items } = await (await get("/api/notifications/recent")).json();
  const res = await get(`/notifications/open/${items[0]?.id ?? "x"}`);
  assert.equal(res.status, 404, `GET /notifications/open/:id should 404, got ${res.status}`);
});
