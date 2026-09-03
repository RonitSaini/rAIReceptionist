"use client";

import { Field, Input } from "@/components/ui";

/**
 * The optional referral code box, shared by both sign-up paths (the password form on /signup and
 * step 1, which is where a Google sign-up actually creates its account).
 *
 * Controlled by the parent rather than left uncontrolled, because React resets a form after every
 * action: without that, one "email already taken" would wipe an eight-character code the person had
 * just copied off a card. `prefilled` only changes the hint — an invite link puts the code here
 * already typed, and the sentence should say so rather than asking again for something visibly done.
 */
export function ReferralField({ value, onChange, prefilled = false }: { value: string; onChange: (v: string) => void; prefilled?: boolean }) {
  return (
    <Field
      label="Referral code (optional)"
      htmlFor="referralCode"
      hint={prefilled ? "From the invite you followed — $100 comes off your first month." : "Sent to you by another business? $100 comes off your first month."}
    >
      <Input
        id="referralCode"
        name="ref"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="K7QM2XPD"
        className="font-mono uppercase tracking-widest"
      />
    </Field>
  );
}
