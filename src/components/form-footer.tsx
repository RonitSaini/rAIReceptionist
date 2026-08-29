"use client";

import Link from "next/link";
import type { ActionState } from "@/lib/form";
import { Alert, Button } from "@/components/ui";

export type FormMode = "onboarding" | "settings";

/** Shared status + submit area for onboarding/settings forms. */
export function FormFooter({ state, pending, mode, backHref, submitLabel }: { state: ActionState; pending: boolean; mode: FormMode; backHref?: string; submitLabel?: string }) {
  return (
    <div className="space-y-3 pt-2">
      {state && !state.ok && state.error ? <Alert>{state.error}</Alert> : null}
      {state?.ok && state.message ? <Alert kind="success">{state.message}</Alert> : null}
      <input type="hidden" name="mode" value={mode} />
      <Button type="submit" size="lg" full disabled={pending}>
        {pending ? "Saving…" : submitLabel ?? (mode === "onboarding" ? "Save and continue" : "Save changes")}
      </Button>
      {mode === "onboarding" && backHref ? (
        <Link href={backHref} className="block text-center text-sm font-semibold text-gray-500 hover:text-ink">
          Back
        </Link>
      ) : null}
    </div>
  );
}
