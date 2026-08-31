import type { Vertical } from "@prisma/client";
import { lastOnboardingStep, onboardingStepsFor } from "@/verticals";

/**
 * Step counter and title for the setup flow.
 *
 * The list of steps — and therefore how many there are and what this one is called — comes from
 * the account's vertical. Step 1 runs before an Account exists, so it falls back to `restaurant`;
 * that only affects the "of N" while the owner is still choosing a profession.
 */
export function OnboardingProgress({ step, vertical = "restaurant" }: { step: number; vertical?: Vertical }) {
  const steps = onboardingStepsFor(vertical);
  const lastStep = lastOnboardingStep(vertical);
  const current = steps[step - 1];
  const pct = Math.round(((step - 1) / lastStep) * 100);
  return (
    <div className="mb-6">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-sm font-semibold text-brand-700">
          Step {step} of {lastStep}
        </p>
        <p className="text-xs text-gray-500">{pct}% done</p>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200" role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={lastStep}>
        <div className="progress-fill h-full rounded-full bg-brand-600" style={{ width: `${Math.max(6, (step / lastStep) * 100)}%` }} />
      </div>
      <h1 className="mt-4 text-2xl font-bold tracking-tight">{current?.title ?? "Setup"}</h1>
    </div>
  );
}
