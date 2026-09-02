"use client";

import { useEffect, useRef, useState } from "react";
import { HERO_TIMING, sequenceOrigin } from "@/lib/motion";

/**
 * Cycles through a list of words with the house blur-slide (see .word-stack in globals.css). All
 * words share one grid cell so the widest sets the width — nothing ever shifts. Decorative:
 * aria-hidden, first word server-rendered visible for no-JS visitors, frozen under reduced motion.
 * Behavior adapted from 21st.dev "Word Carousel Text" (animbits #19230), ported to house CSS.
 */
export function WordCarousel({ words, intervalMs = HERO_TIMING.wordInterval, className = "" }: { words: readonly string[]; intervalMs?: number; className?: string }) {
  const [[current, leaving], setIndices] = useState<[number, number | null]>([0, null]);
  const ref = useRef<HTMLSpanElement>(null);

  /* The first rotation waits for the whole entrance to land (HERO_TIMING.wordFirstRotation on the
     sequence clock, read through sequenceOrigin(): never a rotation while the pill slides or another
     element is arriving), then cycles on an interval of two conversation beats, so a rotation sits in
     the quiet half of a beat instead of landing on a bubble. */
  useEffect(() => {
    if (words.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let interval: number | undefined;
    const tick = () => setIndices(([c]) => [(c + 1) % words.length, c]);
    const first = window.setTimeout(() => {
      tick();
      interval = window.setInterval(tick, intervalMs);
    }, Math.max(HERO_TIMING.minStart, sequenceOrigin(ref.current) + HERO_TIMING.wordFirstRotation - performance.now()));
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [words.length, intervalMs]);

  /* Until the first rotation the current word is simply there — no blur-in on mount, which read as
     text loading late during the hero's entrance. Only a rotation animates. */
  const still = leaving === null;

  return (
    <span ref={ref} className={`word-stack ${className}`.trim()} aria-hidden="true">
      {words.map((w, i) => (
        <span key={w} className={`word${i === current ? ` is-in${still ? " is-still" : ""}` : ""}${i === leaving ? " is-out" : ""}`}>
          {w}
        </span>
      ))}
    </span>
  );
}
