import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Minimal Retell AI REST client using fetch (no SDK dependency).
 * Docs: https://docs.retellai.com/api-references
 */

const API = "https://api.retellai.com";

/** SIP domain Retell answers registered calls on. Override if Retell changes it. */
export function retellSipDomain(): string {
  return process.env.RETELL_SIP_DOMAIN || "sip.retellai.com";
}

function apiKey(): string {
  const key = process.env.RETELL_API_KEY;
  if (!key) throw new Error("Retell is not configured (RETELL_API_KEY).");
  return key;
}

export class RetellError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "RetellError";
    this.status = status;
  }
}

async function request<T>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey()}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = typeof data === "object" && data && "message" in data ? String((data as { message: unknown }).message) : text || `Retell request failed (${res.status})`;
    throw new RetellError(msg, res.status);
  }
  return data as T;
}

// ---------- Types (subset of the Retell API we use) ----------

export type CustomTool = {
  type: "custom";
  name: string;
  description: string;
  url: string;
  method?: "POST";
  headers?: Record<string, string>;
  parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  speak_during_execution?: boolean;
  speak_after_execution?: boolean;
  execution_message_description?: string;
  timeout_ms?: number;
};

export type EndCallTool = { type: "end_call"; name: string; description: string };

export type RetellLlmRequest = {
  model?: string;
  model_temperature?: number;
  general_prompt: string;
  begin_message?: string | null;
  start_speaker?: "agent" | "user";
  general_tools?: (CustomTool | EndCallTool)[];
  default_dynamic_variables?: Record<string, string>;
};

export type PostCallAnalysisField =
  | { type: "string"; name: string; description: string; examples?: string[] }
  | { type: "enum"; name: string; description: string; choices: string[] }
  | { type: "boolean"; name: string; description: string }
  | { type: "number"; name: string; description: string };

export type AgentRequest = {
  response_engine: { type: "retell-llm"; llm_id: string; version?: number };
  agent_name?: string;
  voice_id: string;
  voice_model?: string;
  language?: string;
  webhook_url?: string | null;
  webhook_timeout_ms?: number;
  post_call_analysis_data?: PostCallAnalysisField[];
  post_call_analysis_model?: string;
  max_call_duration_ms?: number;
  end_call_after_silence_ms?: number;
  interruption_sensitivity?: number;
  responsiveness?: number;
  enable_backchannel?: boolean;
  normalize_for_speech?: boolean;
  begin_message_delay_ms?: number;
  voicemail_option?: { action: { type: "hangup" } | { type: "static_text"; text: string } };
};

export type RetellCall = {
  call_id: string;
  call_type?: "phone_call" | "web_call";
  agent_id?: string;
  call_status?: "registered" | "not_connected" | "ongoing" | "ended" | "error";
  from_number?: string;
  to_number?: string;
  direction?: "inbound" | "outbound";
  metadata?: Record<string, unknown>;
  start_timestamp?: number;
  end_timestamp?: number;
  duration_ms?: number;
  disconnection_reason?: string;
  transcript?: string;
  transcript_object?: { role: "agent" | "user"; content: string }[];
  recording_url?: string;
  public_log_url?: string;
  telephony_identifier?: { twilio_call_sid?: string };
  call_analysis?: {
    call_summary?: string;
    in_voicemail?: boolean;
    user_sentiment?: "Negative" | "Positive" | "Neutral" | "Unknown";
    call_successful?: boolean;
    custom_analysis_data?: Record<string, unknown>;
  };
};

export type RetellWebhookEvent = { event: "call_started" | "call_ended" | "call_analyzed" | string; call: RetellCall };

export type RetellVoice = { voice_id: string; voice_name: string; provider: string; gender?: string; accent?: string; age?: string; preview_audio_url?: string };

// ---------- LLM + agent ----------

export function createLlm(body: RetellLlmRequest) {
  return request<{ llm_id: string; version?: number }>("POST", "/create-retell-llm", body);
}
export function updateLlm(llmId: string, body: Partial<RetellLlmRequest>) {
  return request<{ llm_id: string; version?: number }>("PATCH", `/update-retell-llm/${llmId}`, body);
}
export function createAgent(body: AgentRequest) {
  return request<{ agent_id: string; version?: number }>("POST", "/create-agent", body);
}
export function updateAgent(agentId: string, body: Partial<AgentRequest>) {
  return request<{ agent_id: string; version?: number }>("PATCH", `/update-agent/${agentId}`, body);
}
export function deleteAgent(agentId: string) {
  return request<void>("DELETE", `/delete-agent/${agentId}`);
}
export function deleteLlm(llmId: string) {
  return request<void>("DELETE", `/delete-retell-llm/${llmId}`);
}
export function getAgent(agentId: string) {
  return request<{ agent_id: string }>("GET", `/get-agent/${agentId}`);
}

