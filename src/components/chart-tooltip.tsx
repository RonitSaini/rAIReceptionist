"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Hover tooltip for server-rendered SVG charts. Any descendant with a `data-tip`
 * attribute shows its text in a floating label; nothing re-renders (DOM only).
 */
export function ChartTooltip({ children, className = "" }: { children: ReactNode; className?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const tip = tipRef.current;
    if (!root || !tip) return;
    const show = (e: PointerEvent) => {
      const target = (e.target as Element | null)?.closest<HTMLElement | SVGElement>("[data-tip]");
      if (!target) {
        tip.classList.remove("is-on");
        return;
      }
      const text = target.getAttribute("data-tip") ?? "";
      tip.textContent = "";
      for (const [i, line] of text.split("\n").entries()) {
        if (i > 0) tip.appendChild(document.createElement("br"));
        tip.appendChild(document.createTextNode(line));
      }
      const r = target.getBoundingClientRect();
      tip.style.left = `${r.left + r.width / 2}px`;
      tip.style.top = `${r.top}px`;
      tip.classList.add("is-on");
    };
    const hide = () => tip.classList.remove("is-on");
    root.addEventListener("pointermove", show);
    root.addEventListener("pointerleave", hide);
    return () => {
      root.removeEventListener("pointermove", show);
      root.removeEventListener("pointerleave", hide);
    };
  }, []);

  return (
    <div ref={rootRef} className={className}>
      {children}
      <div ref={tipRef} className="viz-tooltip" role="tooltip" aria-hidden="true" />
    </div>
  );
}
