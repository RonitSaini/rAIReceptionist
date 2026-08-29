import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { functionSecret, type RetellCall } from "@/lib/retell";
import { FUNCTION_NAMES, type FunctionName } from "@/lib/agent-config";
import { HANDLERS, type HandlerContext } from "@/lib/call-handlers";
import { findOrCreateCallFromRetell } from "@/lib/calls";
import { retellConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Custom-function endpoint the Retell agent calls mid-conversation.
 * Body: { call: {...}, name: string, args: {...} }. Response JSON is handed back to the LLM.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!retellConfigured()) return NextResponse.json({ success: false, message: "Retell is not configured." }, { status: 503 });

  const provided = req.headers.get("x-callcover-secret") ?? "";
  const expected = functionSecret();
  if (provided.length !== expected.length || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
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
  if (!accountId) return NextResponse.json({ success: false, message: "I couldn't find the restaurant for this call. Take a message instead." });

  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) return NextResponse.json({ success: false, message: "Restaurant not found. Take a message instead." });

  const ctx: HandlerContext = { account, call, callerPhone: call?.callerPhone ?? (rc?.direction === "outbound" ? rc?.to_number : rc?.from_number) ?? null };

  try {
    const result = await HANDLERS[name as FunctionName](ctx, args);
    return NextResponse.json(result);
  } catch (e) {
    console.error(`[retell-function:${name}]`, e);
    return NextResponse.json({ success: false, message: "Something went wrong on our end. Apologize, take the caller's name and number, and promise a call back." });
  }
}
