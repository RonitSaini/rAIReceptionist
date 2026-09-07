"use client";

import { useActionState } from "react";
import { resendVerificationEmail } from "@/actions/auth";

/**
 * The soft gate (src/lib/email-verification.ts): one amber line until the address is confirmed,
 * with the Resend button in it. It never blocks the page - the only thing verification actually
 * withholds is a phone number, and the phone panel says so itself.
 */
export function VerifyEmailBanner({ email }: { email: string }) {
  const [state, action, pending] = useActionState(resendVerificationEmail, null);
  return (
    <form action={action} className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-900">
      <span>Verify your email — we sent a link to {email}.</span>
      <button type="submit" disabled={pending} className="underline underline-offset-2 disabled:opacity-60">
        {pending ? "Sending…" : state?.ok ? "Sent again" : "Resend"}
      </button>
      {state && !state.ok && state.error ? <span className="font-normal">{state.error}</span> : null}
    </form>
  );
}
