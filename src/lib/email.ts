import type { Vertical } from "@prisma/client";
import { appUrl, isProductionDeployment } from "./env";
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

/**
 * Where an outbound email actually goes, given where the code is running.
 *
 * Only production talks to real people. Everywhere else - a laptop, a preview deployment, a
 * `next start` build on port 3000 - every message is redirected to one developer inbox
 * (DEV_EMAIL_INBOX) with the real recipient written into the subject. Redirected rather than
 * refused: a refused send is nothing, and nothing looks exactly like success from the outside,
 * which is how three test signups mailed strangers on the night of 2026-09-06. A redirected send
 * is the whole email, verification link included, in an inbox you can open. With no DEV_EMAIL_INBOX
 * set, a non-production send is refused and logged: no configuration, nothing leaves.
 *
 * Pure - the environment is passed in - so the rule is testable without Resend.
 */
export function routeOutbound(
  to: string,
  subject: string,
  env: { production: boolean; devInbox?: string | null } = { production: isProductionDeployment(), devInbox: process.env.DEV_EMAIL_INBOX },
): { to: string; subject: string } | null {
  if (env.production) return { to, subject };
  const inbox = env.devInbox?.trim();
  if (!inbox) return null;
  return { to: inbox, subject: `[to: ${to}] ${subject}` };
}

async function sendEmail(to: string, subject: string, html: string, text: string, opts?: { scheduledAt?: Date }): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const route = routeOutbound(to, subject);
  if (!route) {
    console.warn(`[email] not production and DEV_EMAIL_INBOX is unset - refusing to send "${subject}" to ${to}`);
    return;
  }
  if (route.to !== to) console.warn(`[email] not production - redirecting "${subject}" for ${to} to ${route.to}`);
  ({ to, subject } = route);
  const from = process.env.RESEND_FROM || "FrontDesk AI <onboarding@resend.dev>";
  const replyTo = process.env.RESEND_REPLY_TO || undefined;

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
      text,
      ...(replyTo ? { reply_to: [replyTo] } : {}),
      // Resend holds and delivers it at this moment — the delay costs no compute of ours.
      ...(opts?.scheduledAt ? { scheduled_at: opts.scheduledAt.toISOString() } : {}),
    }),
  });
  if (!res.ok) {
    // A failed welcome email must never surface as a failed sign-up; log and move on.
    console.error(`[email] Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * The verification link (src/lib/email-verification.ts). Short on purpose: one sentence of why, one
 * button, one line for the person who never signed up. The welcome email carries the warmth.
 */
export async function sendVerificationEmail(to: string, businessName: string, url: string): Promise<void> {
  const name = businessName.trim() || "your business";
  const subject = "Confirm your email for FrontDesk AI";
  const text = [
    `Confirm this is the right address for ${name}'s FrontDesk AI account, so we can reach you about your calls, bookings and billing:`,
    ``,
    url,
    ``,
    `The link works for 48 hours. If you didn't create a FrontDesk AI account, ignore this email - nothing happens without the click.`,
    ``,
    `— The FrontDesk AI team`,
  ].join("\n");
  const html = `
  <div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1a2b3c;">
    <h1 style="font-size:22px;margin:0 0 16px;">Confirm your email</h1>
    <p style="font-size:15px;line-height:1.6;margin:0 0 20px;">
      Confirm this is the right address for <strong>${esc(name)}</strong>'s FrontDesk AI account, so we can reach you about your calls, bookings and billing.
    </p>
    <p style="margin:0 0 24px;">
      <a href="${url}" style="display:inline-block;background:#176f57;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;">Confirm email</a>
    </p>
    <p style="font-size:13px;color:#6b7c8c;line-height:1.6;margin:0;">
      The link works for 48 hours. If you didn't create a FrontDesk AI account, ignore this email - nothing happens without the click.
    </p>
  </div>`;
  await sendEmail(to, subject, html, text);
}

/**
 * The one email billing enforcement sends: the number is gone (docs/frontdesk-billing-spec.md).
 *
 * Email rather than only an in-app notification, deliberately. An owner who stopped paying a month
 * ago has probably stopped opening the app; the fact that callers now get a dead number has to
 * reach them where they still look.
 */
