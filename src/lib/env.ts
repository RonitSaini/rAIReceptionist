/** Small helpers around environment configuration for the integrations. */

export function appUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  return raw.replace(/\/+$/, "");
}

export function twilioConfigured(): boolean {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
}

export function retellConfigured(): boolean {
  return !!process.env.RETELL_API_KEY;
}

/** Both integrations present — the phone number can be provisioned and wired to an agent. */
export function phoneStackConfigured(): boolean {
  return twilioConfigured() && retellConfigured();
}

/** Webhook endpoints are only reachable over a public URL (Vercel, or a tunnel like ngrok in dev). */
export function appUrlIsPublic(): boolean {
  const u = appUrl();
  return !/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(u) && u.startsWith("https://");
}
