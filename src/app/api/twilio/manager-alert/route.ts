import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { escapeXml, parseTwilioForm, publicRequestUrl, twiml, twimlSay, validateTwilioSignature } from "@/lib/twilio";
import { appUrl, twilioConfigured } from "@/lib/env";
import { formatUsPhone } from "@/lib/form";
import { reasonLabel } from "@/lib/outcomes";

export const dynamic = "force-dynamic";

/** Spoken to the manager when the escalation call connects (also used by the repeat option). */
async function alertScript(notificationId: string): Promise<{ text: string; acknowledged: boolean } | null> {
  const n = await prisma.notification.findUnique({ where: { id: notificationId }, include: { account: true, call: true } });
  if (!n) return null;
  const c = n.call;
  const who = c?.callerName && c.callerName !== "Unknown caller" ? c.callerName : "a caller";
  const phone = c?.callerPhone ? formatUsPhone(c.callerPhone).replace(/\D/g, "").split("").join(" ") : null;
  const msg = c?.messageText ? c.messageText.replace(/^[a-z_]+:\s*/i, "").replace(/\s*\(call back.*\)$/i, "") : "";
  const text = [
    `This is FrontDesk AI for ${n.account.restaurantName}.`,
    `A caller needs a manager. Reason: ${reasonLabel(c?.escalationReason)}.`,
    `${who}${phone ? `, at ${phone}` : ""}.`,
    msg ? `They said: ${msg}.` : "",
    n.acknowledgedAt ? "This has already been acknowledged in the app." : `${n.account.hostName} promised a call back within 15 minutes.`,
  ]
    .filter(Boolean)
    .join(" ");
  return { text, acknowledged: !!n.acknowledgedAt };
}

/** Twilio fetches this TwiML when the manager answers the outbound escalation call. */
export async function POST(req: NextRequest) {
  if (!twilioConfigured()) return twimlSay("Goodbye.");
  const params = await parseTwilioForm(req);
  const skipVerify = process.env.SKIP_WEBHOOK_SIGNATURE_VALIDATION === "true" && process.env.NODE_ENV !== "production";
  if (!skipVerify && !validateTwilioSignature(publicRequestUrl(req, appUrl()), params, req.headers.get("x-twilio-signature"))) {
    return new Response("Invalid signature", { status: 403 });
  }
  const id = req.nextUrl.searchParams.get("n") ?? "";
  const script = await alertScript(id);
  if (!script) return twimlSay("This alert is no longer available. Goodbye.");

  const ackUrl = `${appUrl()}/api/twilio/manager-alert/ack?n=${encodeURIComponent(id)}`;
  return twiml(
    `<Gather numDigits="1" action="${escapeXml(ackUrl)}" method="POST" timeout="6">` +
      `<Say voice="Polly.Joanna">${escapeXml(script.text)} ${script.acknowledged ? "Press any key to hang up." : "Press 1 to acknowledge now, or 2 to hear this again. Then open the FrontDesk app to call them back."}</Say>` +
      `</Gather>` +
      `<Say voice="Polly.Joanna">No key pressed. Please open the FrontDesk app. Goodbye.</Say>`,
  );
}
