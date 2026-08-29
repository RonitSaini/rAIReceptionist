"use client";

import { useActionState, useEffect, useRef } from "react";
import { signIn } from "next-auth/react";
import { signUp } from "@/actions/auth";
import { Alert, Button, Field, Input } from "@/components/ui";
import { GoogleButton } from "@/components/google-button";

export function SignupForm({ googleEnabled }: { googleEnabled: boolean }) {
  const [state, action, pending] = useActionState(signUp, null);
  const formRef = useRef<HTMLFormElement>(null);

  // After the server creates the user, sign in with the same credentials and continue to step 2.
  useEffect(() => {
    if (!state?.ok || !formRef.current) return;
    const fd = new FormData(formRef.current);
    signIn("credentials", {
      email: String(fd.get("email") ?? ""),
      password: String(fd.get("password") ?? ""),
      callbackUrl: "/onboarding/2",
    });
  }, [state]);

  return (
    <div className="space-y-4">
      <form ref={formRef} action={action} className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        {state && !state.ok && state.error ? <Alert>{state.error}</Alert> : null}
        {state?.ok ? <Alert kind="success">Account created — signing you in…</Alert> : null}
        <Field label="Restaurant name" htmlFor="restaurantName">
          <Input id="restaurantName" name="restaurantName" required placeholder="Luigi's Trattoria" autoComplete="organization" />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" required autoComplete="email" inputMode="email" placeholder="you@restaurant.com" />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 8 characters.">
          <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
        </Field>
        <Button type="submit" size="lg" full disabled={pending || !!state?.ok}>
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
          <GoogleButton callbackUrl="/onboarding/1" label="Sign up with Google" />
        </>
      ) : null}
    </div>
  );
}
