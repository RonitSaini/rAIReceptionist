import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sweepEscalations } from "@/lib/escalations";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : (req.nextUrl.searchParams.get("secret") ?? "");
  return provided.length === secret.length && timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
}

/**
 * Scheduled sweep (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`).
 * Texts guests whose escalation went unacknowledged past the window. Also runs after every Retell webhook.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const timeout = req.nextUrl.searchParams.get("timeoutMinutes");
  const result = await sweepEscalations(timeout ? { timeoutMinutes: Number(timeout) } : {});
  return NextResponse.json({ ok: true, ...result });
}
