import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { FUNCTION_SECRET_HEADER, LEGACY_FUNCTION_SECRET_HEADER, functionSecretCandidates, type RetellCall } from "@/lib/retell";
import { FUNCTION_NAMES, type FunctionName } from "@/lib/agent-config";
import { HANDLERS, type HandlerContext } from "@/lib/call-handlers";
import { findOrCreateCallFromRetell } from "@/lib/calls";
import { agentFunctionsFor } from "@/verticals";
import { retellConfigured } from "@/lib/env";
import { billingState } from "@/lib/billing-state";

/**
 * What a billing-paused account may not do (docs/frontdesk-billing-spec.md §2): anything that
 * creates a booking, order, visit, work order or dispatch, and the availability lookups that would
 * let the agent offer a time it cannot then book. take_message and the pure lookups stay open -
 * the caller's name and number still have to land somewhere.
 */
const PAUSED_REFUSES: ReadonlySet<string> = new Set([
  "get_available_times",
  "book_reservation",
  "join_waitlist",
  "take_takeout_order",
  "get_available_slots",
  "book_service_call",
  "dispatch_emergency",
  "request_immediate_dispatch",
  "book_appointment",
  "create_work_order",
]);
const PAUSED_MESSAGE =
  "Booking is paused for this business right now, so you cannot book, schedule, order or dispatch anything on this call. Take the caller's name, phone number and what they need, then call take_message with reason \"callback_request\" and tell them someone will call them back. Do not mention billing to the caller.";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Custom-function endpoint the Retell agent calls mid-conversation.
 * Body: { call: {...}, name: string, args: {...} }. Response JSON is handed back to the LLM.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!retellConfigured()) return NextResponse.json({ success: false, message: "Retell is not configured." }, { status: 503 });

  // Accept the pre-rename header and secret too: agents synced before the CallCover -> FrontDesk AI
  // rename keep sending the old pair until their configuration is rebuilt, and a live call must
  // not 401 in the meantime.
  const provided = req.headers.get(FUNCTION_SECRET_HEADER) ?? req.headers.get(LEGACY_FUNCTION_SECRET_HEADER) ?? "";
  const authorized = functionSecretCandidates().some((expected) => provided.length === expected.length && timingSafeEqual(Buffer.from(provided), Buffer.from(expected)));
  if (!authorized) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  if (!(FUNCTION_NAMES as readonly string[]).includes(name)) {
    return NextResponse.json({ success: false, message: `Unknown function ${name}` }, { status: 404 });
  }

  let body: { call?: RetellCall; name?: string; args?: Record<string, unknown> };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON" }, { status: 400 });
  }

  const rc = body.call;
  const args = body.args ?? {};
  const call = rc?.call_id ? await findOrCreateCallFromRetell(rc) : null;
  const metaAccountId = typeof rc?.metadata?.accountId === "string" ? rc.metadata.accountId : null;
  const accountId = call?.accountId ?? metaAccountId;
  if (!accountId) return NextResponse.json({ success: false, message: "I couldn't find the business for this call. Take a message instead." });

  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) return NextResponse.json({ success: false, message: "Business not found. Take a message instead." });

  // Being in the global registry only means the function exists somewhere in the product; it does
  // not mean this account may call it. Without this, a stale agent configuration left over from a
  // vertical change could still reach take_takeout_order on a plumbing account and get restaurant
  // wording back, and a tow company that books nothing could still be sold a Tuesday slot. The
  // agent is only ever offered what it should have; this is the backstop.
  if (!agentFunctionsFor(account).includes(name)) {
    return NextResponse.json({ success: false, message: `That is not something this business does. Take a message instead.` }, { status: 404 });
  }

  // The second layer of billing-paused mode. The prompt already says not to; this is what stops a
  // stale agent configuration, or a model that did not listen, from booking anyway.
  if (PAUSED_REFUSES.has(name) && billingState(account) === "paused") {
    return NextResponse.json({ success: false, message: PAUSED_MESSAGE });
  }

  const ctx: HandlerContext = { account, call, callerPhone: call?.callerPhone ?? (rc?.direction === "outbound" ? rc?.to_number : rc?.from_number) ?? null };

  try {
    const result = await HANDLERS[name as FunctionName](ctx, args);
    return NextResponse.json(result);
  } catch (e) {
    console.error(`[retell-function:${name}]`, e);
    return NextResponse.json({ success: false, message: "Something went wrong on our end. Apologize, take the caller's name and number, and promise a call back." });
  }
}
