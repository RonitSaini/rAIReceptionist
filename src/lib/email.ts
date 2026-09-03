import type { Vertical } from "@prisma/client";
import { appUrl } from "./env";
import { vocabularyFor } from "@/verticals";

/**
 * Transactional email via Resend's plain HTTPS API — no SDK, keeping within the repo's
 * dependency rule. Everything is optional by configuration: no RESEND_API_KEY means every send
 * quietly no-ops, the same contract the app has with Twilio and Stripe.
 *
 * Until a domain is verified in Resend, the default sender (onboarding@resend.dev) only delivers
 * to the Resend account's own email — fine for testing, silent for real customers. Set RESEND_FROM
 * to an address on the verified domain to go live; RESEND_REPLY_TO points replies at a real inbox.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export const resendConfigured = () => Boolean(process.env.RESEND_API_KEY);

async function sendEmail(to: string, subject: string, html: string, text: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const from = process.env.RESEND_FROM || "FrontDesk AI <onboarding@resend.dev>";
  const replyTo = process.env.RESEND_REPLY_TO || undefined;

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html, text, ...(replyTo ? { reply_to: [replyTo] } : {}) }),
  });
  if (!res.ok) {
    // A failed welcome email must never surface as a failed sign-up; log and move on.
    console.error(`[email] Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The warm hello a brand-new account gets, written for the owner who just signed up. */
export async function sendWelcomeEmail(to: string, businessName: string, vertical: Vertical): Promise<void> {
  const words = vocabularyFor(vertical);
  const url = appUrl();
  const name = businessName.trim() || "your business";

  const subject = `Welcome to FrontDesk AI — let's get ${name}'s phone answered`;

  const text = [
    `Welcome to FrontDesk AI!`,
    ``,
    `You're a few minutes away from an AI receptionist that answers ${name}'s phone around the clock — booking ${words.booking.many}, handling emergencies, and texting confirmations while you work.`,
    ``,
    `Here's what happens next:`,
    `1. Finish setup — hours, services, and what counts as an emergency`,
    `2. Pick a voice and greeting you like`,
    `3. Get your business number and make a test call to hear it live`,
    ``,
    `My Account: ${url}/dashboard`,
    ``,
    `Everything can be changed later in Settings, so don't overthink the first pass.`,
    ``,
    `Questions? Just reply to this email — a real person reads it.`,
    ``,
    `— The FrontDesk AI team`,
  ].join("\n");

  const html = `
  <div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1a2b3c;">
    <h1 style="font-size:22px;margin:0 0 16px;">Welcome to FrontDesk AI 👋</h1>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">
      You're a few minutes away from an AI receptionist that answers <strong>${esc(name)}</strong>'s phone around the clock —
      booking ${esc(words.booking.many)}, handling emergencies, and texting confirmations while you work.
    </p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 8px;"><strong>Here's what happens next:</strong></p>
    <ol style="font-size:15px;line-height:1.8;margin:0 0 20px;padding-left:22px;">
      <li>Finish setup — your hours, services, and what counts as an emergency</li>
      <li>Pick a voice and greeting you like</li>
      <li>Get your business number and make a test call to hear it live</li>
    </ol>
    <p style="margin:0 0 24px;">
      <a href="${esc(url)}/dashboard" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px;">My Account</a>
    </p>
    <p style="font-size:14px;line-height:1.6;color:#4b5c6b;margin:0 0 16px;">
      Everything can be changed later in Settings, so don't overthink the first pass.
    </p>
    <p style="font-size:14px;line-height:1.6;color:#4b5c6b;margin:0;">
      Questions? Just reply to this email — a real person reads it.<br/>— The FrontDesk AI team
    </p>
  </div>`;

  await sendEmail(to, subject, html, text);
}
