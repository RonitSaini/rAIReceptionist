"use client";

import { useEffect, useState } from "react";

/**
 * Cycles through a list of words with the house blur-slide (see .word-stack in globals.css). All
 * words share one grid cell so the widest sets the width — nothing ever shifts. Decorative:
 * aria-hidden, first word server-rendered visible for no-JS visitors, frozen under reduced motion.
 * Behavior adapted from 21st.dev "Word Carousel Text" (animbits #19230), ported to house CSS.
 */
const PILL_SETTLED_MS = 1200;

export function WordCarousel({ words, intervalMs = 2600, className = "" }: { words: readonly string[]; intervalMs?: number; className?: string }) {
  const [[current, leaving], setIndices] = useState<[number, number | null]>([0, null]);

  /* The pill slides in during the hero's entrance and has landed by ~1.1 s on the page clock; the
     first rotation waits for that (never mid-rotation while sliding), then cycles as usual. */
  useEffect(() => {
    if (words.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let interval: number | undefined;
    const tick = () => setIndices(([c]) => [(c + 1) % words.length, c]);
    const first = window.setTimeout(() => {
      tick();
      interval = window.setInterval(tick, intervalMs);
    }, Math.max(intervalMs, PILL_SETTLED_MS - performance.now()));
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [words.length, intervalMs]);

  /* Until the first rotation the current word is simply there — no blur-in on mount, which read as
     text loading late during the hero's entrance. Only a rotation animates. */
  const still = leaving === null;

  return (
    <span className={`word-stack ${className}`.trim()} aria-hidden="true">
      {words.map((w, i) => (
        <span key={w} className={`word${i === current ? ` is-in${still ? " is-still" : ""}` : ""}${i === leaving ? " is-out" : ""}`}>
          {w}
        </span>
      ))}
    </span>
  );
}
