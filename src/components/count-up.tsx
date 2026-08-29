"use client";

import { useEffect, useRef } from "react";

const defaultFormat = (n: number) => new Intl.NumberFormat("en-US").format(n);

/**
 * Number that eases from 0 to its value on mount and re-eases whenever the value changes.
 * Ported from 21st.dev's "Count Up" (unlumen) to requestAnimationFrame — no animation library.
 * Writes the DOM directly during the animation (no re-renders); the server render shows the
 * final value, and reduced-motion users never see it animate.
 */
export function CountUp({ to, duration = 800, className = "", format = defaultFormat }: { to: number; duration?: number; className?: string; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const currentRef = useRef(0); // value currently shown; 0 so the first mount counts up
  const formatRef = useRef(format);
  useEffect(() => {
    formatRef.current = format;
  }, [format]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const from = currentRef.current;
    if (reduce || from === to) {
      el.textContent = formatRef.current(to);
      currentRef.current = to;
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const v = t < 1 ? from + (to - from) * eased : to;
      currentRef.current = v;
      el.textContent = formatRef.current(Math.round(v));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);

  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {format(to)}
    </span>
  );
}
