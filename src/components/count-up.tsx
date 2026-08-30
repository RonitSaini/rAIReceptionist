"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

const defaultFormat = (n: number) => new Intl.NumberFormat("en-US").format(n);
/** Expo-out: the CSS `cubic-bezier(.22,1,.36,1)` arrival curve, in JS. */
const expoOut = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

type View = { value: number; prev?: string; dir?: 1 | -1 };

/**
 * Animated number. Ported from 21st.dev's "Count Up" (unlumen) to requestAnimationFrame, with the
 * changed-digits behaviour of "Animate Digits" (unlumen) ported to CSS — no animation library.
 *
 * - Mount: tweens 0 → value with the expo-out arrival easing (550ms) — but only when there's a
 *   distance to travel. Below `threshold` it snaps and lets the surrounding `.reveal` carry it in.
 * - Change after mount: the container pops (`.badge-pop`). The pop is never on the digits: a value
 *   tween must not overshoot — a number that reads 13 then settles to 12 is a data lie.
 *   `live` values swap only the digits that changed (blur-slide in the direction of travel) instead
 *   of tweening; other values tween (or snap, below the threshold).
 * - Reduced motion: always snaps.
 */
export function CountUp({
  to,
  duration = 550,
  threshold = 10,
  live = false,
  className = "",
  format = defaultFormat,
}: {
  to: number;
  duration?: number;
  /** Minimum distance (|to − shown|) before a tween is worth running; smaller changes snap. */
  threshold?: number;
  /** Value that changes while mounted (polled or refreshed): animate changed digits instead of tweening. */
  live?: boolean;
  className?: string;
  format?: (n: number) => string;
}) {
  const shown = useRef(0); // value currently on screen; 0 so the first mount counts up
  const mounted = useRef(false);
  const formatRef = useRef(format);
  const [view, setView] = useState<View>({ value: to });
  const [pop, setPop] = useState(0); // bumped on every post-mount change to replay .badge-pop

  useEffect(() => {
    formatRef.current = format;
  }, [format]);

  useEffect(() => {
    const from = shown.current;
    const first = !mounted.current;
    if (from === to) {
      mounted.current = true;
      return;
    }
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const snap = reduce || Math.abs(to - from) < threshold;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const v = t < 1 ? Math.round(from + (to - from) * expoOut(t)) : to;
      shown.current = v;
      setView({ value: v });
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(() => {
      // Flagged here, not synchronously, so Strict Mode's cancelled first run doesn't count as a mount.
      mounted.current = true;
      if (!first) setPop((k) => k + 1);
      if (!first && live && !reduce) {
        shown.current = to;
        setView({ value: to, prev: formatRef.current(from), dir: to > from ? 1 : -1 });
        return;
      }
      if (snap) {
        shown.current = to;
        setView({ value: to });
        return;
      }
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [to, duration, threshold, live]);

  const text = format(view.value);
  const style = view.dir ? ({ "--digit-dir": view.dir } as CSSProperties) : undefined;
  return (
    <span key={pop} className={`inline-block tabular-nums ${pop ? "badge-pop" : ""} ${className}`.trim()} style={style}>
      {view.prev != null ? <Digits prev={view.prev} next={text} /> : text}
    </span>
  );
}

/** Renders `next` one character per span; characters that differ from `prev` (right-aligned) slide in. */
function Digits({ prev, next }: { prev: string; next: string }) {
  const offset = prev.length - next.length;
  return (
    <>
      {Array.from(next, (ch, i) => {
        const changed = prev[i + offset] !== ch;
        return (
          <span key={i} className={changed ? "digit-in" : undefined}>
            {ch}
          </span>
        );
      })}
    </>
  );
}
