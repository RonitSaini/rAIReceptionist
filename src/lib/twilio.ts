import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Minimal Twilio REST client using fetch (no SDK dependency).
 * Covers: number search, purchase, webhook updates, outbound calls, SMS, request validation, TwiML.
 */

const API = "https://api.twilio.com/2010-04-01";

function creds() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("Twilio is not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN).");
  return { sid, token, auth: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64") };
}

export class TwilioError extends Error {
  status: number;
  code?: number;
  constructor(message: string, status: number, code?: number) {
    super(message);
    this.name = "TwilioError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(method: "GET" | "POST" | "DELETE", path: string, params?: Record<string, string | undefined>): Promise<T> {
  const { sid } = creds();
  return call<T>(method, `${API}/Accounts/${sid}${path}`, params);
}

/** The Messaging API lives on its own host and is not scoped under the account path. */
const MESSAGING_API = "https://messaging.twilio.com/v1";

function messagingRequest<T>(method: "GET" | "POST" | "DELETE", path: string, params?: Record<string, string | undefined>): Promise<T> {
  return call<T>(method, `${MESSAGING_API}${path}`, params);
}

async function call<T>(method: "GET" | "POST" | "DELETE", url: string, params?: Record<string, string | undefined>): Promise<T> {
  const { auth } = creds();
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined && v !== "") body.set(k, v);
  const init: RequestInit = { method, headers: { Authorization: auth } };
  if (method === "GET") {
    const q = body.toString();
    if (q) url += `?${q}`;
  } else if (method === "POST") {
    init.body = body;
    (init.headers as Record<string, string>)["Content-Type"] = "application/x-www-form-urlencoded";
  }
  const res = await fetch(url, init);
  const text = await res.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) throw new TwilioError((data.message as string) || `Twilio request failed (${res.status})`, res.status, data.code as number | undefined);
  return data as T;
}

// ---------- Phone numbers ----------

export type AvailableNumber = { phoneNumber: string; friendlyName: string; locality?: string; region?: string };

/** Find purchasable local numbers in the restaurant's country (US or CA), optionally in an area code. */
export async function searchAvailableNumbers(areaCode?: string, limit = 5, country: "US" | "CA" = "US"): Promise<AvailableNumber[]> {
  type Row = { phone_number: string; friendly_name: string; locality?: string; region?: string };
  const params: Record<string, string> = { VoiceEnabled: "true", SmsEnabled: "true", PageSize: String(limit) };
  if (areaCode && /^\d{3}$/.test(areaCode)) params.AreaCode = areaCode;
  let data = await request<{ available_phone_numbers: Row[] }>("GET", `/AvailablePhoneNumbers/${country}/Local.json`, params);
  if (data.available_phone_numbers.length === 0 && params.AreaCode) {
    delete params.AreaCode;
    data = await request<{ available_phone_numbers: Row[] }>("GET", `/AvailablePhoneNumbers/${country}/Local.json`, params);
  }
  return data.available_phone_numbers.map((n) => ({ phoneNumber: n.phone_number, friendlyName: n.friendly_name, locality: n.locality, region: n.region }));
}

export type PurchasedNumber = { sid: string; phoneNumber: string };

export type OwnedNumber = { sid: string; phoneNumber: string; friendlyName: string; voiceUrl: string | null };

/** Numbers already on the Twilio account (e.g. the free trial number claimed in the console). */
export async function listOwnedNumbers(): Promise<OwnedNumber[]> {
  type Row = { sid: string; phone_number: string; friendly_name: string; voice_url: string | null };
  const data = await request<{ incoming_phone_numbers: Row[] }>("GET", "/IncomingPhoneNumbers.json", { PageSize: "50" });
  return data.incoming_phone_numbers.map((n) => ({ sid: n.sid, phoneNumber: n.phone_number, friendlyName: n.friendly_name, voiceUrl: n.voice_url }));
}