// ---------- Calls ----------

export function registerPhoneCall(body: { agent_id: string; from_number?: string; to_number?: string; direction?: "inbound" | "outbound"; metadata?: Record<string, unknown>; retell_llm_dynamic_variables?: Record<string, string> }) {
  return request<RetellCall>("POST", "/v2/register-phone-call", body);
}
export function getCall(callId: string) {
  return request<RetellCall>("GET", `/v2/get-call/${callId}`);
}
/** Browser (WebRTC) call: returns an access token the client SDK uses to connect. */
export function createWebCall(body: { agent_id: string; metadata?: Record<string, unknown>; retell_llm_dynamic_variables?: Record<string, string> }) {
  return request<RetellCall & { access_token: string }>("POST", "/v2/create-web-call", body);
}
export function sipUriForCall(callId: string): string {
  return `sip:${callId}@${retellSipDomain()}`;
}

// ---------- Voices ----------

let voiceCache: { at: number; voices: RetellVoice[] } | null = null;

export async function listVoices(): Promise<RetellVoice[]> {
  if (voiceCache && Date.now() - voiceCache.at < 10 * 60_000) return voiceCache.voices;
  const voices = await request<RetellVoice[]>("GET", "/list-voices");
  voiceCache = { at: Date.now(), voices };
  return voices;
}

// ---------- Webhook signature ----------

/**
 * Verify `x-retell-signature` ("v=<ms timestamp>,d=<hex hmac>"):
 * HMAC-SHA256 over rawBody + timestamp using the API key, with a 5-minute tolerance.
 * Mirrors Retell.verify() in the official SDK.
 */
export function verifyRetellSignature(rawBody: string, signature: string | null, opts: { toleranceMs?: number; now?: number } = {}): boolean {
  const key = process.env.RETELL_API_KEY;
  if (!key || !signature) return false;
  const m = /^v=(\d+),d=([0-9a-f]+)$/i.exec(signature.trim());
  if (!m) return false;
  const ts = Number(m[1]);
  const digest = m[2].toLowerCase();
  if (!Number.isSafeInteger(ts) || digest.length !== 64) return false;
  const tolerance = opts.toleranceMs ?? 5 * 60_000;
  if (Math.abs((opts.now ?? Date.now()) - ts) > tolerance) return false;
  const expected = createHmac("sha256", key).update(rawBody + String(ts), "utf8").digest("hex");
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(digest, "hex"));
}

/**
 * Header carrying the shared secret on every custom-function tool call.
 *
 * Renaming this and the derivation salt below is part of dropping the CallCover name, but both
 * are wire values: an agent already registered with Retell keeps sending the old header and the
 * old derived secret until its configuration is re-synced. So we EMIT the new names and ACCEPT
 * the old ones (see `functionSecretCandidates` and the /api/retell/functions route). Once every
 * account has re-synced its agent, the legacy fallbacks can be deleted.
 */
export const FUNCTION_SECRET_HEADER = "x-frontdesk-secret";
export const LEGACY_FUNCTION_SECRET_HEADER = "x-callcover-secret";

const SECRET_SALT = "frontdesk-functions";
const LEGACY_SECRET_SALT = "callcover-functions";

/** Shared secret we place in custom-function tool headers so only Retell can call our function endpoints. */
export function functionSecret(): string {
  return process.env.RETELL_FUNCTION_SECRET || createHmac("sha256", apiKey()).update(SECRET_SALT).digest("hex");
}

/**
 * Every secret an inbound function call may legitimately present: the current one first, then the
 * secret agents synced before the rename are still sending. Compare against all of them.
 */
export function functionSecretCandidates(): string[] {
  if (process.env.RETELL_FUNCTION_SECRET) return [process.env.RETELL_FUNCTION_SECRET];
  const key = apiKey();
  return [createHmac("sha256", key).update(SECRET_SALT).digest("hex"), createHmac("sha256", key).update(LEGACY_SECRET_SALT).digest("hex")];
}
