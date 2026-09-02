"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { DrawIcon } from "@/components/draw-icon";
import type { NavItem } from "@/lib/nav";
import { SidebarNav } from "@/components/ui/sidebar-nav";
import { useRedrawActiveIcon } from "@/components/use-redraw-active-icon";

/**
 * The nav rail and the mobile tab bar.
 *
 * Items arrive as a prop, resolved on the server from the account's vertical (src/lib/nav.ts).
 * Nothing here knows what a profession is; it only knows how to render and animate a list.
 */
export function AppNav({ variant, items }: { variant: "sidebar" | "tabs"; items: NavItem[] }) {
  if (variant === "sidebar") return <SidebarNav items={items} />;
  return <MobileTabs items={items} />;
}

/** Mobile bottom tabs: no hover on touch. The active bar slides along the top edge (transform-only). */
function MobileTabs({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const activeIndex = items.findIndex((it) => isActive(it.href));
  useRedrawActiveIcon(ref, pathname);

  // Column count and bar width come from the item count rather than a hardcoded `grid-cols-5` /
  // `w-1/5`: a vertical with a different number of modules must not shear the tab bar. Both are
  // static inline values, so the bar still animates by transform alone.
  const columns = Math.max(items.length, 1);

  return (
    <div ref={ref} className="relative grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      <span
        aria-hidden="true"
        className="nav-bar pointer-events-none absolute left-0 top-0 h-0.5 rounded-b-full bg-brand-500"
        style={{ width: `${100 / columns}%`, transform: `translateX(${Math.max(activeIndex, 0) * 100}%)`, opacity: activeIndex < 0 ? 0 : 1 }}
      />
      {items.map((it, i) => {
        const active = isActive(it.href);
        return (
          <Link key={it.href} href={it.href} data-active={active ? "true" : "false"} aria-current={active ? "page" : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors ${active ? "text-brand-700" : "text-gray-500"}`}>
            <DrawIcon name={it.icon} size={22} delay={i * 70} />
            {it.label}
          </Link>
        );
      })}
    </div>
  );
}
