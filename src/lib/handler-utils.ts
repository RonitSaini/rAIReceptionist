import type { Account, Call } from "@prisma/client";
import { prisma } from "./prisma";
import { normalizeUsPhone } from "./form";

/**
 * The pieces every archetype's custom-function handlers need.
 *
 * They live here rather than in call-handlers.ts so an archetype's handlers can use them without
 * importing the module that assembles the handler registry — which would close an import cycle,
 * since the registry has to import every archetype.
 *
 * Everything here is defensive on purpose: the arguments come from a language model mid-call, so a
 * number may arrive as "two", a time as "6pm", and a required field as an empty string.
 */

export type HandlerContext = { account: Account; call: Call | null; callerPhone: string | null };
export type Args = Record<string, unknown>;
export type HandlerResult = Record<string, unknown> & { success: boolean; message: string };

export const str = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());

export const int = (v: unknown) => {
  const n = typeof v === "number" ? v : Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : NaN;
};

/** Models say "yes"/"true"/true depending on the day. */
export const bool = (v: unknown) => v === true || ["true", "yes", "y"].includes(str(v).toLowerCase());

export function phoneOrCaller(v: unknown, ctx: HandlerContext): string | null {
  const s = str(v);
  return (s ? normalizeUsPhone(s) : null) ?? ctx.callerPhone;
}

/** Accept "6:30 PM", "18:30", "6pm" and return HH:MM, or null. */
export function normalizeTime(v: unknown): string | null {
  const s = str(v).toLowerCase().replace(/\s+/g, " ");
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) return s;
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? "0");
  const ap = m[3]?.replace(/\./g, "");
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export async function tagCall(
  ctx: HandlerContext,
  data: Partial<Pick<Call, "classification" | "reservationId" | "takeoutOrderId" | "jobId" | "callerName" | "messageText" | "escalationReason" | "callbackRequested">>,
) {
  if (!ctx.call) return;
  await prisma.call.update({ where: { id: ctx.call.id }, data }).catch(() => {});
}

/**
 * Find or create the Customer row for a caller.
 *
 * Every vertical past restaurant recognises returning callers, and the phone number is the key —
 * `(accountId, phone)` is unique, so a concurrent second call for the same number updates rather
 * than duplicating. Returns null when there is no number to key on.
 */
export async function upsertCustomer(accountId: string, phone: string | null, name: string, address?: string | null) {
  if (!phone) return null;
  return prisma.customer
    .upsert({
      where: { accountId_phone: { accountId, phone } },
      update: {
        // Never overwrite something known with nothing.
        ...(name ? { name } : {}),
        ...(address ? { address } : {}),
      },
      create: { accountId, phone, name: name || "Unknown caller", address: address ?? null },
    })
    .catch(() => null);
}
