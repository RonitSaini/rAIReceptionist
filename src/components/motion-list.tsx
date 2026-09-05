"use client";

import { Children, isValidElement, useEffect, useLayoutEffect, useRef, type HTMLAttributes, type ReactNode } from "react";
import { INTERACTION, prefersReducedMotion, scaled } from "@/lib/motion";
import { cx } from "@/lib/cx";

/** Where a row was at the last commit, and how big — enough to pin it there once it leaves. */
type Seen = { el: HTMLElement; x: number; y: number; w: number; h: number; at: number };

/**
 * A list whose rows answer data.
 *
 * The rows are whatever the page rendered — keyed elements, server or client — so a page keeps
 * rendering its rows exactly as before and only swaps its <ul> for this. After every commit the
 * live DOM children are paired with the React keys (same order) and compared with the last commit:
 *
 * - a row that arrived after mount enters (.row-enter: fades up four pixels, standard beat);
 * - a row React just removed is put back, detached node and all, pinned out of flow to the rect it
 *   held, for its exit (.row-exit, exit beat), then dropped — so what leaves is what was last on
 *   screen, exactly, and the gap it left closes at once instead of waiting for it;
 * - a row that moved, because one above it left or the order changed, slides from its old offset
 *   to its new one (FLIP: an inline transform back to the old spot, then transitioned away).
 *
 * Keys are read from the elements and written to the DOM only after hydration (data-row-key), so
 * a key minted by a client-side counter never has to match the server's. Transform and opacity
 * only: React commits the final layout at once and the motion is drawn on top, never a delay in
 * front of it. First mount animates nothing: inside the app nothing enters on load (spec §7.6), so
 * a row that is on the page when it renders is simply there. A row carrying data-urgent enters
 * instantly (an alarm does not fade in) and exits at the quiet end of the ladder. Reduced motion: rows swap at once. Every child must be
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

    // Arriving and moving, BEFORE anything leaving is put back. React has already committed the
    // layout without the removed row, so this is where the survivors truly are — measure them now
    // and the FLIP below has a real distance to cover. Measuring after re-inserting a leaving row
    // was the bug this ordering exists to prevent: the row was put back IN FLOW, every survivor
    // measured at its old spot, no transform was ever written, and the list sat still for the
    // length of the exit and then jumped.
    //
    // Offsets, not client rects: a row mid-slide is still measured where it belongs.
    const next = new Map<string, Seen>();
    live.forEach((el, i) => {
      const key = keys[i];
      const pos = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
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
      next.set(key, { el, ...pos, at: i });
    });

    // Leaving: a row the last commit had, whose node React has now taken out of the document. It
    // goes back OUT OF FLOW — pinned to the rect it occupied, on top of the gap it left — so it can
    // fade where it was while the rows above close over it. In flow it would hold the gap open for
    // the length of its own exit, which is the one thing a row leaving must not do.
    if (!reduce) {
      for (const [key, old] of prev) {
        if (liveKeys.has(key) || old.el.isConnected) continue;
        old.el.classList.add("row-exit");
        old.el.setAttribute("aria-hidden", "true");
        // `.motion-list` is positioned, so it is the offsetParent these coordinates were read from.
        old.el.style.position = "absolute";
        old.el.style.margin = "0";
        old.el.style.left = `${old.x}px`;
        old.el.style.top = `${old.y}px`;
        old.el.style.width = `${old.w}px`;
        old.el.style.height = `${old.h}px`;
        list.appendChild(old.el);
        // Urgent rows leave at the clamped fast exit; everything else at the standard exit as the CSS is scaling it.
        const ms = (old.el.dataset.urgent !== undefined ? INTERACTION.exit.fast : scaled(INTERACTION.exit.standard)) + 30;
        const t = window.setTimeout(() => {
          old.el.remove();
          leaving.current.delete(old.el);
        }, ms);
        leaving.current.set(old.el, t);
      }
    }

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
