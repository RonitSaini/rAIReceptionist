"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAccount } from "@/lib/current-account";
import { SMS_PAUSE_DISMISS_COOKIE } from "@/lib/sms-pause";

/** The Dismiss on Home's texting-paused banner: remembered for this account in this browser for a year. */
export async function dismissSmsPauseBanner(): Promise<void> {
  const { account } = await requireAccount();
  (await cookies()).set(SMS_PAUSE_DISMISS_COOKIE, account.id, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 365 * 24 * 60 * 60 });
  revalidatePath("/dashboard");
}
