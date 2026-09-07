import type { Account } from "@prisma/client";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import { str, type ActionState } from "./form";
import { ONBOARDING_DONE, nextOnboardingStepId, onboardingPosition, onboardingStepsFor } from "@/verticals";
import { syncRetellAgentQuietly } from "./agent-sync";

/**
 * Shared onboarding-step plumbing for every archetype's server actions.
 *
 * It lives here rather than in one of the action files because a `"use server"` module may only
 * export async functions — exporting `modeOf` from one broke the whole build, and exporting
 * `finish` from one would have quietly published it as a callable server action besides. A plain
 * library module is the right home for something every archetype shares.
 */

export type Mode = "onboarding" | "settings";

export const modeOf = (fd: FormData): Mode => (str(fd, "mode") === "settings" ? "settings" : "onboarding");

/**
 * Advance onboarding (never move backwards) and route to the next screen, or stay put in Settings.
 *
 * Takes the completed step's ID and stores the NEXT step's ID. Positions only ever appear here as
 * URLs and as the "never backwards" comparison: an owner who revisits Hours from Settings after
 * finishing setup must not be dropped back to step 4, and comparing positions in the account's own
 * list is what that rule means.
 */
export async function finish(account: Pick<Account, "id" | "vertical" | "onboardingStepId">, completedStepId: string, mode: Mode): Promise<ActionState> {
  const nextId = nextOnboardingStepId(account, completedStepId);
  const nextPos = onboardingPosition(account, nextId);
  if (onboardingPosition(account, account.onboardingStepId) < nextPos) {
    await prisma.account.update({ where: { id: account.id }, data: { onboardingStepId: nextId } });
  }
  // Keep the Retell agent in step with the settings (no-op until the agent exists). Runs after the response.
  after(() => syncRetellAgentQuietly(account.id));
  revalidatePath("/", "layout");
  if (mode === "onboarding") {
    const { redirect } = await import("next/navigation");
    redirect(nextId === ONBOARDING_DONE ? "/dashboard" : `/onboarding/${nextPos}`);
  }
  return { ok: true, message: "Saved." };
}

/** The URL of a step by id, for the places that have to name one (the checkout return, the phone step's way back to payment). */
export function onboardingStepHref(account: Pick<Account, "vertical">, stepId: string): string {
  if (!onboardingStepsFor(account).some((s) => s.id === stepId)) throw new Error(`Step "${stepId}" is not part of the ${account.vertical} onboarding flow.`);
  return `/onboarding/${onboardingPosition(account, stepId)}`;
}
