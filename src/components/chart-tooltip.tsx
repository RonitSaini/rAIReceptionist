"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Breathing room between the label and the window edge. */
const MARGIN = 8;

/** Never fires: the only thing this store reports is server render vs client render. */
const noSubscribe = () => () => {};

/**
 * Hover tooltip for server-rendered SVG charts. Any descendant with a `data-tip`
 * attribute shows its text in a floating label; nothing re-renders (DOM only).
 *
 * The label is PORTALLED to <body> rather than rendered beside the chart, and that is load-bearing
 * rather than tidy. Reported 2026-09-03: hovering the dashboard chart pulled a horizontal AND a
 * vertical scrollbar onto the page for as long as the pointer was over a bar.
 *
 * `position: fixed` cannot do that on its own -- a fixed box is outside the document scroll area --
 * so something in the chain was making it resolve against an ancestor instead of the viewport, which
 * turns these viewport coordinates into a box far outside the page. Any of transform, filter,
 * backdrop-filter, will-change, contain, or the `column-count: 2` on `.dash-masonry` (the dashboard
 * grid these cards sit in, and the only one of those actually present) can do it. Which one was NOT
 * confirmed in a browser, so do not trust a single name here.
 *
 * <body> settles it whatever the cause: with no app wrapper left in the ancestor chain there is
 * nothing to reinterpret `fixed`, and the viewport is the containing block again.
 */
export function ChartTooltip({ children, className = "" }: { children: ReactNode; className?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  // False through the server render and hydration, true afterwards. <body> does not exist on the
  // server, and the label is decoration a non-hovering visitor never needs.
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);

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

      // Measured after the text is written, because the label is `white-space: nowrap` and its width
      // is whatever this particular tip says. Clamping keeps it on screen for the first and last bar
      // of a chart and for the top row of a stack -- and means a future containing-block surprise
      // costs a clipped label rather than scrollbars again.
      const r = target.getBoundingClientRect();
      const half = tip.offsetWidth / 2;
      const x = Math.min(Math.max(r.left + r.width / 2, half + MARGIN), window.innerWidth - half - MARGIN);
      // `top` is the bar's top edge; the CSS transform lifts the label its own height plus 10px above
      // that, so this floor is what stops it being pushed off the top of the window.
      const y = Math.max(r.top, tip.offsetHeight + 10 + MARGIN);

      tip.style.left = `${x}px`;
      tip.style.top = `${y}px`;
      tip.classList.add("is-on");
    };
    const hide = () => tip.classList.remove("is-on");
    root.addEventListener("pointermove", show);
    root.addEventListener("pointerleave", hide);
    // A scroll moves the chart out from under a label that is anchored to the viewport, and on a
    // touch screen the pointer never "leaves" to dismiss it.
    window.addEventListener("scroll", hide, { passive: true, capture: true });
    return () => {
      root.removeEventListener("pointermove", show);
      root.removeEventListener("pointerleave", hide);
      window.removeEventListener("scroll", hide, { capture: true });
    };
  }, [mounted]);

  return (
    <div ref={rootRef} className={className}>
      {children}
      {mounted ? createPortal(<div ref={tipRef} className="viz-tooltip" role="tooltip" aria-hidden="true" />, document.body) : null}
    </div>
  );
}
