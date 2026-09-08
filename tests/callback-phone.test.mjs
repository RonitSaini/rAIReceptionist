import { test } from "node:test";
import { requireServer } from "./require-server.mjs";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createFixture, env } from "./dev-fixture.mjs";

/**
 * The Callbacks-owed card dials whoever the number belongs to, so the number on the Call row must
 * be the caller's OWN callback number. The regression this pins: a caller rings from one line and
 * states a different callback number to take_message — the old code kept the ring-from number
 * (whatever line they borrowed), and the owner dialled the wrong person.
 *
 * Runs against the REAL function webhook on a running dev server (same contract as
 * notifications-poll.test.mjs): creates its own throwaway account (tests/dev-fixture.mjs), seeds a
 * Call row on it, invokes take_message over HTTP, reads the row back, removes everything after.
 */

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
// One clear failure, not seven, when the server is not there (tests/require-server.mjs).
requireServer(BASE);

const SECRET = env.RETELL_FUNCTION_SECRET || createHmac("sha256", env.RETELL_API_KEY ?? "").update("frontdesk-functions").digest("hex");

test("a stated callback number replaces the ring-from number on the Call", async () => {
  const fixture = await createFixture();
  const { prisma, account } = fixture;

  const RANG_FROM = "+12125550143"; // a line the caller borrowed — NOT where to reach them
  const CALLBACK = "+19175550777"; // the number they asked to be called back on
  const callId = `test_cbphone_${Date.now()}`;

  try {
    const call = await prisma.call.create({
      data: { accountId: account.id, retellCallId: callId, callerPhone: RANG_FROM, direction: "inbound", callStatus: "ongoing", startedAt: new Date() },
    });
    const res = await fetch(`${BASE}/api/retell/functions/take_message`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-frontdesk-secret": SECRET },
      body: JSON.stringify({
        call: { call_id: callId, direction: "inbound", from_number: RANG_FROM, metadata: { accountId: account.id } },
        name: "take_message",
        args: { caller_name: "Priya Shah", caller_phone: "917-555-0777", message: "Wants a quote for a new boiler", reason: "callback_request", escalate: false },
      }),
    });
    assert.equal(res.status, 200, "take_message must succeed");

    const after = await prisma.call.findUnique({ where: { id: call.id }, select: { callerPhone: true, callbackRequested: true } });
    assert.equal(after.callbackRequested, true);
    assert.equal(after.callerPhone, CALLBACK, "the Callbacks-owed card must show the caller's own callback number, not the line they rang from");
  } finally {
    await fixture.remove(); // the account cascades to its calls and notifications
  }
});
