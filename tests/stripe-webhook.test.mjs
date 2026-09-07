/**
 * Stripe webhook: unsigned, tampered or stale requests are rejected; a signed event is processed once
 * and Stripe's redelivery of the same event id is acknowledged as a duplicate.
 *
 * Signatures come from the SDK's own `generateTestHeaderString`; the route verifies them with the
 * SDK's `constructEvent`, so this exercises the real verifier, not a re-implementation.
 *
 * Hits a RUNNING server:  BASE_URL=http://localhost:3000 npm test
 * Needs STRIPE_WEBHOOK_SECRET (from the environment or .env) — the whole file is skipped without it.
 */
import test from "node:test";
import { requireServer } from "./require-server.mjs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import Stripe from "stripe";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
// One clear failure, not seven, when the server is not there (tests/require-server.mjs).
requireServer(BASE);

function webhookSecret() {
  if (process.env.STRIPE_WEBHOOK_SECRET) return process.env.STRIPE_WEBHOOK_SECRET;
  try {
    const m = /^STRIPE_WEBHOOK_SECRET="?([^"\r\n]*)"?/m.exec(readFileSync(".env", "utf8"));
    return m?.[1] || null;
  } catch {
    return null;
  }
}

const SECRET = webhookSecret();
const skip = SECRET ? false : "STRIPE_WEBHOOK_SECRET not set";

// Signing needs no API key; the placeholder never reaches Stripe.
const { webhooks } = new Stripe("sk_test_signing_only");
const sign = (payload, timestamp = Math.floor(Date.now() / 1000)) => webhooks.generateTestHeaderString({ payload, secret: SECRET, timestamp });

const post = (body, signature) =>
  fetch(`${BASE}/api/stripe/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(signature ? { "stripe-signature": signature } : {}) },
    body,
  });

const fakeEvent = () =>
  JSON.stringify({
    id: `evt_test_${randomUUID().replace(/-/g, "")}`,
    object: "event",
    type: "frontdesk.test", // not a type the handler acts on — exercises verify + dedupe only
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    api_version: null,
    data: { object: { object: "test" } },
  });

test("unsigned webhook is rejected", { skip }, async () => {
  const res = await post(fakeEvent());
  assert.equal(res.status, 400);
});

test("tampered body is rejected", { skip }, async () => {
  const body = fakeEvent();
  const res = await post(body.replace("frontdesk.test", "frontdesk.evil"), sign(body));
  assert.equal(res.status, 400);
});

test("stale timestamp is rejected (replay protection)", { skip }, async () => {
  const body = fakeEvent();
  const res = await post(body, sign(body, Math.floor(Date.now() / 1000) - 3600));
  assert.equal(res.status, 400);
});

test("signed event is accepted once; redelivery is acknowledged as a duplicate", { skip }, async () => {
  const body = fakeEvent();
  const first = await post(body, sign(body));
  assert.equal(first.status, 200, await first.clone().text());
  assert.equal((await first.json()).duplicate, undefined);

  const again = await post(body, sign(body));
  assert.equal(again.status, 200);
  assert.equal((await again.json()).duplicate, true);
});
