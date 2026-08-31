import type { Referral } from "@/verticals/archetypes/shop-appointment";
import { normalizeUsPhone } from "./form";

/**
 * Validation for the shop handoff settings, pulled out of the server action so it can be tested.
 *
 * The rule that matters is the referral one. A veterinary account's emergency number is what a
 * frightened owner is given at eleven at night when the clinic is shut; onboarding refuses to
 * finish without it, and Settings has to refuse to clear it afterwards for exactly the same reason.
 * The prompt does degrade honestly if the number is somehow missing — that fallback exists and is
 * tested — but degrading gracefully is the safety net, not the plan.
 */

export type HandoffInput = {
  referralPhone: string;
  referralName?: string;
  emergencyTypes: string[];
  jobSlotMinutes: number;
  maxJobsPerDay: string;
};

export type HandoffResult =
  | { ok: false; error: string }
  | { ok: true; value: { referralPhone: string | null; referralName: string | null; emergencyTypes: string[]; jobSlotMinutes: number; maxJobsPerDay: number | null } };

export function validateShopHandoffs(input: HandoffInput, referral: Referral, allowedEmergencies: readonly string[]): HandoffResult {
  const raw = input.referralPhone.trim();
  const referralPhone = raw ? normalizeUsPhone(raw) : null;

  if (referral.required && !referralPhone) {
    return {
      ok: false,
      error: `${referral.label} is required and cannot be removed. It is the number a caller is given when you are closed, so an account without one answers an emergency with nothing.`,
    };
  }
  if (raw && !referralPhone) return { ok: false, error: "That does not look like a 10-digit US or Canadian number." };

  if (input.jobSlotMinutes < 5 || input.jobSlotMinutes > 8 * 60) return { ok: false, error: "An appointment should be between 5 minutes and 8 hours." };

  const maxRaw = input.maxJobsPerDay.trim();
  const maxJobsPerDay = maxRaw ? Number.parseInt(maxRaw, 10) : null;
  if (maxJobsPerDay != null && (!Number.isInteger(maxJobsPerDay) || maxJobsPerDay < 1)) {
    return { ok: false, error: "Most per day must be a whole number, or left blank." };
  }

  const allowed = new Set(allowedEmergencies);
  return {
    ok: true,
    value: {
      referralPhone,
      referralName: input.referralName?.trim() || null,
      emergencyTypes: input.emergencyTypes.filter((k) => allowed.has(k)),
      jobSlotMinutes: input.jobSlotMinutes,
      maxJobsPerDay,
    },
  };
}
