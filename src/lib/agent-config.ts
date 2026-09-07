import type { AgentRequest, CustomTool, EndCallTool, PostCallAnalysisField, RetellLlmRequest } from "./retell";
import { generateGreeting } from "./greeting";
import { verticalFor } from "@/verticals";
import { UNKNOWN_CALLER } from "./caller-context";
import { AGENT_FUNCTIONS, CLASSIFICATION_CHOICES, MESSAGE_REASONS, classificationChoicesFor, type AgentFunctionName, type AgentSource } from "@/verticals/types";
import { billingState, demoCapped, DEMO_CALL_MAX_MS, FULL_CALL_MAX_MS } from "./billing-state";

/**
 * Builds the Retell LLM + agent configuration for one account.
 *
 * The wording lives in the account's vertical (src/verticals/<slug>.ts) — everything the AI is
 * allowed to say is that definition's business. This module only decides the things that are the
 * same for every profession: how the LLM is configured, what the greeting falls back to, what
 * Retell analyses after the call, and which webhook it reports to.
 */

export type { AgentSource };

/** Kept as the historic names so call sites and the function endpoint do not have to change. */
export const FUNCTION_NAMES = AGENT_FUNCTIONS;
export type FunctionName = AgentFunctionName;
export { MESSAGE_REASONS, CLASSIFICATION_CHOICES };

/**
 * The one thing a caller must never hear (docs/frontdesk-billing-spec.md §6, rule 3), spelled out
 * for the agent. Appended, never woven in: a prompt for any account that is not paused is byte for
 * byte what it was, which the goldens in tests/snapshots hold it to.
 */
const BILLING_PAUSED_SECTION = [
  "BILLING PAUSED - THIS OVERRIDES EVERYTHING ABOVE ABOUT BOOKING:",
  "This business's account is not active right now, so on this call you cannot book, schedule, reserve, order or dispatch anything, and you must not offer or check available times. Do not call any function except take_message.",
  "Still answer warmly and still help: take the caller's name, phone number and what they need, then call take_message with reason \"callback_request\" and tell them someone from the business will call them back. Never hang up on the caller.",
  "Do not mention billing, payment, subscriptions or account status to the caller. If they ask why you cannot book, say only that you will pass their details straight on and someone will call them back.",
].join("\n");

export function buildGeneralPrompt(src: AgentSource): string {
  const prompt = verticalFor(src.account).agentPromptTemplate(src);
  return billingState(src.account) === "paused" ? `${prompt}\n\n${BILLING_PAUSED_SECTION}` : prompt;
}

export function buildTools(src: AgentSource): (CustomTool | EndCallTool)[] {
  return verticalFor(src.account).agentTools(src);
}

// ---------- Post-call analysis ----------

export function buildPostCallAnalysis(src: AgentSource): PostCallAnalysisField[] {
  const definition = verticalFor(src.account);
  return [
    { type: "enum", name: "classification", description: "What the call was mainly about.", choices: [...classificationChoicesFor(definition.archetype)] },
    { type: "string", name: "caller_name", description: "The caller's name if they gave one." },
    { type: "boolean", name: "caller_frustrated", description: "Whether the caller sounded frustrated or confused at any point." },
    { type: "boolean", name: "needs_callback", description: `Whether the ${definition.vocabulary.business.one} still owes the caller a call back.` },
  ];
}

// ---------- Assembled config ----------

export function buildLlmConfig(src: AgentSource): RetellLlmRequest {
  const a = src.account;
  return {
    model: process.env.RETELL_LLM_MODEL || "gpt-4.1",
    model_temperature: 0.2,
    start_speaker: "agent",
    begin_message: a.greeting || generateGreeting(a.businessName, a.hostName),
    general_prompt: buildGeneralPrompt(src),
    general_tools: buildTools(src),
    default_dynamic_variables: {
      restaurant_name: a.businessName,
      host_name: a.hostName,
      timezone: a.timeZone,
      current_date: "today",
      current_time: "now",
      caller_phone: "an unknown number",
      // Only the shop prompt references these, and only shop accounts get them, so no other
      // vertical's synced config moves. The real values are filled per call in /api/twilio/voice.
      ...(verticalFor(a).archetype === "shop_appointment" ? UNKNOWN_CALLER : {}),
    },
  };
}

export function buildAgentConfig(src: AgentSource, llmId: string, voiceId: string): AgentRequest {
  const a = src.account;
  return {
    response_engine: { type: "retell-llm", llm_id: llmId },
    agent_name: `FrontDesk AI · ${a.businessName}`.slice(0, 100),
    voice_id: voiceId,
    language: "en-US",
    webhook_url: `${src.appUrl}/api/retell/webhook`,
    webhook_timeout_ms: 10000,
    post_call_analysis_data: buildPostCallAnalysis(src),
    // The agent enforces the demo cap itself: an unpaid account has no number, so this agent only
    // ever takes the owner's browser test calls, and Retell ends each one at three minutes whatever
    // the browser does. Re-synced the moment a subscription goes active (applySubscription).
    max_call_duration_ms: demoCapped(a) ? DEMO_CALL_MAX_MS : FULL_CALL_MAX_MS,
    end_call_after_silence_ms: 45_000,
    interruption_sensitivity: 0.8,
    responsiveness: 0.9,
    enable_backchannel: true,
    normalize_for_speech: true,
    begin_message_delay_ms: 300,
  };
}