/** Twilio's trial-account restriction surfaces as a 401 with this message on number search/purchase. */
export function isTrialRestriction(e: unknown): boolean {
  return e instanceof TwilioError && /trial account/i.test(e.message);
}

export async function getAccountType(): Promise<"Trial" | "Full" | "Unknown"> {
  const data = await request<{ type?: string }>("GET", ".json");
  return data.type === "Trial" ? "Trial" : data.type === "Full" ? "Full" : "Unknown";
}

/** Buy a number and point its voice + SMS webhooks at the app. */
export async function purchaseNumber(phoneNumber: string, opts: { voiceUrl: string; smsUrl: string; friendlyName: string; statusCallback?: string }): Promise<PurchasedNumber> {
  const data = await request<{ sid: string; phone_number: string }>("POST", "/IncomingPhoneNumbers.json", {
    PhoneNumber: phoneNumber,
    FriendlyName: opts.friendlyName.slice(0, 64),
    VoiceUrl: opts.voiceUrl,
    VoiceMethod: "POST",
    SmsUrl: opts.smsUrl,
    SmsMethod: "POST",
    StatusCallback: opts.statusCallback,
    StatusCallbackMethod: "POST",
  });
  return { sid: data.sid, phoneNumber: data.phone_number };
}

export async function updateNumberWebhooks(numberSid: string, opts: { voiceUrl: string; smsUrl: string; friendlyName?: string; statusCallback?: string }): Promise<void> {
  await request("POST", `/IncomingPhoneNumbers/${numberSid}.json`, {
    VoiceUrl: opts.voiceUrl,
    VoiceMethod: "POST",
    SmsUrl: opts.smsUrl,
    SmsMethod: "POST",
    FriendlyName: opts.friendlyName?.slice(0, 64),
    StatusCallback: opts.statusCallback,
    StatusCallbackMethod: "POST",
  });
}

export async function releaseNumber(numberSid: string): Promise<void> {
  await request("DELETE", `/IncomingPhoneNumbers/${numberSid}.json`);
}

// ---------- A2P 10DLC: the Messaging Service sender pool ----------

/**
 * The one Messaging Service every customer number belongs to (docs/frontdesk-sms-spec.md §7).
 *
 * US carriers filter application traffic from a number that is not attached to a registered
 * campaign, and the campaign is attached to a Messaging Service. So a number sends registered
 * traffic only while it sits in this service's sender pool - which is why provisioning adds it
 * there, the daily sweep retries any it missed, and reclamation removes it before release.
 */
export function messagingServiceSid(): string | undefined {
  return process.env.TWILIO_MESSAGING_SERVICE_SID || undefined;
}

export async function addNumberToMessagingService(serviceSid: string, numberSid: string): Promise<void> {
  try {
    await messagingRequest("POST", `/Services/${serviceSid}/PhoneNumbers`, { PhoneNumberSid: numberSid });
  } catch (e) {
    // Already in the pool (a retry, or the backfill running twice) is the outcome we wanted.
    if (e instanceof TwilioError && e.code === 21712) return;
    throw e;
  }
}

/** Best-effort by design: a number about to be released does not need its pool membership to survive. */
export async function removeNumberFromMessagingService(serviceSid: string, numberSid: string): Promise<void> {
  try {
    await messagingRequest("DELETE", `/Services/${serviceSid}/PhoneNumbers/${numberSid}`);
  } catch (e) {
    if (e instanceof TwilioError && e.status === 404) return;
    throw e;
  }
}

// ---------- Calls + SMS ----------

/** Place an outbound call; Twilio fetches TwiML from `url` when the callee answers. */
export async function createCall(opts: { to: string; from: string; url: string; statusCallback?: string; timeoutSeconds?: number }): Promise<{ sid: string }> {
  const data = await request<{ sid: string }>("POST", "/Calls.json", {
    To: opts.to,
    From: opts.from,
    Url: opts.url,
    Method: "POST",
    StatusCallback: opts.statusCallback,
    StatusCallbackMethod: "POST",
    Timeout: opts.timeoutSeconds ? String(opts.timeoutSeconds) : undefined,
  });
  return { sid: data.sid };
}

