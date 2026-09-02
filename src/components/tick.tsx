"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { INTERACTION, prefersReducedMotion, scaled } from "@/lib/motion";
import { cx } from "@/lib/cx";

/**
 * A small number that ticks instead of snapping: the old value rolls out the top and the new one
 * rolls in from the bottom (down the other way), like one wheel of an odometer. Transform and
 * opacity only, no blur — this is for 11–14 px counts (the bell badge, a tab's count), below the
 * size where a blur-slide reads as anything but smear (motion spec rule 8's floor). Reduced motion
 * snaps.
 */
export function Tick({ value, className }: { value: number | string; className?: string }) {
  const text = String(value);
  const [seen, setSeen] = useState(text);
  const [old, setOld] = useState<{ text: string; dir: 1 | -1 } | null>(null);
  if (text !== seen) {
    const a = Number.parseFloat(seen);
    const b = Number.parseFloat(text);
    setSeen(text);
    if (!prefersReducedMotion()) setOld({ text: seen, dir: Number.isFinite(a) && Number.isFinite(b) && b < a ? -1 : 1 });
  }
  useEffect(() => {
    if (!old) return;
    const t = setTimeout(() => setOld(null), scaled(INTERACTION.standard) + 30);
    return () => clearTimeout(t);
  }, [old]);

  const style = old ? ({ "--tick-dir": old.dir } as CSSProperties) : undefined;
  return (
    <span className={cx("tick", className)} style={style}>
      {old ? (
        <span className="tick-out" aria-hidden="true">
          {old.text}
        </span>
      ) : null}
      <span key={text} className={old ? "tick-in" : undefined}>
        {text}
      </span>
    </span>
  );
}
