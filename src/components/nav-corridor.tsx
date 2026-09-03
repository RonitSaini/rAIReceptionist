"use client";

import { createContext, useContext } from "react";

/**
 * The rail's order, in a client context — the one thing the page transition needs and cannot work out
 * for itself (motion spec §10, beat two).
 *
 * The rail is assembled on the server from the account's vertical (src/lib/nav.ts), so the order differs
 * per profession and the template cannot hardcode it. The layout resolves it once and publishes the
 * hrefs here; `(app)/template.tsx` compares the path it is mounting for against the path it mounted for
 * last and turns the difference into a DIRECTION — down the rail or up it. That direction is the whole
 * of the corridor: it sets one custom property, and the page's exit and its content's arrival both read it,
 * so a click on Settings and a click back up to Home are felt as opposite moves rather than the same fade.
 *
 * Hrefs only, deliberately: labels and icons are the rail's business, and shipping them twice would put
 * a second copy of the vocabulary in the bundle for no gain.
 */
const NavOrderContext = createContext<readonly string[]>([]);

export function NavOrderProvider({ order, children }: { order: readonly string[]; children: React.ReactNode }) {
  return <NavOrderContext.Provider value={order}>{children}</NavOrderContext.Provider>;
}

export function useNavOrder(): readonly string[] {
  return useContext(NavOrderContext);
}

/**
 * Which rail row a path belongs to, or -1 for a path the rail does not own (a detail page under no
 * module, the billing return). Longest match wins, so `/jobs/123` belongs to `/jobs` and never to a
 * shorter href that happens to prefix it.
 */
export function navIndexOf(order: readonly string[], pathname: string): number {
  let best = -1;
  let bestLength = 0;
  order.forEach((href, i) => {
    if (pathname !== href && !pathname.startsWith(href + "/")) return;
    if (href.length <= bestLength) return;
    best = i;
    bestLength = href.length;
  });
  return best;
}
