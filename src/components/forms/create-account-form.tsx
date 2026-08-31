"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createAccountForCurrentUser } from "@/actions/auth";
import { Alert, Button, Field, Input } from "@/components/ui";
import { VerticalPicker } from "@/components/forms/vertical-picker";
import type { VerticalCatalogEntry } from "@/verticals/types";

export function CreateAccountForm({ catalog }: { catalog: readonly VerticalCatalogEntry[] }) {
  const [vertical, setVertical] = useState("");
  const [state, action, pending] = useActionState(createAccountForCurrentUser, null);
  const router = useRouter();

  useEffect(() => {
    // The JWT refreshes its accountId on the next request (see jwt callback in lib/auth.ts).
    if (state?.ok) router.push("/onboarding/2");
  }, [state, router]);

  return (
    <form action={action} className="space-y-4 rounded-2xl border border-gray-200 bg-surface p-5 shadow-sm">
      <p className="text-gray-600">Welcome! Tell us about your business to get started.</p>
      {state && !state.ok && state.error ? <Alert>{state.error}</Alert> : null}
      <VerticalPicker catalog={catalog} value={vertical} onChange={setVertical} />
      <Field label="Business name" htmlFor="businessName">
        <Input id="businessName" name="businessName" required placeholder="Luigi's Trattoria" autoComplete="organization" />
      </Field>
      <Button type="submit" size="lg" full disabled={pending || !!state?.ok || !vertical}>
        {pending ? "Creating…" : "Continue"}
      </Button>
    </form>
  );
}
