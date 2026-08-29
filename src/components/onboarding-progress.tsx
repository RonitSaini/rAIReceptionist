import { ONBOARDING_LAST_STEP, ONBOARDING_STEPS } from "@/lib/constants";

export function OnboardingProgress({ step }: { step: number }) {
  const current = ONBOARDING_STEPS.find((s) => s.step === step);
  const pct = Math.round(((step - 1) / ONBOARDING_LAST_STEP) * 100);
  return (
    <div className="mb-6">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-sm font-semibold text-brand-700">
          Step {step} of {ONBOARDING_LAST_STEP}
        </p>
        <p className="text-xs text-gray-500">{pct}% done</p>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200" role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={ONBOARDING_LAST_STEP}>
        <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${Math.max(6, (step / ONBOARDING_LAST_STEP) * 100)}%` }} />
      </div>
      <h1 className="mt-4 text-2xl font-bold tracking-tight">{current?.title ?? "Setup"}</h1>
    </div>
  );
}
