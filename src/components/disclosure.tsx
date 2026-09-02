"use client";

import { useEffect, useState, type ReactNode } from "react";
import { INTERACTION } from "@/lib/motion";
import { cx } from "@/lib/cx";
import { Presence } from "@/components/presence";

/**
 * Content that folds open and shut (a confirmation, a day's service periods). The fold is the
 * pre-registered grid-template-rows collapse (motion spec rule 5): it has no transform-only
 * equivalent. Opens at the standard beat, closes faster (.fold-app in globals.css), and the content
 * is mounted only while open or leaving — the same mount semantics as the `{open ? … : null}` it
 * replaces, so nothing inside keeps state across a close.
 */
export function Disclosure({ open, className, children }: { open: boolean; className?: string; children: ReactNode }) {
  // A disclosure that is open when the page renders is simply open — no fold on mount (zero
  // entrance choreography in the app). Once it has closed, every later open transitions.
  const [settled, setSettled] = useState(open);
  if (!open && settled) setSettled(false);
  return (
    <Presence show={open} exit={INTERACTION.exit.standard}>
      {(state) => (
        <Fold open={state === "open"} instant={settled} className={className}>
          {children}
        </Fold>
      )}
    </Presence>
  );
}

function Fold({ open, instant, className, children }: { open: boolean; instant: boolean; className?: string; children: ReactNode }) {
  // Mounts shut and opens on the next frame, so an open transitions instead of appearing — unless it
  // was open from the start (`instant`), in which case it renders open, server and client alike.
  const [shown, setShown] = useState(open && instant);
  if (!open && shown) setShown(false);
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, [open]);
  return (
    <div className={cx("fold fold-app", shown && "is-open", className)}>
      <div>{children}</div>
    </div>
  );
}
