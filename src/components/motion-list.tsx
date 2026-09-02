"use client";

import { Children, isValidElement, useEffect, useLayoutEffect, useRef, type HTMLAttributes, type ReactNode } from "react";
import { INTERACTION, prefersReducedMotion } from "@/lib/motion";
import { cx } from "@/lib/cx";

type Seen = { el: HTMLElement; x: number; y: number; at: number };

/**
 * A list whose rows answer data.
 *
 * The rows are whatever the page rendered — keyed elements, server or client — so a page keeps
 * rendering its rows exactly as before and only swaps its <ul> for this. After every commit the
 * live DOM children are paired with the React keys (same order) and compared with the last commit:
 *
 * - a row that arrived after mount enters (.row-enter: fades up four pixels, standard beat);
 * - a row React just removed is put back, detached node and all, at its old index for its exit
 *   (.row-exit, exit beat), then dropped — so what leaves is what was last on screen, exactly;
 * - a row that moved, because one above it left or the order changed, slides from its old offset
 *   to its new one (FLIP: an inline transform back to the old spot, then transitioned away).
 *
 * Keys are read from the elements and written to the DOM only after hydration (data-row-key), so
 * a key minted by a client-side counter never has to match the server's. Transform and opacity
 * only: React commits the final layout at once and the motion is drawn on top, never a delay in
 * front of it. First mount animates nothing — arrival at page load belongs to the page (or a
 * <Reveal>), not to the row. A row carrying data-urgent enters instantly (an alarm does not fade in)
 * and exits at the quiet end of the ladder. Reduced motion: rows swap at once. Every child must be
 * a keyed element; if the DOM and the keys ever disagree in number, that commit is left alone.
 */
export function MotionList({ as: Tag = "ul", children, className, ...rest }: { as?: "ul" | "ol" | "div" | "section"; children: ReactNode; className?: string } & HTMLAttributes<HTMLElement>) {
  const host = useRef<HTMLElement>(null);
  const seen = useRef(new Map<string, Seen>());
  const mounted = useRef(false);
  const leaving = useRef(new Map<HTMLElement, number>()); // detached rows mid-exit → their removal timer

  const keys: string[] = [];
  Children.forEach(children, (child) => {
    if (isValidElement(child) && child.key != null) keys.push(String(child.key));
  });

  useLayoutEffect(() => {
    const list = host.current;
    if (!list) return;
    const reduce = prefersReducedMotion();
    const prev = seen.current;
    const live = Array.from(list.children).filter((c): c is HTMLElement => c instanceof HTMLElement && !c.classList.contains("row-exit"));
    if (live.length !== keys.length) {
      seen.current = new Map();
      mounted.current = true;
      return;
    }
    live.forEach((el, i) => (el.dataset.rowKey = keys[i]));
    const liveKeys = new Set(keys);

    // Leaving: a row the last commit had, whose node React has now taken out of the document.
    if (!reduce) {
      for (const [key, old] of prev) {
        if (liveKeys.has(key) || old.el.isConnected) continue;
        old.el.classList.add("row-exit");
        old.el.setAttribute("aria-hidden", "true");
        list.insertBefore(old.el, list.children[old.at] ?? null);
        const ms = (old.el.dataset.urgent !== undefined ? INTERACTION.exit.fast : INTERACTION.exit.standard) + 30;
        const t = window.setTimeout(() => {
          old.el.remove();
          leaving.current.delete(old.el);
        }, ms);
        leaving.current.set(old.el, t);
      }
    }

    // Arriving and moving. Offsets, not client rects: a row mid-slide is still measured where it belongs.
    const next = new Map<string, Seen>();
    live.forEach((el, i) => {
      const key = keys[i];
      const pos = { x: el.offsetLeft, y: el.offsetTop };
      const was = prev.get(key);
      if (!reduce && mounted.current) {
        if (!was) {
          if (el.dataset.urgent === undefined) el.classList.add("row-enter");
        } else if (was.el === el) {
          const dx = was.x - pos.x;
          const dy = was.y - pos.y;
          if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
            el.style.transition = "none";
            el.style.transform = `translate(${dx}px, ${dy}px)`;
            void el.offsetWidth; // flush, so the slide starts from the old spot
            el.style.transition = "transform var(--m-standard) var(--m-ease)";
            el.style.transform = "";
            const done = () => {
              el.style.transition = "";
              el.removeEventListener("transitionend", done);
            };
            el.addEventListener("transitionend", done);
          }
        }
      }
      next.set(key, { el, x: pos.x, y: pos.y, at: i });
    });
    seen.current = next;
    mounted.current = true;
  });

  // Unmount: drop anything still mid-exit.
  useEffect(() => {
    const pending = leaving.current;
    return () => {
      for (const [el, t] of pending) {
        clearTimeout(t);
        el.remove();
      }
      pending.clear();
    };
  }, []);

  return (
    <Tag ref={host as never} className={cx("motion-list", className)} {...rest}>
      {children}
    </Tag>
  );
}
