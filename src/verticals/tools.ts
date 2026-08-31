import type { CustomTool, EndCallTool } from "@/lib/retell";
import { FUNCTION_SECRET_HEADER, functionSecret } from "@/lib/retell";
import type { AgentFunctionName } from "./types";

/**
 * Helpers every vertical builds its Retell tool list with.
 *
 * These live in the vertical layer rather than in src/lib/agent-config.ts so that a definition
 * never has to import the module that consumes it — agent-config asks the registry for a
 * definition, and a definition reaching back into agent-config would close the cycle.
 */

/** Shared parameter shapes, so "what is a phone number" is defined once for every vertical. */
export const PHONE = { type: "string", description: "10-digit US or Canadian phone number, digits only or formatted, e.g. 2125550123. Use the caller's number if they say to use it." };
export const DATE = { type: "string", description: "Date in YYYY-MM-DD format, resolved using today's date." };
export const TIME = { type: "string", description: "Time in 24-hour HH:MM format, e.g. 18:30 for 6:30 PM." };

export function customTool(
  name: AgentFunctionName,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
  appUrl: string,
  extra: Partial<CustomTool> = {},
): CustomTool {
  return {
    type: "custom",
    name,
    description,
    url: `${appUrl}/api/retell/functions/${name}`,
    method: "POST",
    headers: { [FUNCTION_SECRET_HEADER]: functionSecret() },
    parameters: { type: "object", properties, required },
    speak_during_execution: true,
    speak_after_execution: true,
    execution_message_description: "Say a short natural filler like 'One moment while I check that.'",
    timeout_ms: 15000,
    ...extra,
  };
}

/** Every vertical ends a call the same way, and none of them may hang up on a caller. */
export const END_CALL_TOOL: EndCallTool = {
  type: "end_call",
  name: "end_call",
  description: "End the call. Only use after the caller confirms they are finished and you have said goodbye.",
};
