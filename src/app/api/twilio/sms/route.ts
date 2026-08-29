import type { NextRequest } from "next/server";
import { parseTwilioForm, publicRequestUrl, twiml, validateTwilioSignature } from "@/lib/twilio";
import { appUrl, twilioConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Inbound SMS to a restaurant's number. Phase 3 handles guest "CANCEL" replies here.
 * For now we validate and acknowledge with an empty response (no auto-reply).
 */
export async function POST(req: NextRequest) {
  if (!twilioConfigured()) return twiml("");
  const params = await parseTwilioForm(req);
  const skipVerify = process.env.SKIP_WEBHOOK_SIGNATURE_VALIDATION === "true" && process.env.NODE_ENV !== "production";
  if (!skipVerify && !validateTwilioSignature(publicRequestUrl(req, appUrl()), params, req.headers.get("x-twilio-signature"))) {
    return new Response("Invalid signature", { status: 403 });
  }
  // TODO(phase3): look up the guest's upcoming reservation by From/To and cancel on "CANCEL".
  return twiml("");
}
