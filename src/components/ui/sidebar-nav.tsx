"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { DrawIcon } from "@/components/draw-icon";
import type { IconName } from "@/components/icon-paths";
import { useRedrawActiveIcon } from "@/components/use-redraw-active-icon";

export type SidebarNavItem = { href: string; label: string; icon?: IconName };

/**
 * Vertical nav with a hover highlight that glides between items and an accent bar that slides to the
 * active page. Adapted from 21st.dev's "Animated Sidebar" (unlumen) to CSS transitions + direct DOM
 * positioning — no animation library.
 *
 * Items are uniform height, so the highlight and bar only ever TRANSLATE (transform-only: no layout
 * animation, no rounded-corner distortion). Their height is set — never transitioned — on mount and
 * resize. Icons draw on mount (staggered down the rail) and when the active item changes; never on hover.
 */
export function SidebarNav({ items }: { items: SidebarNavItem[] }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const highlightRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  /** Move the highlight (and optionally the bar) to a nav item — pure DOM writes, no re-render. */
  const moveTo = useCallback((el: HTMLElement | null, opts: { bar?: boolean; instant?: boolean } = {}) => {
    const hl = highlightRef.current;
    const bar = barRef.current;
    if (!el || !hl) return;
    const y = el.offsetTop;
    const h = el.offsetHeight;
    if (opts.instant) hl.style.transition = "none";
    hl.style.height = `${h}px`;
    hl.style.transform = `translateY(${y}px)`;
    hl.style.opacity = "1";
    if (opts.instant) requestAnimationFrame(() => (hl.style.transition = ""));
    if (opts.bar && bar) {
      if (opts.instant) bar.style.transition = "none";
      bar.style.height = `${h * 0.5}px`;
      bar.style.transform = `translateY(${y + h * 0.25}px)`;
      bar.style.opacity = "1";
      if (opts.instant) requestAnimationFrame(() => (bar.style.transition = ""));
    }
  }, []);

  const activeEl = () => navRef.current?.querySelector<HTMLElement>('[data-active="true"]') ?? null;

  // Snap the highlight + bar to the active item on mount, route change and resize.
  useEffect(() => {
    moveTo(activeEl(), { bar: true, instant: true });
    const onResize = () => moveTo(activeEl(), { bar: true, instant: true });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [pathname, moveTo]);

  useRedrawActiveIcon(navRef, pathname);

  return (
    <nav ref={navRef} className="relative flex shrink-0 flex-col gap-1 px-3 py-2 short:gap-0.5 short:py-1" onMouseLeave={() => moveTo(activeEl())} aria-label="Main">
      {/* Gliding hover highlight */}
      <span ref={highlightRef} aria-hidden="true" className="nav-highlight pointer-events-none absolute left-3 right-3 top-0 rounded-xl bg-brand-50 opacity-0" />
      {/* Active accent bar on the left edge */}
      <span ref={barRef} aria-hidden="true" className="nav-bar pointer-events-none absolute left-0 top-0 w-1 rounded-r-full bg-brand-600 opacity-0" />

      {items.map((it, i) => {
        const active = isActive(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            data-active={active ? "true" : "false"}
            aria-current={active ? "page" : undefined}
            onMouseEnter={(e) => moveTo(e.currentTarget)}
            onFocus={(e) => moveTo(e.currentTarget)}
            className={`relative z-10 flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors short:min-h-9 ${active ? "text-brand-800" : "text-gray-600 hover:text-ink"}`}
          >
            {it.icon ? <DrawIcon name={it.icon} size={18} delay={i * 70} className="shrink-0" /> : null}
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
