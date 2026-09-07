import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sweepEscalations } from "@/lib/escalations";
import { retryFailedJobSyncs } from "@/lib/google-calendar";
import { sweepSmsPool, sweepStaleSms } from "@/lib/sms";
import { sweepBilling } from "@/lib/reclamation";

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
 * Scheduled sweep (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`), daily.
 *
 * In order: guests whose escalation went unacknowledged past the window are texted; texts Twilio
 * accepted but the carrier never confirmed inside 30 minutes are failed and said out loud; numbers
 * the A2P sender pool is still owed are attached; billing-paused accounts are told once and, at
 * day 20 and 30 of a lapse, warned and then reclaimed; and any job whose Google Calendar mirror
 * failed is retried. The first two also run after every Retell webhook, which is what keeps their
 * latency at minutes rather than a day on a plan whose cron runs once.
 *
 * Daily is a platform constraint, not a choice to revisit: Vercel Hobby allows one run a day and
 * the deployment stays on Hobby (docs/frontdesk-billing-spec.md §7). Anything that needs to happen
 * sooner than tomorrow has to ride traffic (the after() calls in the Retell webhook) or happen at
 * the moment of its event - never a shorter schedule here, which Vercel rejects at deploy time and
 * blocks every commit behind it.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const timeout = req.nextUrl.searchParams.get("timeoutMinutes");
  const result = await sweepEscalations(timeout ? { timeoutMinutes: Number(timeout) } : {});
  const staleSms = await sweepStaleSms();
  const smsPool = await sweepSmsPool();
  const billing = await sweepBilling();
  const calendarRetries = await retryFailedJobSyncs();
  return NextResponse.json({ ok: true, ...result, staleSms, smsPool, billing, calendarRetries });
}
