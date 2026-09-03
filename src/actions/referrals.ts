"use server";

import { revalidatePath } from "next/cache";
import { requireAccount } from "@/lib/current-account";
import { formatUsd, str, type ActionState } from "@/lib/form";
import { claimReferralCode } from "@/lib/referrals";

/**
 * Apply someone else's referral code to this account. Offered on the payment step, and only there:
 * the code has to land before the first payment, which is exactly the moment that page exists for.
 */
export async function applyReferralCode(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { account } = await requireAccount();
  const result = await claimReferralCode(account.id, str(fd, "code"));
  if (!result.ok) return { ok: false, error: result.error };

  // The plan card renders the discount, so the whole page has to re-read.
  revalidatePath("/", "layout");
  return { ok: true, message: `Code ${result.code} applied — ${formatUsd(result.creditCents / 100)} comes off at checkout.` };
}
