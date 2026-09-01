"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createAccountForCurrentUser } from "@/actions/auth";
import { Alert, Button, Field, Input } from "@/components/ui";
import { VerticalPicker } from "@/components/forms/vertical-picker";
import { TermsCheckbox } from "@/components/terms-checkbox";
import type { VerticalCatalogEntry } from "@/verticals/types";

/**
 * Step 1 for a signed-in user with no Account yet — in practice, someone who arrived through Google.
 *
 * `needsTerms` is why the box appears at all. Consent is normally captured before the OAuth redirect
 * (the signed cookie) or already on file, and then this form must not ask again. But a Google user
 * who signed in from the LOGIN page, or one who predates the current terms version, reaches here
 * with nothing on file, and `createAccountForCurrentUser` refuses them. The re-consent interstitial
 * cannot cover it: that lives in the (app) layout, behind requireAccount(), and these users have no
 * account yet. So this is the one place left to ask, and without the box the refusal was a dead end.
 */
export function CreateAccountForm({ catalog, needsTerms = false }: { catalog: readonly VerticalCatalogEntry[]; needsTerms?: boolean }) {
  const [vertical, setVertical] = useState("");
  const [agreed, setAgreed] = useState(false);
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
      {needsTerms ? <TermsCheckbox checked={agreed} onChange={setAgreed} /> : null}
      <Button type="submit" size="lg" full disabled={pending || !!state?.ok || !vertical || (needsTerms && !agreed)}>
        {pending ? "Creating…" : "Continue"}
      </Button>
    </form>
  );
}
