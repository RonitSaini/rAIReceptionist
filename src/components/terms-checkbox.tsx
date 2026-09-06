"use client";

import { Checkbox } from "@/components/ui";

/**
 * The consent control, defined once.
 *
 * `name="acceptTerms"` is the contract with `acceptedTerms()` in @/actions/auth, so every path that
 * can create an account or re-consent an existing one renders THIS: sign-up, the step-1 form a
 * Google user lands on with no account yet, and the re-consent interstitial. Keeping one copy is
 * what stops a path from acquiring a consent check with no box to tick.
 *
 * It is the shared <Checkbox> (motion spec §14), so the tick draws here like everywhere else; the
 * native `required` still stands between an unticked box and the form.
 */
export function TermsCheckbox({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <Checkbox
      variant="inline"
      size="sm"
      align="start"
      id="acceptTerms"
      name="acceptTerms"
      required
      checked={checked}
      onChange={onChange}
      className="gap-2.5 text-sm text-gray-700"
      label={
        <>
          I agree to the{" "}
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 underline">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 underline">
            Privacy Policy
          </a>
          .
        </>
      }
    />
  );
}
