import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { escapeXml, parseTwilioForm, publicRequestUrl, twiml, twimlSay, validateTwilioSignature } from "@/lib/twilio";
import { appUrl, twilioConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Keypress from the manager during the escalation call: 1 = acknowledge, 2 = repeat. */
export async function POST(req: NextRequest) {
  if (!twilioConfigured()) return twimlSay("Goodbye.");
  const params = await parseTwilioForm(req);
  const skipVerify = process.env.SKIP_WEBHOOK_SIGNATURE_VALIDATION === "true" && process.env.NODE_ENV !== "production";
  if (!skipVerify && !validateTwilioSignature(publicRequestUrl(req, appUrl()), params, req.headers.get("x-twilio-signature"))) {
    return new Response("Invalid signature", { status: 403 });
  }
  const id = req.nextUrl.searchParams.get("n") ?? "";
  const digit = params.Digits ?? "";

  if (digit === "2") {
    // Replay the alert.
    return twiml(`<Redirect method="POST">${escapeXml(`${appUrl()}/api/twilio/manager-alert?n=${encodeURIComponent(id)}`)}</Redirect>`);
  }
  if (digit === "1") {
    const n = await prisma.notification.findUnique({ where: { id } });
    if (n && !n.acknowledgedAt) {
      const now = new Date();
      await prisma.notification.update({ where: { id }, data: { acknowledgedAt: now, readAt: n.readAt ?? now } });
    }
    return twimlSay("Acknowledged. The caller's details are in the FrontDesk app. Goodbye.");
  }
  return twimlSay("Okay. Please open the FrontDesk app to acknowledge. Goodbye.");
}
