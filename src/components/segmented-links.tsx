"use client";

import Link from "next/link";
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "@/lib/cx";

export type SegmentedItem = { key: string; href: string; label: ReactNode; active: boolean };

/**
 * A strip of filter / tab links with one indicator that slides to the picked item.
 *
 * The items are variable-width pills, and a pill cannot slide transform-only in one piece — scaling
 * it squashes its corners (motion spec rule 5). So the indicator is three pieces, each transform-only:
 * a round left cap and a round right cap that translate, and a 1px body between them that scales.
 * The caps overlap the body by half their width, so no seam ever shows and no corner ever distorts.
 * Geometry is measured from the active link and written as CSS variables on the rail (.seg-rail).
 *
 * Click moves the indicator at once — navigation is never delayed or gated — and the server render
 * that follows finds the indicator already home. Without JavaScript the active link keeps its own
 * fill (the transparent override is gated on the rail having measured), so the strip reads the same.
 */
export function SegmentedLinks({
  items,
  fill = "solid",
  className,
  itemClass,
  activeClass,
  inactiveClass,
  pressed = false,
  leading,
  ...rest
}: {
  items: SegmentedItem[];
  /** solid = brand fill with white text; soft = tinted fill, the active link keeps its own border */
  fill?: "solid" | "soft";
  className?: string;
  itemClass: string;
  activeClass: string;
  inactiveClass: string;
  /** mirror the active state as aria-pressed (the notification filters do) */
  pressed?: boolean;
  /** an independent control that shares the strip (the "Unread only" toggle) — not part of the choice */
  leading?: ReactNode;
  role?: string;
  "aria-label"?: string;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<string | null>(null);
  const activeKey = items.find((i) => i.active)?.key ?? null;
  // The server caught up with the click: the pending key is the active one again.
  if (pending !== null && pending === activeKey) setPending(null);
  const shownKey = pending ?? activeKey;

  const place = useCallback((instant: boolean) => {
    const r = rail.current;
    if (!r) return;
    const el = shownKey === null ? null : r.querySelector<HTMLElement>(`[data-key="${CSS.escape(shownKey)}"]`);
    if (instant) r.classList.add("is-instant");
    if (el) {
      const h = el.offsetHeight;
      const x = el.offsetLeft;
      const w = el.offsetWidth;
      r.style.setProperty("--seg-h", `${h}px`);
      r.style.setProperty("--seg-x", `${x}px`);
      r.style.setProperty("--seg-xm", `${x + h / 2}px`);
      r.style.setProperty("--seg-sx", String(Math.max(0, w - h)));
      r.style.setProperty("--seg-xr", `${x + w - h}px`);
      r.style.setProperty("--seg-on", "1");
    } else {
      r.style.setProperty("--seg-on", "0");
    }
    r.dataset.ready = "";
    if (instant) {
      void r.offsetWidth; // commit the instant position before transitions come back
      requestAnimationFrame(() => r.classList.remove("is-instant"));
    }
  }, [shownKey]);

  // First paint and resize snap the indicator into place; a pick slides it.
  const first = useRef(true);
  useLayoutEffect(() => {
    place(first.current);
    first.current = false;
    const onResize = () => place(true);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [place]);

  return (
    <div ref={rail} className={cx("seg-rail", fill === "soft" ? "seg-soft" : "seg-solid", className)} {...rest}>
      <span aria-hidden="true" className="seg-ind" />
      <span aria-hidden="true" className="seg-ind-mid" />
      <span aria-hidden="true" className="seg-ind-r" />
      {leading}
      {items.map((it) => {
        const on = it.key === shownKey;
        return (
          <Link
            key={it.key}
            href={it.href}
            data-key={it.key}
            data-active={on ? "true" : "false"}
            aria-pressed={pressed ? on : undefined}
            onClick={() => setPending(it.key)}
            className={cx("seg-item press-soft", itemClass, on ? activeClass : inactiveClass)}
          >
            {it.label}
          </Link>
        );
      })}
    </div>
  );
}
