import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseTwilioForm, publicRequestUrl, validateTwilioSignature } from "@/lib/twilio";
import { appUrl, twilioConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Twilio call status callback. Catches calls that never reached Retell (busy, failed, no answer)
 * so they don't sit as "ongoing" forever, and records them as missed.
 */
export async function POST(req: NextRequest) {
  if (!twilioConfigured()) return new Response("", { status: 204 });
  const params = await parseTwilioForm(req);
  const skipVerify = process.env.SKIP_WEBHOOK_SIGNATURE_VALIDATION === "true" && process.env.NODE_ENV !== "production";
  if (!skipVerify && !validateTwilioSignature(publicRequestUrl(req, appUrl()), params, req.headers.get("x-twilio-signature"))) {
    return new Response("Invalid signature", { status: 403 });
  }

  const sid = params.CallSid;
  const status = params.CallStatus;
  if (!sid || !status) return new Response("", { status: 204 });

  const call = await prisma.call.findUnique({ where: { twilioCallSid: sid } });
  if (!call || call.callStatus === "ended") return new Response("", { status: 204 });

  if (["busy", "failed", "no-answer", "canceled"].includes(status)) {
    await prisma.call.update({
      where: { id: call.id },
      data: { callStatus: "error", endedAt: new Date(), disconnectionReason: `twilio_${status}`, classification: call.classification === "other" ? "missed" : undefined },
    });
  } else if (status === "completed" && call.callStatus !== "ended") {
    const duration = params.CallDuration ? Number.parseInt(params.CallDuration, 10) : undefined;
    // Retell's call_ended usually arrives too; this just guarantees the row is closed.
    await prisma.call.update({ where: { id: call.id }, data: { callStatus: "ended", endedAt: new Date(), ...(Number.isFinite(duration) ? { duration } : {}) } });
  }
  return new Response("", { status: 204 });
}
