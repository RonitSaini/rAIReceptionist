import type { CustomTool, EndCallTool } from "@/lib/retell";
import { MESSAGE_REASONS, type AgentSource } from "../../types";
import { DATE, END_CALL_TOOL, PHONE, TIME, customTool } from "../../tools";
import type { ShopAppointmentConfig } from "./index";

/**
 * Three functions, and no more.
 *
 * There is no check_service_area because the customer comes here, and no dispatch because nobody
 * goes out. An urgent case is handled by talking — the referral number is in the prompt — and then
 * recorded through take_message with escalate set, which is the same path the rest of the product
 * already uses to wake a human.
 */
export function buildShopTools(cfg: ShopAppointmentConfig, src: AgentSource): (CustomTool | EndCallTool)[] {
  const u = src.appUrl;
  const words = cfg.vocabulary;

  return [
    customTool(
      "get_available_slots",
      `Find the free ${words.booking.one} times on a day. Call before offering any time.`,
      { date: DATE },
      ["date"],
      u,
      { execution_message_description: "Say something like 'Let me look at the diary.'" },
    ),
    customTool(
      "book_appointment",
      cfg.bookingToolDescription,
      {
        customer_name: { type: "string", description: `Who the ${words.booking.one} is for.` },
        customer_phone: PHONE,
        date: DATE,
        time: TIME,
        ...cfg.intakeProperties,
      },
      ["customer_name", "customer_phone", "date", "time"],
      u,
    ),
    customTool(
      "take_message",
      "Record a message or escalate to the owner. Use when you cannot book, cannot answer, or the case is urgent.",
      {
        caller_name: { type: "string" },
        caller_phone: PHONE,
        message: { type: "string", description: "Clear summary of what the caller needs." },
        reason: { type: "string", enum: [...MESSAGE_REASONS], description: "Why the message is being taken." },
        escalate: { type: "boolean", description: "true when someone must be told at once; false for a normal message." },
      },
      ["caller_name", "caller_phone", "message", "reason", "escalate"],
      u,
    ),
    END_CALL_TOOL,
  ];
}
