import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * A scheduled email must die with the account (2026-09-08).
 *
 * The referral follow-up is handed to Resend with a `scheduled_at` twenty minutes out, so nothing
 * of ours has to be awake to send it. Deleting the account never told Resend, and the follow-up
 * arrived after the account was gone - for a deleted throwaway, that read as spam about an account
 * that no longer existed. Now the send returns Resend's id, sign-up stores it on the account, and
 * deletion cancels it. Resend is stubbed here: what goes over the wire, and what comes back.
 */

process.env.VERCEL_ENV = "production"; // routeOutbound sends to the real recipient
process.env.RESEND_API_KEY = "re_test_never_a_real_key";
process.env.NEXT_PUBLIC_APP_URL ??= "https://www.frontdeskai.dev";
const { sendReferralEmail, cancelScheduledEmail } = await import("@/lib/email");

/** Replace fetch for one call; returns what was requested. */
function stubFetch(status, body) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method, headers: init?.headers, body: init?.body ? JSON.parse(init.body) : null });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
  return { calls, restore: () => (globalThis.fetch = original) };
}

test("scheduling the referral returns Resend's id and asks for a send twenty minutes out", async () => {
  const stub = stubFetch(200, { id: "re_scheduled_123" });
  try {
    const before = Date.now();
    const id = await sendReferralEmail("owner@example.com", "Sweep Plumbing", "SWEEP1234");
    assert.equal(id, "re_scheduled_123");
    assert.equal(stub.calls.length, 1);
    const [call] = stub.calls;
    assert.equal(call.url, "https://api.resend.com/emails");
    assert.equal(call.method, "POST");
    assert.equal(call.headers.Authorization, "Bearer re_test_never_a_real_key");
    assert.deepEqual(call.body.to, ["owner@example.com"]);
    const at = new Date(call.body.scheduled_at).getTime();
    assert.ok(at - before >= 19 * 60_000 && at - before <= 21 * 60_000, `scheduled_at is ${Math.round((at - before) / 1000)}s out`);
  } finally {
    stub.restore();
  }
});

test("a failed schedule returns null rather than throwing, so sign-up never fails on email", async () => {
  const stub = stubFetch(500, { message: "boom" });
  try {
    assert.equal(await sendReferralEmail("owner@example.com", "Sweep Plumbing", "SWEEP1234"), null);
  } finally {
    stub.restore();
  }
});

test("cancelling posts to Resend's cancel endpoint and reports whether it took", async () => {
  const ok = stubFetch(200, { object: "email", id: "re_scheduled_123" });
  try {
    assert.equal(await cancelScheduledEmail("re_scheduled_123"), true);
    assert.equal(ok.calls[0].url, "https://api.resend.com/emails/re_scheduled_123/cancel");
    assert.equal(ok.calls[0].method, "POST");
    assert.equal(ok.calls[0].headers.Authorization, "Bearer re_test_never_a_real_key");
  } finally {
    ok.restore();
  }
  // Already sent, or unknown: Resend refuses, we say so, nothing throws (deletion carries on).
  const gone = stubFetch(400, { message: "Email can only be cancelled if it is scheduled" });
  try {
    assert.equal(await cancelScheduledEmail("re_already_sent"), false);
  } finally {
    gone.restore();
  }
});

test("sign-up keeps the id on the account, and deletion cancels it before the rows go", () => {
  // The wiring lives in two server actions that need a session; pinned from source so it cannot
  // quietly disappear, the way the onboarding page's step cases are.
  const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
  assert.match(schema, /referralEmailId\s+String\?/, "Account.referralEmailId holds Resend's id");
  const auth = readFileSync(new URL("../src/actions/auth.ts", import.meta.url), "utf8");
  assert.match(auth, /data:\s*\{\s*referralEmailId\s*\}/, "sign-up stores the id the schedule returned");
  const account = readFileSync(new URL("../src/actions/account.ts", import.meta.url), "utf8");
  assert.match(account, /cancelScheduledEmail\(account\.referralEmailId\)/, "deletion cancels the scheduled send");
  assert.ok(account.indexOf("cancelScheduledEmail(") < account.indexOf("prisma.account.delete("), "and does so before the row is gone");
});