export async function sendNumberReleasedEmail(to: string, businessName: string, number: string): Promise<void> {
  const url = appUrl();
  const name = businessName.trim() || "your business";
  const subject = `Your FrontDesk AI number ${number} has been released`;
  const text = [
    `Hi,`,
    ``,
    `Your FrontDesk AI subscription for ${name} ended more than 30 days ago, so the phone number ${number} has been released today. Calls to it will no longer be answered.`,
    ``,
    `If you had forwarded your business line to it, turn that forwarding off now (dial *73 on most carriers) so your callers reach you again.`,
    ``,
    `To come back, re-subscribe at ${url}/settings?tab=billing and we will issue a new number right away. The old number cannot be reclaimed.`,
    ``,
    `Questions? Just reply to this email - a real person reads it.`,
    ``,
    `— The FrontDesk AI team`,
  ].join("\n");
  const html = `
  <div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1a2b3c;">
    <h1 style="font-size:22px;margin:0 0 16px;">Your number ${esc(number)} has been released</h1>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">
      Your FrontDesk AI subscription for <strong>${esc(name)}</strong> ended more than 30 days ago, so the phone number
      <strong>${esc(number)}</strong> has been released today. Calls to it will no longer be answered.
    </p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">
      If you had forwarded your business line to it, turn that forwarding off now (dial <strong>*73</strong> on most carriers)
      so your callers reach you again.
    </p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 24px;">
      To come back, <a href="${url}/settings?tab=billing" style="color:#176f57;font-weight:600;">re-subscribe</a> and we will issue a new number right away. The old number cannot be reclaimed.
    </p>
    <p style="font-size:13px;color:#6b7c8c;margin:0;">Questions? Just reply to this email - a real person reads it.</p>
  </div>`;
  await sendEmail(to, subject, html, text);
}

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

/**
 * The referral follow-up, scheduled 20 minutes behind the welcome so the inbox reads as a
 * conversation rather than a pile. Scheduled through Resend itself (`scheduled_at`) — nothing on
 * our side has to wake up to send it, which matters on serverless.
 */
export async function sendReferralEmail(to: string, businessName: string, code: string, delayMinutes = 20): Promise<void> {
  const url = appUrl();
  const name = businessName.trim() || "your business";
  const shareUrl = `${url}/signup?ref=${code}`;
  const referralPage = `${url}/settings?tab=billing`;

  const subject = `Give $100, get $100 — ${name}'s referral code inside`;

  const text = [
    `One more thing before you go!`,
    ``,
    `${name} has its own referral code: ${code}`,
    ``,
    `Know another business owner tired of missing calls? When they sign up with your code, you BOTH get $100 off — theirs off their first month, yours off your next one.`,
    ``,
    `Share this link and the code fills itself in: ${shareUrl}`,
    ``,
    `View your referral code any time: ${referralPage}`,
    ``,
    `— The FrontDesk AI team`,
  ].join("\n");

  const html = `
  <div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1a2b3c;">
    <h1 style="font-size:22px;margin:0 0 16px;">Give $100, get $100 💸</h1>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">
      Know another business owner tired of missing calls? When they sign up with <strong>${esc(name)}</strong>'s code,
      you <strong>both</strong> get $100 off — theirs off their first month, yours off your next one.
    </p>
    <div style="background:#f2f7f6;border:1px dashed #0f766e;border-radius:12px;padding:18px 16px;text-align:center;margin:0 0 16px;">
      <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#4b5c6b;margin:0 0 6px;">Your referral code</p>
      <p style="font-family:ui-monospace,'SF Mono',Consolas,Menlo,monospace;font-size:28px;font-weight:700;letter-spacing:.18em;color:#0f766e;margin:0;">${esc(code)}</p>
    </div>
    <p style="font-size:14px;line-height:1.6;color:#4b5c6b;margin:0 0 24px;">
      Or share this link and the code fills itself in:<br/>
      <a href="${esc(shareUrl)}" style="color:#0f766e;word-break:break-all;">${esc(shareUrl)}</a>
    </p>
    <p style="margin:0 0 24px;">
      <a href="${esc(referralPage)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px;">View Referral Code</a>
    </p>
    <p style="font-size:14px;line-height:1.6;color:#4b5c6b;margin:0;">— The FrontDesk AI team</p>
  </div>`;

  await sendEmail(to, subject, html, text, { scheduledAt: new Date(Date.now() + delayMinutes * 60_000) });
}
