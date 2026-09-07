import { NextResponse, after, type NextRequest } from "next/server";
import type { CallClassification, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyRetellSignature, type RetellWebhookEvent } from "@/lib/retell";
import { findOrCreateCallFromRetell, transcriptText } from "@/lib/calls";
import { CLASSIFICATION_CHOICES } from "@/lib/agent-config";
import { retellConfigured } from "@/lib/env";
import { afterMissedCall } from "@/lib/outcomes";
import { sweepEscalations } from "@/lib/escalations";
import { sweepStaleSms } from "@/lib/sms";
import { billingState } from "@/lib/billing-state";
import { createNotification } from "@/lib/notifications";
import { formatUsPhone } from "@/lib/form";
import { formatTime } from "@/lib/time";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Retell call lifecycle webhook: call_started, call_ended, call_analyzed.
 * Saves recording, transcript, summary and classification on the Call row, notifies missed calls,
 * and kicks the escalation follow-up sweep.
 */
export async function POST(req: NextRequest) {
  if (!retellConfigured()) return NextResponse.json({ error: "Retell not configured" }, { status: 503 });

  const raw = await req.text();
  const skipVerify = process.env.SKIP_WEBHOOK_SIGNATURE_VALIDATION === "true" && process.env.NODE_ENV !== "production";
  if (!skipVerify && !verifyRetellSignature(raw, req.headers.get("x-retell-signature"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: RetellWebhookEvent;
  try {
    event = JSON.parse(raw) as RetellWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const rc = event.call;
  if (!rc?.call_id) return NextResponse.json({ ok: true, ignored: true });

  const call = await findOrCreateCallFromRetell(rc);
  if (!call) return NextResponse.json({ ok: true, ignored: "unknown account" });

  const data: Prisma.CallUpdateInput = {};
  if (rc.telephony_identifier?.twilio_call_sid && !call.twilioCallSid) data.twilioCallSid = rc.telephony_identifier.twilio_call_sid;
  if (rc.start_timestamp) data.startedAt = new Date(rc.start_timestamp);
  if (rc.recording_url) data.recordingUrl = rc.recording_url;
  if (rc.public_log_url) data.publicLogUrl = rc.public_log_url;
  const transcript = transcriptText(rc);
  if (transcript) data.transcript = transcript;

  switch (event.event) {
    case "call_started":
      data.callStatus = "ongoing";
      break;

    case "call_ended": {
      data.callStatus = rc.call_status === "error" ? "error" : "ended";
      const end = rc.end_timestamp ? new Date(rc.end_timestamp) : new Date();
      data.endedAt = end;
      const startMs = rc.start_timestamp ?? call.startedAt.getTime();
      data.duration = rc.duration_ms != null ? Math.round(rc.duration_ms / 1000) : Math.max(0, Math.round((end.getTime() - startMs) / 1000));
      if (rc.disconnection_reason) data.disconnectionReason = rc.disconnection_reason;
      // Nothing was said and the call dropped almost immediately → treat as missed.
      if (!transcript && call.classification === "other" && (data.duration as number) < 8) data.classification = "missed";
      break;
    }

    case "call_analyzed": {
      const analysis = rc.call_analysis;
      if (analysis?.call_summary) data.summary = analysis.call_summary;
      if (analysis?.user_sentiment) data.sentiment = analysis.user_sentiment;
      const custom = analysis?.custom_analysis_data ?? {};
      const cls = typeof custom.classification === "string" ? custom.classification : null;
      if (cls && call.classification === "other" && (CLASSIFICATION_CHOICES as readonly string[]).includes(cls)) data.classification = cls as CallClassification;
      if (typeof custom.caller_name === "string" && custom.caller_name.trim() && !call.callerName) data.callerName = custom.caller_name.trim();
      if (custom.needs_callback === true) data.callbackRequested = true;
      if (call.callStatus !== "ended" && call.callStatus !== "error") data.callStatus = "ended";
      if (!call.endedAt && rc.end_timestamp) data.endedAt = new Date(rc.end_timestamp);
      break;
    }

    default:
      // transcript_updated, transfer_* — not needed.
      return NextResponse.json({ ok: true, ignored: event.event });
  }

  const updated = await prisma.call.update({ where: { id: call.id }, data, include: { account: true } });

  // Missed calls get their own notification (bookings, messages and escalations notify from the function handlers).
  if ((event.event === "call_ended" || event.event === "call_analyzed") && updated.classification === "missed" && !updated.notifiedAt) {
    await afterMissedCall(updated.account, updated);
  }
  // A call fielded in billing-paused mode: the owner is told every time (docs/frontdesk-billing-spec.md
  // §2). Once per call - Retell retries this webhook, and the marker is what keeps it to one.
  if (event.event === "call_ended" && !updated.isTest && !updated.billingPausedNotifiedAt && billingState(updated.account) === "paused") {
    const claimed = await prisma.call.updateMany({ where: { id: updated.id, billingPausedNotifiedAt: null }, data: { billingPausedNotifiedAt: new Date() } });
    if (claimed.count > 0) {
      const who = updated.callerName?.trim() || (updated.callerPhone ? formatUsPhone(updated.callerPhone) : "A caller");
      await createNotification({
        accountId: updated.accountId,
        type: "system",
        priority: "urgent",
        title: `Billing paused: ${who} was taken as a message only`,
        body: `${who} called at ${formatTime(updated.startedAt, updated.account.timeZone)}. ${updated.account.hostName} took their details but could not book anything because the subscription is not active. Reactivate under Settings → Billing to book again.`,
        callId: updated.id,
      });
    }
  }
  // Escalations whose acknowledge window lapsed: text the guest; texts with no receipt for half an
  // hour: recorded as failed and said out loud. Both after the response so Retell is never kept waiting.
  after(() => sweepEscalations().catch((e) => console.error("[escalations] sweep failed", e)));
  after(() => sweepStaleSms().catch((e) => console.error("[sms] stale sweep failed", e)));
  return NextResponse.json({ ok: true });
}
