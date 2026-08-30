import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { constructWebhookEvent, type StripeWebhookEvent } from "@/lib/stripe";
import { handleStripeEvent } from "@/lib/billing";
import { stripeConfigured, stripeWebhookConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Stripe webhook. Subscribe this endpoint (https://<app>/api/stripe/webhook) to:
 *   checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed,
 *   customer.subscription.created, customer.subscription.updated, customer.subscription.deleted,
 *   invoice.paid, invoice.payment_failed, invoice.payment_action_required
 *
 * Signature-verified against the raw body; every event id is recorded first so a redelivery is
 * acknowledged without re-running side effects. A handler failure returns 500 so Stripe retries.
 * Not behind src/proxy.ts on purpose — Stripe has no session cookie.
 */
export async function POST(req: NextRequest) {
  if (!stripeConfigured() || !stripeWebhookConfigured()) return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });

  // The SDK verifies the HMAC (constant-time), enforces the 5-minute replay window and parses the JSON.
  const raw = await req.text();
  let event: StripeWebhookEvent;
  try {
    event = constructWebhookEvent(raw, req.headers.get("stripe-signature"));
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  if (!event?.id || !event.type || !event.data?.object) return NextResponse.json({ error: "Malformed event" }, { status: 400 });

  // INSERT … ON CONFLICT DO NOTHING: a redelivered id inserts 0 rows and is acknowledged without side effects.
  const { count } = await prisma.stripeEvent.createMany({ data: { id: event.id, type: event.type }, skipDuplicates: true });
  if (count === 0) return NextResponse.json({ ok: true, duplicate: true });

  try {
    await handleStripeEvent(event);
  } catch (e) {
    console.error(`[stripe-webhook] ${event.type} ${event.id} failed:`, e instanceof Error ? e.message : e);
    // Forget the id so the retry Stripe is about to make isn't treated as a duplicate.
    await prisma.stripeEvent.delete({ where: { id: event.id } }).catch(() => {});
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
