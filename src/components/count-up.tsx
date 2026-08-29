"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Number that eases from 0 to its value on mount and re-eases whenever the value changes.
 * Ported from 21st.dev's "Count Up" (unlumen) to requestAnimationFrame — no animation library.
 * Server render shows the final value; reduced-motion users never see it animate.
 */
export function CountUp({ to, duration = 800, className = "", format }: { to: number; duration?: number; className?: string; format?: (n: number) => string }) {
  const [shown, setShown] = useState(to);
  const fromRef = useRef(0);
  const startedRef = useRef(false);

  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(to);
      return;
    }
    const from = startedRef.current ? fromRef.current : 0;
    startedRef.current = true;
    if (from === to) {
      setShown(to);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const v = from + (to - from) * eased;
      setShown(t < 1 ? v : to);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      fromRef.current = to;
    };
  }, [to, duration]);

  useEffect(() => {
    fromRef.current = shown;
  }, [shown]);

  const text = format ? format(Math.round(shown)) : new Intl.NumberFormat("en-US").format(Math.round(shown));
  return (
    <span className={`tabular-nums ${className}`} aria-live="off">
      {text}
    </span>
  );
}
