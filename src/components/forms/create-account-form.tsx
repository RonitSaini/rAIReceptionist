"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createAccountForCurrentUser } from "@/actions/auth";
import { Alert, Button, Field, Input } from "@/components/ui";

export function CreateAccountForm() {
  const [state, action, pending] = useActionState(createAccountForCurrentUser, null);
  const router = useRouter();

  useEffect(() => {
    // The JWT refreshes its accountId on the next request (see jwt callback in lib/auth.ts).
    if (state?.ok) router.push("/onboarding/2");
  }, [state, router]);

  return (
    <form action={action} className="space-y-4 rounded-2xl border border-gray-200 bg-surface p-5 shadow-sm">
      <p className="text-gray-600">Welcome! Tell us the name of your restaurant to get started.</p>
      {state && !state.ok && state.error ? <Alert>{state.error}</Alert> : null}
      <Field label="Restaurant name" htmlFor="restaurantName">
        <Input id="restaurantName" name="restaurantName" required placeholder="Luigi's Trattoria" autoComplete="organization" />
      </Field>
      <Button type="submit" size="lg" full disabled={pending || !!state?.ok}>
        {pending ? "Creating…" : "Continue"}
      </Button>
    </form>
  );
}
