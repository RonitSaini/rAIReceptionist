"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { INTERACTION, prefersReducedMotion, scaled } from "@/lib/motion";
import { cx } from "@/lib/cx";
import { DrawIcon } from "@/components/draw-icon";

/**
 * A transient confirmation. Slides up from the bottom edge (above the tab bar on a phone, bottom
 * right on a desktop), holds, and leaves faster than it came. Rendered into <body> so no animated
 * ancestor can capture its fixed position. role="status", so it is announced without stealing focus.
 * Success only: an error stays inline where the user is looking (Alert), and never auto-dismisses.
 * Reduced motion: appears and disappears in place, on the same clock.
 */
export function Toast({ children, hold = INTERACTION.toastHold, onDone }: { children: ReactNode; hold?: number; onDone?: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setLeaving(true), hold);
    return () => clearTimeout(t);
  }, [hold]);

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(
      () => {
        setGone(true);
        onDone?.();
      },
      prefersReducedMotion() ? 0 : scaled(INTERACTION.exit.standard),
    );
    return () => clearTimeout(t);
  }, [leaving, onDone]);

  if (gone || typeof document === "undefined") return null;
  return createPortal(
    <div className="toast-host">
      <div role="status" className={cx("toast", leaving && "is-leaving")}>
        <DrawIcon name="check" size={18} className="draw-fast shrink-0 text-green-700" />
        <span>{children}</span>
      </div>
    </div>,
    document.body,
  );
}
