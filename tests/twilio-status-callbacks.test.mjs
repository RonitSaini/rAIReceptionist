import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * Twilio status callbacks answer 204 with no body.
 *
 * Until 2026-09-07 both routes returned `new Response("", { status: 204 })`. A 204 is a
 * null-body status, and the Response constructor throws on a body for one - even an empty string
 * - so every callback did its database work and then answered HTTP 500. Nothing was lost, but
 * Twilio logged an error on every delivery receipt and every call-status update. The guard at the
 * top of each route (Twilio not configured) reaches a 204 without touching the database, which is
 * what this exercises; the credentials are removed after import, because importing the app loads
 * the local .env.
 */

process.env.DATABASE_URL ??= "postgresql://snapshot:snapshot@localhost:5432/snapshot";
process.env.DIRECT_URL ??= process.env.DATABASE_URL;

const form = (params) => new Request("http://localhost/api/twilio/x", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) });

const routes = {
  "message status": [await import("../src/app/api/twilio/sms/status/route.ts"), { MessageSid: "SM1", MessageStatus: "delivered" }],
  "call status": [await import("../src/app/api/twilio/status/route.ts"), { CallSid: "CA1", CallStatus: "completed" }],
};

for (const [name, [route, params]] of Object.entries(routes)) {
  test(`the ${name} callback answers 204 with a null body`, async () => {
    const saved = { sid: process.env.TWILIO_ACCOUNT_SID, token: process.env.TWILIO_AUTH_TOKEN };
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    try {
      const res = await route.POST(form(params));
      assert.equal(res.status, 204);
      assert.equal(res.body, null);
    } finally {
      if (saved.sid) process.env.TWILIO_ACCOUNT_SID = saved.sid;
      if (saved.token) process.env.TWILIO_AUTH_TOKEN = saved.token;
    }
  });
}
