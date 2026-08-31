import type { AgentRequest, CustomTool, EndCallTool, PostCallAnalysisField, RetellLlmRequest } from "./retell";
import { generateGreeting } from "./greeting";
import { verticalFor } from "@/verticals";
import { AGENT_FUNCTIONS, CLASSIFICATION_CHOICES, MESSAGE_REASONS, type AgentFunctionName, type AgentSource } from "@/verticals/types";

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

export function buildGeneralPrompt(src: AgentSource): string {
  return verticalFor(src.account).agentPromptTemplate(src);
}

export function buildTools(src: AgentSource): (CustomTool | EndCallTool)[] {
  return verticalFor(src.account).agentTools(src);
}

// ---------- Post-call analysis ----------

export function buildPostCallAnalysis(): PostCallAnalysisField[] {
  return [
    { type: "enum", name: "classification", description: "What the call was mainly about.", choices: [...CLASSIFICATION_CHOICES] },
    { type: "string", name: "caller_name", description: "The caller's name if they gave one." },
    { type: "boolean", name: "caller_frustrated", description: "Whether the caller sounded frustrated or confused at any point." },
    { type: "boolean", name: "needs_callback", description: "Whether the restaurant still owes the caller a call back." },
  ];
}

// ---------- Assembled config ----------

export function buildLlmConfig(src: AgentSource): RetellLlmRequest {
  const a = src.account;
  return {
    model: process.env.RETELL_LLM_MODEL || "gpt-4.1",
    model_temperature: 0.2,
    start_speaker: "agent",
    begin_message: a.greeting || generateGreeting(a.restaurantName, a.hostName),
    general_prompt: buildGeneralPrompt(src),
    general_tools: buildTools(src),
    default_dynamic_variables: {
      restaurant_name: a.restaurantName,
      host_name: a.hostName,
      timezone: a.timeZone,
      current_date: "today",
      current_time: "now",
      caller_phone: "an unknown number",
    },
  };
}

export function buildAgentConfig(src: AgentSource, llmId: string, voiceId: string): AgentRequest {
  const a = src.account;
  return {
    response_engine: { type: "retell-llm", llm_id: llmId },
    agent_name: `FrontDesk AI · ${a.restaurantName}`.slice(0, 100),
    voice_id: voiceId,
    language: "en-US",
    webhook_url: `${src.appUrl}/api/retell/webhook`,
    webhook_timeout_ms: 10000,
    post_call_analysis_data: buildPostCallAnalysis(),
    max_call_duration_ms: 20 * 60_000,
    end_call_after_silence_ms: 45_000,
    interruption_sensitivity: 0.8,
    responsiveness: 0.9,
    enable_backchannel: true,
    normalize_for_speech: true,
    begin_message_delay_ms: 300,
  };
}
