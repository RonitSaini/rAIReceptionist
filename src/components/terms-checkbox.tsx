"use client";

/**
 * The consent control, defined once.
 *
 * `name="acceptTerms"` is the contract with `acceptedTerms()` in @/actions/auth, so every path that
 * can create an account or re-consent an existing one renders THIS: sign-up, the step-1 form a
 * Google user lands on with no account yet, and the re-consent interstitial. Keeping one copy is
 * what stops a path from acquiring a consent check with no box to tick.
 */
export function TermsCheckbox({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label htmlFor="acceptTerms" className="flex items-start gap-2.5 text-sm text-gray-700">
      <input
        id="acceptTerms"
        name="acceptTerms"
        type="checkbox"
        required
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 accent-brand-600"
      />
      <span>
        I agree to the{" "}
        <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 underline">
          Terms of Service
        </a>{" "}
        and{" "}
        <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 underline">
          Privacy Policy
        </a>
        .
      </span>
    </label>
  );
}