export type SentSms = {
  sid: string;
  /** Segments Twilio billed. SMS is priced per segment, not per message. */
  numSegments: number;
  status?: string;
  /** "GSM-7" or "UCS-2" — UCS-2 means the body fell out of the GSM alphabet and each
   *  segment holds 70 characters instead of 160. */
  encoding?: string;
  from?: string;
};

/**
 * Send an SMS.
 *
 * Both the Messaging Service and `from` go on the request when both exist: the service is what
 * makes the traffic registered A2P (its campaign), and `from` pins the sender to this business's own
 * number rather than letting the pool pick one - a customer who texted Ridgeway Plumbing must be
 * answered from Ridgeway Plumbing's number. Twilio accepts the pair as long as `from` is in the
 * service's sender pool, which provisioning guarantees (addNumberToMessagingService).
 *
 * With no service configured the message goes out from the raw number - unregistered traffic that
 * US carriers filter. sendGuestSms logs that it is doing so.
 *
 * `statusCallback` is where Twilio reports what the carrier did with the message afterwards. Without
 * it the only failure this app can see is a synchronous rejection — the ones Twilio refuses outright,
 * like a send to a number that has opted out. A message Twilio *accepts* and the carrier later drops
 * comes back only on the callback, so without one it stays "queued" forever and reads as sent.
 */
export async function sendSms(opts: { to: string; body: string; from?: string; statusCallback?: string }): Promise<SentSms> {
  const service = messagingServiceSid();
  if (!service && !opts.from) throw new Error("sendSms needs TWILIO_MESSAGING_SERVICE_SID or a from number.");
  const data = await request<{ sid: string; num_segments?: string; status?: string; encoding?: string; from?: string }>(
    "POST",
    "/Messages.json",
    {
      To: opts.to,
      Body: opts.body,
      MessagingServiceSid: service,
      From: opts.from,
      StatusCallback: opts.statusCallback,
    },
  );
  return {
    sid: data.sid,
    // Twilio returns num_segments as a STRING ("1", "2"). Parse it and never trust it to be
    // a number; a bad value must not become NaN and poison the cost model.
    numSegments: Number(data.num_segments ?? 1) || 1,
    status: data.status,
    encoding: data.encoding,
    from: data.from,
  };
}

// ---------- Request validation ----------

/**
 * Validate the X-Twilio-Signature header: HMAC-SHA1 over the full URL plus the POST params
 * (sorted by key, key+value concatenated) using the auth token.
 */
export function validateTwilioSignature(url: string, params: Record<string, string>, signature: string | null): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token || !signature) return false;
  const keys = Object.keys(params).sort();
  let data = url;
  for (const k of keys) data += k + params[k];
  const expected = createHmac("sha1", token).update(data, "utf8").digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Reconstruct the public URL Twilio signed. Behind Vercel/ngrok the request URL is the
 * internal one, so prefer forwarded headers and fall back to the configured app URL.
 */
export function publicRequestUrl(req: Request, appUrl: string): string {
  const u = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (proto && host) return `${proto}://${host}${u.pathname}${u.search}`;
  return `${appUrl}${u.pathname}${u.search}`;
}

export async function parseTwilioForm(req: Request): Promise<Record<string, string>> {
  const text = await req.text();
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(text)) out[k] = v;
  return out;
}

// ---------- TwiML ----------

export function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c] as string);
}

export function twiml(inner: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, { headers: { "Content-Type": "text/xml" } });
}

export function twimlSay(text: string, hangup = true): Response {
  return twiml(`<Say voice="Polly.Joanna">${escapeXml(text)}</Say>${hangup ? "<Hangup/>" : ""}`);
}

export function twimlDialSip(sipUri: string): Response {
  return twiml(`<Dial answerOnBridge="true"><Sip>${escapeXml(sipUri)}</Sip></Dial>`);
}
