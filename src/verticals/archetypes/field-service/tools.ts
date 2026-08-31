import type { CustomTool, EndCallTool } from "@/lib/retell";
import { MESSAGE_REASONS, type AgentSource } from "../../types";
import { DATE, END_CALL_TOOL, PHONE, TIME, customTool } from "../../tools";
import type { FieldServiceConfig } from "./index";

/**
 * The five functions every field_service trade's agent is given, and no others.
 *
 * The order of the parameters matters more than it looks: it is what the golden files lock, and a
 * reordering would show up as a diff on all four trades at once. Intake fields are appended last so
 * that adding one to a trade cannot move the six every trade shares.
 */

const ADDRESS = { type: "string", description: "Full street address of the property, including city and ZIP or postal code." };

export function buildFieldServiceTools(cfg: FieldServiceConfig, src: AgentSource): (CustomTool | EndCallTool)[] {
  const u = src.appUrl;

  /**
   * Scheduling is offered only to an account that actually schedules. A tow truck that books
   * nothing must not be handed get_available_slots: a model given a tool will find a reason to
   * use it, and "let me look at the diary" is a strange thing to say to someone on a hard shoulder.
   */
  const schedules = !cfg.dispatchFirst || src.account.takesScheduledWork;

  const tools: (CustomTool | EndCallTool)[] = [
    customTool(
      "check_service_area",
      "Check whether an address is inside the service area. Always call this before offering a time or booking a visit.",
      { address: ADDRESS },
      ["address"],
      u,
      { execution_message_description: "Say 'Let me check if we cover that area.'" },
    ),
  ];

  if (cfg.dispatchFirst) {
    tools.push(
      customTool(
        "request_immediate_dispatch",
        cfg.dispatchToolDescription ?? "Log a request for someone to come out now. This is the main thing you do. Call it once you have where they are, what has happened, their name and a phone number.",
        {
          location: { type: "string", description: "Exactly where they are, in their own words. Cross streets, highway and direction, mile marker, or a full street address." },
          details: { type: "string", description: "What has happened and anything the driver needs to know before setting off." },
          customer_name: { type: "string", description: "Who is waiting." },
          customer_phone: PHONE,
          ...(cfg.intakeProperties ?? {}),
        },
        ["location", "details", "customer_name", "customer_phone"],
        u,
        { execution_message_description: "Say 'Let me get this to our dispatcher now.'" },
      ),
    );
  }

  if (schedules) {
    tools.push(
      customTool(
        "get_available_slots",
        "Find the free visit windows on a day. Call before offering any time. For an emergency this returns no times and tells you to dispatch instead.",
        { date: DATE, is_emergency: { type: "boolean", description: "true when the caller's situation matches the emergency list." } },
        ["date"],
        u,
        { execution_message_description: "Say something like 'Let me look at the diary.'" },
      ),
      customTool(
        "book_service_call",
        cfg.bookingToolDescription,
        {
          customer_name: { type: "string", description: "Who the visit is for." },
          customer_phone: PHONE,
          address: ADDRESS,
          description: { type: "string", description: "What is wrong, in the caller's own words. Do not diagnose." },
          date: DATE,
          time: TIME,
          ...(cfg.intakeProperties ?? {}),
        },
        ["customer_name", "customer_phone", "address", "description", "date", "time"],
        u,
      ),
    );
  }

  tools.push(
    customTool(
      "dispatch_emergency",
      "Log an emergency and alert the business immediately. Use instead of booking when the situation matches the emergency list.",
      {
        customer_name: { type: "string" },
        customer_phone: PHONE,
        address: ADDRESS,
        emergency_type: { type: "string", enum: cfg.emergencies.map((e) => e.key), description: "Which emergency this is." },
        description: { type: "string", description: "What the caller said is happening." },
        ...(cfg.emergencyProperties ?? {}),
      },
      ["customer_name", "customer_phone", "address", "emergency_type"],
      u,
      { execution_message_description: "Say 'Let me get someone on this right now.'" },
    ),
    customTool(
      "take_message",
      "Record a message or escalate to the owner. Use when you cannot book, cannot answer, or the caller wants a quote for something unusual.",
      {
        caller_name: { type: "string" },
        caller_phone: PHONE,
        message: { type: "string", description: "Clear summary of what the caller needs, including the address if they gave one." },
        reason: { type: "string", enum: [...MESSAGE_REASONS], description: "Why the message is being taken." },
        escalate: { type: "boolean", description: "true when the owner must call back urgently; false for a normal message." },
      },
      ["caller_name", "caller_phone", "message", "reason", "escalate"],
      u,
    ),
    END_CALL_TOOL,
  );
  return tools;
}
