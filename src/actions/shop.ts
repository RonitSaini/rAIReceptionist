"use server";

import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccount } from "@/lib/current-account";
import { int, list, optStr, str, type ActionState } from "@/lib/form";
import { verticalFor } from "@/verticals";
import { validateShopHandoffs } from "@/lib/shop-validation";
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

  const result = validateShopHandoffs(
    {
      referralPhone: str(fd, "referralPhone"),
      referralName: optStr(fd, "referralName") ?? undefined,
      emergencyTypes: list(fd, "emergencyTypes"),
      jobSlotMinutes: int(fd, "jobSlotMinutes", definition.defaults.slotMinutes),
      maxJobsPerDay: str(fd, "maxJobsPerDay"),
    },
    referral,
    definition.emergencyTypes.map((e) => e.key),
  );
  if (!result.ok) return { ok: false, error: result.error };
  const { referralPhone, referralName, emergencyTypes, jobSlotMinutes, maxJobsPerDay } = result.value;

  await prisma.account.update({
    where: { id: account.id },
    data: {
      emergencyTypes,
      jobSlotMinutes,
      maxJobsPerDay,
      [referral.field]: referralPhone,
      ...(referral.nameField ? { [referral.nameField]: referralName } : {}),
    },
  });

  after(() => syncRetellAgentQuietly(account.id));
  return finish(account, "handoffs", modeOf(fd));
}
