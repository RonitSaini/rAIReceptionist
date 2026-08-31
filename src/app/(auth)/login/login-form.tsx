"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { GoogleButton } from "@/components/google-button";

const ERROR_TEXT: Record<string, string> = {
  CredentialsSignin: "Wrong email or password.",
  OAuthAccountNotLinked: "That email is already registered. Log in with your password.",
  AccessDenied: "Sign-in was denied.",
  Default: "Something went wrong signing in. Please try again.",
};

export function LoginForm({ callbackUrl, initialError, googleEnabled }: { callbackUrl: string; initialError: string | null; googleEnabled: boolean }) {
  const [error, setError] = useState<string | null>(initialError ? ERROR_TEXT[initialError] ?? ERROR_TEXT.Default : null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await signIn("credentials", {
      email: String(fd.get("email") ?? ""),
      password: String(fd.get("password") ?? ""),
      redirect: false,
    });
    if (res?.error) {
      setError(ERROR_TEXT[res.error] ?? ERROR_TEXT.Default);
      setBusy(false);
      return;
    }
    window.location.href = callbackUrl;
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-gray-200 bg-surface p-5 shadow-sm">
        {error ? <Alert>{error}</Alert> : null}
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required placeholder="you@yourbusiness.com" />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="current-password" required placeholder="••••••••" />
        </Field>
        <Button type="submit" size="lg" full disabled={busy}>
          {busy ? "Logging in…" : "Log in"}
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
