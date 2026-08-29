"use client";

import { useEffect, useRef, type CSSProperties, type HTMLAttributes, type ReactNode, type RefObject } from "react";

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
  as?: "div" | "li" | "section" | "article" | "span";
  className?: string;
  style?: CSSProperties;
} & HTMLAttributes<HTMLElement>) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const show = () => el.classList.add("is-visible");
    if (typeof IntersectionObserver === "undefined") {
      show();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          show();
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -5% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const Tag = as as "div";
  return (
    <Tag ref={ref as RefObject<HTMLDivElement>} className={`reveal ${className}`.trim()} style={{ ...style, "--reveal-delay": `${Math.min(index, 12) * 70}ms` } as CSSProperties} {...rest}>
      {children}
    </Tag>
  );
}
