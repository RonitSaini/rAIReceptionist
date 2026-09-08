"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, type CSSProperties } from "react";
import { DrawIcon } from "@/components/draw-icon";
import type { IconName } from "@/components/icon-paths";
import { useRedrawActiveIcon } from "@/components/use-redraw-active-icon";
import { navIndexOf } from "@/components/nav-corridor";
import { leavePage } from "@/lib/motion";

export type SidebarNavItem = { href: string; label: string; icon?: IconName };

/**
 * The nav rail — beat one of the navigation gesture (motion spec §10).
 *
 * ONE indicator, and it is positioned by index arithmetic rather than by measurement: `.nav-rail`
 * publishes the row height, gap and vertical padding, the rows read the same metrics back through
 * `.nav-row`, and the pill's transform is `(row + gap) × --nav-active`. The index is rendered by the
 * server, so the first painted frame is already correct — there is no effect, nothing to measure and
 * therefore nothing that can jump on load. A transition exists only for a CHANGE of index, which is
 * exactly the route change it is meant to describe. The rail sits in the layout, not the template, so
 * the pill's DOM node survives the navigation and can slide rather than re-appear.
 *
 * The gliding hover highlight this component used to carry is gone (rule 32): a cursor crossing the
 * rail is not a state change, and a second travelling element competed with the one that means
 * something. Hover is colour alone, at the clamped fast beat. Rows press (`.press-soft`).
 *
 * Icons draw on mount, staggered down the rail, and when the active item changes — never on hover
 * (§5 rule 8).
 */
export function SidebarNav({ items }: { items: SidebarNavItem[] }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const activeIndex = navIndexOf(
    items.map((it) => it.href),
    pathname,
  );
  useRedrawActiveIcon(navRef, pathname);

  return (
    <nav ref={navRef} className="nav-rail relative flex shrink-0 flex-col gap-1 px-3 py-2 short:gap-0.5 short:py-1" aria-label="Main">
      {/* The one active indicator. Its left-edge accent bar is this element's own ::before, so the rail
          has a single moving part. Absent entirely on a path the rail does not own, rather than parked
          at row zero claiming a page the owner is not on. */}
      {activeIndex >= 0 ? (
        <span
          aria-hidden="true"
          className="nav-pill pointer-events-none absolute left-3 right-3 rounded-xl bg-brand-50"
          style={{ top: "var(--nav-pad)", "--nav-active": activeIndex } as CSSProperties}
        />
      ) : null}

      {items.map((it, i) => {
        const active = i === activeIndex;
        return (
          <Link
            key={it.href}
            href={it.href}
            data-active={active ? "true" : "false"}
            aria-current={active ? "page" : undefined}
            // Beat two, started on the click itself and never awaited: the navigation goes in this same
            // tick. A click on the row already showing is not a move and gets no exit.
            onClick={() => {
              if (activeIndex >= 0 && i !== activeIndex) leavePage(i > activeIndex ? "down" : "up", it.href);
            }}
            className={`nav-row press-soft relative z-10 flex items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors ${active ? "text-brand-800" : "text-gray-600 hover:bg-gray-50 hover:text-ink"}`}
          >
            {it.icon ? <DrawIcon name={it.icon} size={18} delay={i * 70} className="shrink-0" /> : null}
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
