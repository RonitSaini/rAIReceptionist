"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { navIndexOf, useNavOrder } from "@/components/nav-corridor";
import { clearLeaving } from "@/lib/motion";

/** The last path this template mounted for, kept across client navigations; a hard load starts over. */
let lastPath: string | null = null;

/**
 * One element per path, which is what gives each page one arrival and only one (motion spec §10).
 *
 * The element is keyed by pathname rather than left to the template's own remount, because Next remounts
 * a template per child SEGMENT, and since 2026-09-08 the pages sit under the `(lists)` and `(detail)`
 * route groups — one segment each. Without the key a move between two list pages kept the same element
 * on screen, with its `data-leaving` stamp from the click still on it: the dimmed-page bug. With the key
 * a route change always lands on a fresh element, so no stamp can outlive the route it was set for.
 *
 * Its job is the corridor. Before the new page's first paint (a layout effect), the container is stamped
 * `data-corridor="down"` or `"up"` by comparing this path's row on the rail with the last one mounted —
 * so a click on the rail, a link from inside a page and the browser's own Back button all read correctly.
 * The stamp sets `--arrive-from`, which inherits into every arrival container below, so the page's exit
 * and its content's arrival travel the same way. A hard load has no history and arrives the plain way.
 *
 * A search-param change keeps the key, so a filter click or a tab swap cannot replay a page's arrival —
 * the no-replay guarantee comes free, and Settings, which DOES want a crossfade per tab, asks for it
 * explicitly with a key of its own.
 *
 * Nothing here delays the route change: React has already committed the new page by the time this effect
 * runs, and the leave that preceded it (`leavePage`, stamped on click) was never awaited. The commit
 * clears every leaving stamp, and so do `popstate` and `pageshow`, which bypass the click path.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const order = useNavOrder();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // The route has committed: whatever was stamped leaving on the click is done, wherever it sits.
    clearLeaving();
    if (lastPath !== null && lastPath !== pathname) {
      const from = navIndexOf(order, lastPath);
      const to = navIndexOf(order, pathname);
      // Only a move BETWEEN rail rows has a direction. Anything else (into a detail page, or from a
      // path the rail does not own) arrives the plain way rather than guessing at one.
      if (from >= 0 && to >= 0 && from !== to) el.dataset.corridor = to > from ? "down" : "up";
    }
    lastPath = pathname;
  }, [pathname, order]);

  useEffect(() => {
    window.addEventListener("popstate", clearLeaving);
    window.addEventListener("pageshow", clearLeaving);
    return () => {
      window.removeEventListener("popstate", clearLeaving);
      window.removeEventListener("pageshow", clearLeaving);
    };
  }, []);

  // Grows to fill <main>, which is a flex column, so a page can stand something on the floor of the
  // content area: a root marked data-floor turns this wrapper into a flex column (globals.css) and puts
  // its footnote there with mt-auto. Every other page keeps block flow inside, where an auto margin
  // still centres a capped-width pane. Layout only; the entrance is the .page-enter class.
  return (
    <div key={pathname} ref={ref} className="page-enter grow">
      {children}
    </div>
  );
}
