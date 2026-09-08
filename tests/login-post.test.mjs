import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseSetCookie, postCredentials, safeCallbackPath, sessionCookieFrom } from "@/lib/login-post";

/**
 * The password login is a real POST at every moment of the page's life (2026-09-08). Until then a
 * pre-hydration Enter submitted the form as a GET with the credentials in the URL. The form now
 * posts to a server action, which logs in through NextAuth's own credentials callback and relays
 * the session cookie. The network is stubbed here; the running app is driven by the funnel harness
 * with scripts blocked.
 */

test("a callback destination is a same-origin path or the dashboard, never an open redirect", () => {
  assert.equal(safeCallbackPath("/settings?tab=billing"), "/settings?tab=billing");
  assert.equal(safeCallbackPath("/onboarding/7"), "/onboarding/7");
  assert.equal(safeCallbackPath(undefined), "/dashboard");
  assert.equal(safeCallbackPath(""), "/dashboard");
  assert.equal(safeCallbackPath("https://evil.example/phish"), "/dashboard");
  assert.equal(safeCallbackPath("//evil.example"), "/dashboard");
  assert.equal(safeCallbackPath("/\\evil.example"), "/dashboard");
  assert.equal(safeCallbackPath("/ok\r\nSet-Cookie: x"), "/dashboard");
});

test("a Set-Cookie line is read as the cookie store wants it, secure prefix and all", () => {
  const c = parseSetCookie("__Secure-next-auth.session-token=abc.def; Path=/; Expires=Wed, 08 Oct 2026 02:00:00 GMT; HttpOnly; Secure; SameSite=Lax");
  assert.equal(c.name, "__Secure-next-auth.session-token");
  assert.equal(c.value, "abc.def");
  assert.equal(c.path, "/");
  assert.equal(c.httpOnly, true);
  assert.equal(c.secure, true);
  assert.equal(c.sameSite, "lax");
  assert.equal(c.expires.toISOString(), "2026-10-08T02:00:00.000Z");
  assert.equal(parseSetCookie("garbage"), null);
  const lines = ["next-auth.csrf-token=t%7Ch; Path=/; HttpOnly; SameSite=Lax", "next-auth.callback-url=%2F; Path=/; HttpOnly; SameSite=Lax", "next-auth.session-token=sess; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000"];
  assert.equal(sessionCookieFrom(lines).name, "next-auth.session-token");
  assert.equal(sessionCookieFrom(lines).maxAge, 2592000);
  assert.equal(sessionCookieFrom(lines.slice(0, 2)), null, "no session cookie means no login");
});

/** A fake NextAuth: one CSRF answer, then a callback that checks the CSRF cookie came back. */
function fakeNextAuth({ accept }) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (/\/api\/auth\/csrf$/.test(String(url))) {
      const res = new Response(JSON.stringify({ csrfToken: "tok" }), { status: 200, headers: { "content-type": "application/json" } });
      res.headers.append("set-cookie", "next-auth.csrf-token=tok%7Chash; Path=/; HttpOnly; SameSite=Lax");
      return res;
    }
    const body = Object.fromEntries(new URLSearchParams(init.body));
    const cookieOk = /next-auth\.csrf-token=tok%7Chash/.test(init.headers?.cookie ?? "");
    if (!cookieOk || body.csrfToken !== "tok") return new Response("csrf", { status: 403 });
    if (!accept(body)) return new Response(JSON.stringify({ url: "/login?error=CredentialsSignin" }), { status: 401 });
    const res = new Response(JSON.stringify({ url: body.callbackUrl }), { status: 200 });
    res.headers.append("set-cookie", "next-auth.session-token=sess.jwt; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000");
    return res;
  };
  return { fetchImpl, calls };
}

test("the right password comes back as a session cookie; the wrong one as a 401 and no cookie", async () => {
  const good = fakeNextAuth({ accept: (b) => b.email === "owner@example.com" && b.password === "correct horse" });
  const win = await postCredentials("http://localhost:3001", { email: "owner@example.com", password: "correct horse", callbackUrl: "/dashboard" }, good.fetchImpl);
  assert.equal(win.ok, true);
  assert.equal(win.session.name, "next-auth.session-token");
  assert.equal(win.session.value, "sess.jwt");
  assert.equal(good.calls.length, 2);
  assert.equal(good.calls[1].init.method, "POST");
  assert.equal(good.calls[1].init.redirect, "manual");
  assert.match(good.calls[1].init.body.toString(), /json=true/);

  const bad = fakeNextAuth({ accept: () => false });
  const loss = await postCredentials("http://localhost:3001", { email: "owner@example.com", password: "nope", callbackUrl: "/dashboard" }, bad.fetchImpl);
  assert.deepEqual(loss, { ok: false, status: 401 });
});

test("the login form is a server-action POST and has no client-only submit left", () => {
  const form = readFileSync(new URL("../src/app/(auth)/login/login-form.tsx", import.meta.url), "utf8");
  assert.match(form, /useActionState\(logIn/);
  assert.match(form, /<form action=\{action\}/);
  assert.doesNotMatch(form, /onSubmit=/, "a client onSubmit is exactly what left the form a GET before hydration");
  assert.doesNotMatch(form, /from "next-auth\/react"/, "the client no longer signs in on its own");
  assert.match(form, /name="callbackUrl"/, "the destination travels with the POST");
});
