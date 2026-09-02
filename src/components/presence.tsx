"use client";

import { useEffect, useState, type ReactNode } from "react";
import { INTERACTION, prefersReducedMotion } from "@/lib/motion";

/**
 * Keeps something mounted long enough to leave.
 *
 * `show` is the truth; the render function receives "open" while it is true and "closed" for the
 * `exit` milliseconds after it flips false, so the closed look (a menu-out, a fold collapsing) can
 * play before the element is removed. Reduced motion removes it at once. Nothing is wrapped: the
 * caller renders exactly the element it always did, with the state as a class.
 */
export function Presence({ show, exit = INTERACTION.exit.standard, children }: { show: boolean; exit?: number; children: (state: "open" | "closed") => ReactNode }) {
  const [phase, setPhase] = useState<"open" | "closing" | "closed">(show ? "open" : "closed");
  if (show && phase !== "open") setPhase("open");
  if (!show && phase === "open") setPhase(prefersReducedMotion() ? "closed" : "closing");

  useEffect(() => {
    if (phase !== "closing") return;
    const t = setTimeout(() => setPhase("closed"), exit);
    return () => clearTimeout(t);
  }, [phase, exit]);

  if (phase === "closed") return null;
  return <>{children(phase === "open" ? "open" : "closed")}</>;
}
