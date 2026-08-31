import type { Account } from "@prisma/client";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import { str, type ActionState } from "./form";
import { onboardingDoneStep, onboardingStepsFor } from "@/verticals";
import { syncRetellAgentQuietly } from "./agent-sync";

/**
 * Shared onboarding-step plumbing for every archetype's server actions.
 *
 * It lives here rather than in one of the action files because a `"use server"` module may only
 * export async functions — exporting `modeOf` from one broke the whole build, and exporting
 * `finish` from one would have quietly published it as a callable server action besides. A plain
 * library module is the right home for something two archetypes share.
 */

export type Mode = "onboarding" | "settings";

export const modeOf = (fd: FormData): Mode => (str(fd, "mode") === "settings" ? "settings" : "onboarding");

/** Advancement rule for every vertical: position in its own step list is the step number. */
export async function finish(account: Pick<Account, "id" | "vertical" | "onboardingStep">, completedStepId: string, mode: Mode): Promise<ActionState> {
  const steps = onboardingStepsFor(account);
  const index = steps.findIndex((s) => s.id === completedStepId);
  if (index < 0) throw new Error(`Step "${completedStepId}" is not part of the ${account.vertical} onboarding flow.`);
  const nextStep = index + 2;
  if (account.onboardingStep < nextStep) {
    await prisma.account.update({ where: { id: account.id }, data: { onboardingStep: nextStep } });
  }
  after(() => syncRetellAgentQuietly(account.id));
  revalidatePath("/", "layout");
  if (mode === "onboarding") {
    const { redirect } = await import("next/navigation");
    redirect(nextStep >= onboardingDoneStep(account) ? "/dashboard" : `/onboarding/${nextStep}`);
  }
  return { ok: true, message: "Saved." };
}
