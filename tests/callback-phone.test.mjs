import { test } from "node:test";
import { requireServer } from "./require-server.mjs";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * The Callbacks-owed card dials whoever the number belongs to, so the number on the Call row must
 * be the caller's OWN callback number. The regression this pins: a caller rings from one line and
 * states a different callback number to take_message — the old code kept the ring-from number
 * (whatever line they borrowed), and the owner dialled the wrong person.
 *
 * Runs against the REAL function webhook on a running dev server (same contract as
 * notifications-poll.test.mjs): seeds its own Call row, invokes take_message over HTTP, reads the
 * row back, cleans up after itself. Its own PrismaClient is pointed at the dev database directly,
 * independent of any fake DATABASE_URL other test files set for the shared singleton.
 */

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
// One clear failure, not seven, when the server is not there (tests/require-server.mjs).
requireServer(BASE);
const here = dirname(fileURLToPath(import.meta.url));

const env = {};
for (const f of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(resolve(here, "..", f), "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?\s*$/);
      if (m && !(m[1] in env)) env[m[1]] = m[2].trim();
    }
  } catch {}
}

const SECRET = env.RETELL_FUNCTION_SECRET || createHmac("sha256", env.RETELL_API_KEY ?? "").update("frontdesk-functions").digest("hex");

test("a stated callback number replaces the ring-from number on the Call", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });

  const RANG_FROM = "+12125550143"; // a line the caller borrowed — NOT where to reach them
  const CALLBACK = "+19175550777"; // the number they asked to be called back on

  const user = await prisma.user.findUnique({ where: { email: "plumbing-test@frontdesk.test" }, select: { accountId: true } });
  assert.ok(user?.accountId, "needs the seeded plumbing-test account");
  const callId = `test_cbphone_${Date.now()}`;

  const call = await prisma.call.create({
    data: { accountId: user.accountId, retellCallId: callId, callerPhone: RANG_FROM, direction: "inbound", callStatus: "ongoing", startedAt: new Date() },
  });

  try {
    const res = await fetch(`${BASE}/api/retell/functions/take_message`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-frontdesk-secret": SECRET },
      body: JSON.stringify({
        call: { call_id: callId, direction: "inbound", from_number: RANG_FROM, metadata: { accountId: user.accountId } },
        name: "take_message",
        args: { caller_name: "Priya Shah", caller_phone: "917-555-0777", message: "Wants a quote for a new boiler", reason: "callback_request", escalate: false },
      }),
    });
    assert.equal(res.status, 200, "take_message must succeed");

    const after = await prisma.call.findUnique({ where: { id: call.id }, select: { callerPhone: true, callbackRequested: true } });
    assert.equal(after.callbackRequested, true);
    assert.equal(after.callerPhone, CALLBACK, "the Callbacks-owed card must show the caller's own callback number, not the line they rang from");
  } finally {
    await prisma.notification.deleteMany({ where: { callId: call.id } });
    await prisma.call.delete({ where: { id: call.id } }).catch(() => {});
    await prisma.$disconnect();
  }
});
