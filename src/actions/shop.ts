"use server";

import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccount } from "@/lib/current-account";
import { int, list, normalizeUsPhone, optStr, str, type ActionState } from "@/lib/form";
import { verticalFor } from "@/verticals";
import { syncRetellAgentQuietly } from "@/lib/agent-sync";
import { finish, modeOf } from "@/lib/onboarding-flow";

/**
 * Urgent cases, the referral number, and how long a visit takes.
 *
 * The referral is validated rather than merely stored. A vet's is `required: true`, and refusing to
 * save without it is the whole point: an account that gets past this screen with an empty box has a
 * hole that only appears on an emergency call out of hours, which is the worst possible time to
 * discover it.
 */
export async function saveShopHandoffs(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { account } = await requireAccount();
  const definition = verticalFor(account);
  const referral = definition.referral;
  if (!referral) return { ok: false, error: "This profession has no referral to set." };

  const allowed = new Set(definition.emergencyTypes.map((e) => e.key));
  const emergencyTypes = list(fd, "emergencyTypes").filter((k) => allowed.has(k));

  const rawPhone = str(fd, "referralPhone");
  const phone = rawPhone ? normalizeUsPhone(rawPhone) : null;
  if (referral.required && !phone) {
    return { ok: false, error: `${referral.label} is required, and it must be a 10-digit US or Canadian number. It is what a caller is given when you are closed.` };
  }
  if (rawPhone && !phone) return { ok: false, error: "That does not look like a 10-digit US or Canadian number." };

  const jobSlotMinutes = int(fd, "jobSlotMinutes", definition.defaults.slotMinutes);
  const maxRaw = str(fd, "maxJobsPerDay");
  const maxJobsPerDay = maxRaw ? Number.parseInt(maxRaw, 10) : null;
  if (jobSlotMinutes < 5 || jobSlotMinutes > 8 * 60) return { ok: false, error: "An appointment should be between 5 minutes and 8 hours." };
  if (maxJobsPerDay != null && (!Number.isInteger(maxJobsPerDay) || maxJobsPerDay < 1)) return { ok: false, error: "Most per day must be a whole number, or left blank." };

  await prisma.account.update({
    where: { id: account.id },
    data: {
      emergencyTypes,
      jobSlotMinutes,
      maxJobsPerDay,
      [referral.field]: phone,
      ...(referral.nameField ? { [referral.nameField]: optStr(fd, "referralName") } : {}),
    },
  });

  after(() => syncRetellAgentQuietly(account.id));
  return finish(account, "handoffs", modeOf(fd));
}
