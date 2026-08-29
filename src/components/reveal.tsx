"use client";

import { createElement, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * Fades, lifts and un-blurs its content into view the first time it scrolls onscreen,
 * with an optional stagger via `index`. Ported from 21st.dev's "Reveal" (asanshay) to CSS —
 * see .reveal in globals.css. Without JavaScript the content simply shows.
 */
export function Reveal({
  children,
  index = 0,
  as = "div",
  className = "",
  style,
  ...rest
}: {
  children: ReactNode;
  index?: number;
  as?: keyof React.JSX.IntrinsicElements;
  className?: string;
  style?: CSSProperties;
} & Record<string, unknown>) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -5% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return createElement(
    as,
    {
      ref,
      className: `reveal ${visible ? "is-visible" : ""} ${className}`.trim(),
      style: { ...style, "--reveal-delay": `${Math.min(index, 12) * 70}ms` } as CSSProperties,
      ...rest,
    },
    children,
  );
}
