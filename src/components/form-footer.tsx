"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ActionState } from "@/lib/form";
import { INTERACTION, leaveGuided } from "@/lib/motion";
import { Alert, Button } from "@/components/ui";
import { DrawIcon } from "@/components/draw-icon";
import { Toast } from "@/components/toast";

export type FormMode = "onboarding" | "settings";

/**
 * Shared status + submit area for onboarding/settings forms.
 *
 * Pending: the label reads "Saving…" and the button is disabled (its fill dims) — a state shown by
 * text, not motion, so it survives reduced motion and never claims success early (motion spec rule
 * 11). Saved: only once the server has answered, the button draws a check beside "Saved" and holds
 * it for INTERACTION.savedHold, then offers the verb again. A message that says more than "Saved."
 * also rises as a toast (auto-dismissing); a bare "Saved." is already the button. Errors stay inline,
 * where the eye is, and never auto-dismiss.
 *
 * In onboarding this is the third group of the step's guided arrival (data-guided="3", motion spec §8);
 * in settings there is no .guided ancestor and the attribute does nothing.
 */
export function FormFooter({ state, pending, mode, backHref, submitLabel }: { state: ActionState; pending: boolean; mode: FormMode; backHref?: string; submitLabel?: string }) {
  // Every action result is a new object: count the successful ones so the check and toast replay per save.
  const [seen, setSeen] = useState<ActionState>(null);
  const [saves, setSaves] = useState(0);
  if (state !== seen) {
    setSeen(state);
    if (state?.ok) setSaves((n) => n + 1);
  }
  const label = submitLabel ?? (mode === "onboarding" ? "Save and continue" : "Save changes");
  const toastable = state?.ok && state.message && state.message !== "Saved." ? state.message : null;

  return (
    <div data-guided="3" className="space-y-3 pt-2">
      {state && !state.ok && state.error ? <Alert>{state.error}</Alert> : null}
      {saves > 0 && toastable ? <Toast key={saves}>{toastable}</Toast> : null}
      <input type="hidden" name="mode" value={mode} />
      <Button type="submit" size="lg" full disabled={pending}>
        {pending ? "Saving…" : saves > 0 && state?.ok ? <SavedLabel key={saves} label={label} /> : label}
      </Button>
      {mode === "onboarding" && backHref ? <BackLink href={backHref} /> : null}
    </div>
  );
}

/**
 * The onboarding Back link. On click the current step steps aside toward where it came from (the leave,
 * spec §8.3) and the navigation proceeds in the same tick — the leave is never waited on.
 */
export function BackLink({ href }: { href: string }) {
  return (
    <Link href={href} onClick={(e) => leaveGuided(e.currentTarget, "back")} className="press-soft block text-center text-sm font-semibold text-gray-500 hover:text-ink">
      Back
    </Link>
  );
}

/** "Saved" with a check that draws itself (the server just confirmed), then the verb again. */
function SavedLabel({ label }: { label: string }) {
  const [held, setHeld] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setHeld(false), INTERACTION.savedHold);
    return () => clearTimeout(t);
  }, []);
  if (!held) return label;
  return (
    <span className="saved-in inline-flex items-center gap-2">
      <DrawIcon name="check" size={18} className="draw-fast" />
      Saved
    </span>
  );
}
