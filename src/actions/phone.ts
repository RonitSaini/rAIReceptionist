"use server";

import { accountCountry } from "@/lib/locale";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAccount } from "@/lib/current-account";
import { str, type ActionState } from "@/lib/form";
import { appUrl, appUrlIsPublic, retellConfigured, stripeConfigured, twilioConfigured } from "@/lib/env";
import { subscriptionActive } from "@/lib/billing-ui";
import { createCall, isTrialRestriction, listOwnedNumbers, purchaseNumber, searchAvailableNumbers, updateNumberWebhooks, TwilioError } from "@/lib/twilio";
import { syncRetellAgent } from "@/lib/agent-sync";

function webhookUrls() {
  const base = appUrl();
  return { voiceUrl: `${base}/api/twilio/voice`, smsUrl: `${base}/api/twilio/sms`, statusCallback: `${base}/api/twilio/status` };
}

function areaCodeOf(phone: string | null | undefined): string | undefined {
  const digits = (phone ?? "").replace(/\D/g, "");
  const d = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return d.length === 10 ? d.slice(0, 3) : undefined;
}

/** Step 7: buy a Twilio number, wire its webhooks to us, and make sure the Retell agent exists. */
export async function provisionPhoneNumber(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { account } = await requireAccount();
  if (account.twilioNumber) return { ok: true, message: "You already have a number." };
  // A number costs money every month — only issue one to a paying (or trialing) account. Skipped where Stripe is not set up (local dev).
  if (stripeConfigured() && !subscriptionActive(account)) return { ok: false, error: "An active subscription is needed before a number can be connected. Subscribe under Settings → Billing, then come back here." };
  if (!twilioConfigured() || !retellConfigured()) return { ok: false, error: "Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and RETELL_API_KEY to the environment first." };
  if (!appUrlIsPublic()) return { ok: false, error: `NEXT_PUBLIC_APP_URL must be a public https URL so Twilio and Retell can reach the app (currently ${appUrl()}). Use your Vercel URL or an ngrok tunnel.` };

  const sync = await syncRetellAgent(account.id);
  if (!sync.ok) return { ok: false, error: `Could not create the AI agent: ${sync.error}` };

  const requested = str(fd, "areaCode").replace(/\D/g, "");
  const areaCode = (requested.length === 3 ? requested : undefined) ?? areaCodeOf(account.cellPhone) ?? process.env.TWILIO_DEFAULT_AREA_CODE ?? undefined;
  const friendlyName = `FrontDesk AI · ${account.businessName}`;

  try {
    // 1) A number already on the Twilio account that no restaurant is using yet (e.g. the free trial number).
    const owned = await listOwnedNumbers();
    if (owned.length > 0) {
      const taken = new Set((await prisma.account.findMany({ where: { twilioNumber: { not: null } }, select: { twilioNumber: true } })).map((a) => a.twilioNumber));
      const free = owned.find((n) => !taken.has(n.phoneNumber));
      if (free) {
        await updateNumberWebhooks(free.sid, { ...webhookUrls(), friendlyName });
        await prisma.account.update({ where: { id: account.id }, data: { twilioNumber: free.phoneNumber, twilioNumberSid: free.sid } });
        revalidatePath("/", "layout");
        return { ok: true, message: `Connected your existing Twilio number ${free.phoneNumber}.` };
      }
    }

    // 2) Otherwise buy a new local number.
    const candidates = await searchAvailableNumbers(areaCode, 5, accountCountry(account));
    if (candidates.length === 0) return { ok: false, error: "No numbers are available right now. Try a different area code." };

    let purchased: { sid: string; phoneNumber: string } | null = null;
    let lastError = "";
    for (const c of candidates) {
      try {
        purchased = await purchaseNumber(c.phoneNumber, { ...webhookUrls(), friendlyName });
        break;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e); // number may have just been taken — try the next one
      }
    }
    if (!purchased) return { ok: false, error: `Could not purchase a number: ${lastError}` };

    await prisma.account.update({ where: { id: account.id }, data: { twilioNumber: purchased.phoneNumber, twilioNumberSid: purchased.sid } });
    revalidatePath("/", "layout");
    return { ok: true, message: `Your number is ready: ${purchased.phoneNumber}` };
  } catch (e) {
    if (isTrialRestriction(e)) {
      return {
        ok: false,
        error:
          "Your Twilio account is still on the free trial, which can't buy numbers through the API. Either upgrade the account (Twilio Console → Billing → add a payment method), or claim the free trial number in the Console (Phone Numbers → Buy a number) and click Get my number again — we'll connect it automatically.",
      };
    }
    const msg = e instanceof TwilioError ? `Twilio: ${e.message}` : e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

/** Re-point an existing number's webhooks at the current app URL (after moving to Vercel, for example). */
export async function repairNumberWebhooks(): Promise<ActionState> {
  const { account } = await requireAccount();
  if (!account.twilioNumberSid) return { ok: false, error: "No number to update." };
  if (!twilioConfigured()) return { ok: false, error: "Twilio is not configured." };
  try {
    await updateNumberWebhooks(account.twilioNumberSid, { ...webhookUrls(), friendlyName: `FrontDesk AI · ${account.businessName}` });
    return { ok: true, message: "Webhooks updated." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Rebuild the Retell agent from the current settings (also runs automatically after settings changes). */
export async function syncAgentNow(): Promise<ActionState> {
  const { account } = await requireAccount();
  const r = await syncRetellAgent(account.id);
  revalidatePath("/", "layout");
  return r.ok ? { ok: true, message: `AI host updated (voice ${r.voiceId}).` } : { ok: false, error: r.error };
}

/** "Call me to test": ring the owner's cell from the restaurant's number and connect them to the AI host. */
export async function placeTestCall(): Promise<ActionState> {
  const { account } = await requireAccount();
  if (!account.twilioNumber) return { ok: false, error: "Get your number first." };
  if (!account.cellPhone) return { ok: false, error: "Add your cell phone in Business basics first." };
  if (!account.retellAgentId) {
    const sync = await syncRetellAgent(account.id);
    if (!sync.ok) return { ok: false, error: `AI host isn't ready: ${sync.error}` };
  }
  if (!appUrlIsPublic()) return { ok: false, error: `NEXT_PUBLIC_APP_URL must be a public https URL (currently ${appUrl()}).` };
  try {
    const base = appUrl();
    const url = `${base}/api/twilio/voice?test=1&accountId=${encodeURIComponent(account.id)}`;
    await createCall({ to: account.cellPhone, from: account.twilioNumber, url, statusCallback: `${base}/api/twilio/status`, timeoutSeconds: 30 });
    return { ok: true, message: `Calling ${account.cellPhone} now. Pick up to talk to ${account.hostName}.` };
  } catch (e) {
    return { ok: false, error: e instanceof TwilioError ? `Twilio: ${e.message}` : e instanceof Error ? e.message : String(e) };
  }
}
