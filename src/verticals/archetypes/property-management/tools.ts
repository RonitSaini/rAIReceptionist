import type { CustomTool, EndCallTool } from "@/lib/retell";
import { PM_MESSAGE_REASONS, type AgentSource } from "../../types";
import { END_CALL_TOOL, PHONE, customTool } from "../../tools";
import type { PropertyManagementConfig } from "./index";

/**
 * Four functions.
 *
 * `lookup_tenant` returns only what the agent is allowed to act on: whether THIS caller's number is
 * on file and, if so, their own unit. It never returns anyone else, and it is keyed on the number
 * the call arrived from rather than on anything the caller types, so it cannot be used to look
 * somebody up. That is deliberate — a tool that accepted an arbitrary phone number or an address
 * would be a resident-lookup API with a voice interface on the front.
 */
export function buildPmTools(cfg: PropertyManagementConfig, src: AgentSource): (CustomTool | EndCallTool)[] {
  const u = src.appUrl;
  const words = cfg.vocabulary;

  return [
    customTool(
      "lookup_tenant",
      "Check whether the number this call came from belongs to a resident on file, and if so which unit. Call it once, early. It only ever returns the caller's own tenancy - it cannot look up anyone else, and you must not ask the caller for a number to look up.",
      { phone: PHONE },
      ["phone"],
      u,
      { execution_message_description: "Say something like 'One moment.'" },
    ),
    customTool(
      "create_work_order",
      `Log ${words.booking.one === "work order" ? "a work order" : `a ${words.booking.one}`} once you know what is wrong, whether we may enter, and whether there is a pet in the home.`,
      {
        caller_name: { type: "string", description: "Who is reporting it." },
        caller_phone: PHONE,
        property_address: { type: "string", description: "The property address as the caller gives it. Leave blank if lookup_tenant already matched them." },
        unit_label: { type: "string", description: "The unit as the caller gives it, e.g. 3B. Leave blank if lookup_tenant already matched them." },
        ...cfg.intakeProperties,
      },
      ["caller_name", "caller_phone", "description", "category"],
      u,
    ),
    customTool(
      "dispatch_emergency",
      "Log an emergency and alert the manager immediately. Use instead of a work order when the situation matches the emergency list.",
      {
        caller_name: { type: "string" },
        caller_phone: PHONE,
        property_address: { type: "string", description: "Where they are, as they give it." },
        unit_label: { type: "string", description: "The unit, as they give it." },
        emergency_type: { type: "string", enum: cfg.emergencies.map((e) => e.key), description: "Which emergency this is." },
        description: { type: "string", description: "What the caller said is happening." },
      },
      ["caller_name", "caller_phone", "emergency_type"],
      u,
      { execution_message_description: "Say 'Let me get someone on this right now.'" },
    ),
    customTool(
      "take_message",
      "Record a message or escalate to the manager. Use for a leasing enquiry, for anything you cannot answer, and whenever you have refused to share resident information.",
      {
        caller_name: { type: "string" },
        caller_phone: PHONE,
        message: { type: "string", description: "Clear summary of what the caller needs. Do not include any resident information you were asked for and declined to give." },
        reason: { type: "string", enum: [...PM_MESSAGE_REASONS], description: 'Why the message is being taken. Use "leasing" for anyone asking about renting.' },
        escalate: { type: "boolean", description: "true when the manager must call back urgently; false for a normal message." },
      },
      ["caller_name", "caller_phone", "message", "reason", "escalate"],
      u,
    ),
    END_CALL_TOOL,
  ];
}
