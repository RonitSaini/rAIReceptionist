"use client";

import { useEffect, useState } from "react";

/**
 * Cycles through a list of words with the house blur-slide (see .word-stack in globals.css). All
 * words share one grid cell so the widest sets the width — nothing ever shifts. Decorative:
 * aria-hidden, first word server-rendered visible for no-JS visitors, frozen under reduced motion.
 * Behavior adapted from 21st.dev "Word Carousel Text" (animbits #19230), ported to house CSS.
 */
export function WordCarousel({ words, intervalMs = 2600, className = "" }: { words: readonly string[]; intervalMs?: number; className?: string }) {
  const [[current, leaving], setIndices] = useState<[number, number | null]>([0, null]);

  useEffect(() => {
    if (words.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      setIndices(([c]) => [(c + 1) % words.length, c]);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [words.length, intervalMs]);

  return (
    <span className={`word-stack ${className}`.trim()} aria-hidden="true">
      {words.map((w, i) => (
        <span key={w} className={`word${i === current ? " is-in" : ""}${i === leaving ? " is-out" : ""}`}>
          {w}
        </span>
      ))}
    </span>
  );
}
