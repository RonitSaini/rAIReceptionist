"use client";

import { useActionState } from "react";
import { logIn } from "@/actions/auth";
import { Alert, Button, Field, Input } from "@/components/ui";
import { GoogleButton } from "@/components/google-button";

const ERROR_TEXT: Record<string, string> = {
  CredentialsSignin: "Wrong email or password.",
  OAuthAccountNotLinked: "That email is already registered. Log in with your password.",
  AccessDenied: "Sign-in was denied.",
  Default: "Something went wrong signing in. Please try again.",
};

/**
 * Posts to the `logIn` server action, so the form is a real POST at every moment of the page's life:
 * a native POST when Enter lands before React has attached, a fetch after. Until 2026-09-08 this was
 * a client-only `onSubmit` on a form with no `method`, and a pre-hydration Enter submitted as a GET
 * with the email and password in the URL (src/lib/login-post.ts).
 */
export function LoginForm({ callbackUrl, initialError, googleEnabled }: { callbackUrl: string; initialError: string | null; googleEnabled: boolean }) {
  const [state, action, pending] = useActionState(logIn, null);
  const error = state && !state.ok ? state.error : initialError ? (ERROR_TEXT[initialError] ?? ERROR_TEXT.Default) : null;

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4 rounded-2xl border border-gray-200 bg-surface p-5 shadow-sm">
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        {error ? <Alert>{error}</Alert> : null}
        <Field label="Email" htmlFor="email">
          {/* Focused at mount, before the entrance has settled: typing never waits on motion (spec rule 24). */}
          <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required placeholder="you@yourbusiness.com" autoFocus />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="current-password" required placeholder="••••••••" />
        </Field>
        <Button type="submit" size="lg" full disabled={pending}>
          {pending ? "Logging in…" : "Log in"}
        </Button>
      </form>
      {googleEnabled ? (
        <>
          <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-gray-400">
            <span className="h-px flex-1 bg-gray-200" />
            or
            <span className="h-px flex-1 bg-gray-200" />
          </div>
          <GoogleButton callbackUrl={callbackUrl} label="Continue with Google" />
        </>
      ) : null}
    </div>
  );
}
