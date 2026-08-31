"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { recordTermsForGoogleSignup, signUp } from "@/actions/auth";
import type { ActionState } from "@/lib/form";
import { Alert, Button, Field, Input } from "@/components/ui";
import { GoogleButton } from "@/components/google-button";
import { VerticalPicker } from "@/components/forms/vertical-picker";
import type { VerticalCatalogEntry } from "@/verticals/types";

export function SignupForm({ googleEnabled, catalog }: { googleEnabled: boolean; catalog: readonly VerticalCatalogEntry[] }) {
  const [vertical, setVertical] = useState("");
  // Unchecked by default, and both signup paths key off it: the submit button stays disabled and
  // the Google button won't leave for OAuth until it's ticked. The server checks again regardless.
  const [agreed, setAgreed] = useState(false);
  // React resets the form once a server action completes, so the credentials must be captured
  // on the way in — reading the fields afterwards yields empty strings and a failed sign-in.
  const credsRef = useRef<{ email: string; password: string } | null>(null);
  const [state, action, pending] = useActionState(async (prev: ActionState, fd: FormData) => {
    credsRef.current = { email: String(fd.get("email") ?? ""), password: String(fd.get("password") ?? "") };
    return signUp(prev, fd);
  }, null);
  const formRef = useRef<HTMLFormElement>(null);

  // After the server creates the user, sign in with the same credentials and continue to step 2.
  useEffect(() => {
    if (!state?.ok || !credsRef.current) return;
    signIn("credentials", { ...credsRef.current, callbackUrl: "/onboarding/2" });
  }, [state]);

  return (
    <div className="space-y-4">
      <form ref={formRef} action={action} className="space-y-4 rounded-2xl border border-gray-200 bg-surface p-5 shadow-sm">
        {state && !state.ok && state.error ? <Alert>{state.error}</Alert> : null}
        {state?.ok ? <Alert kind="success">Account created — signing you in…</Alert> : null}
        <VerticalPicker catalog={catalog} value={vertical} onChange={setVertical} />
        <Field label="Business name" htmlFor="businessName">
          <Input id="businessName" name="businessName" required placeholder="Luigi's Trattoria" autoComplete="organization" />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" required autoComplete="email" inputMode="email" placeholder="you@yourbusiness.com" />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 8 characters.">
          <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="••••••••" />
        </Field>
        <label htmlFor="acceptTerms" className="flex items-start gap-2.5 text-sm text-gray-700">
          <input
            id="acceptTerms"
            name="acceptTerms"
            type="checkbox"
            required
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
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
        <Button type="submit" size="lg" full disabled={pending || !!state?.ok || !vertical || !agreed}>
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </form>
      {googleEnabled ? (
        <>
          <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-gray-400">
            <span className="h-px flex-1 bg-gray-200" />
            or
            <span className="h-px flex-1 bg-gray-200" />
          </div>
          {/* Consent is captured server-side (a signed cookie) BEFORE the browser leaves for
              Google; the NextAuth callback refuses to create a user without it. */}
          <GoogleButton callbackUrl="/onboarding/1" label="Sign up with Google" disabled={!agreed} beforeSignIn={() => recordTermsForGoogleSignup()} />
          {!agreed ? <p className="mt-2 text-center text-xs text-gray-400">Tick the agreement box above to enable sign-up.</p> : null}
        </>
      ) : null}
    </div>
  );
}
