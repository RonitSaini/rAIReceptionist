"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { DrawIcon } from "@/components/draw-icon";
import type { IconName } from "@/components/icon-paths";
import { SidebarNav, type SidebarNavItem } from "@/components/ui/sidebar-nav";
import { useRedrawActiveIcon } from "@/components/use-redraw-active-icon";

const ITEMS: (SidebarNavItem & { icon: IconName })[] = [
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/reservations", label: "Book", icon: "calendar" },
  { href: "/takeout", label: "Takeout", icon: "bag" },
  { href: "/calls", label: "Calls", icon: "phone" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

const SIDEBAR_ITEMS: SidebarNavItem[] = [ITEMS[0], { href: "/notifications", label: "Notifications", icon: "bell" }, ...ITEMS.slice(1)];

export function AppNav({ variant }: { variant: "sidebar" | "tabs" }) {
  if (variant === "sidebar") return <SidebarNav items={SIDEBAR_ITEMS} />;
  return <MobileTabs />;
}

/** Mobile bottom tabs: no hover on touch. The active bar slides along the top edge (transform-only). */
function MobileTabs() {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const activeIndex = ITEMS.findIndex((it) => isActive(it.href));
  useRedrawActiveIcon(ref, pathname);

  return (
    <div ref={ref} className="relative grid grid-cols-5">
      <span aria-hidden="true" className="nav-bar pointer-events-none absolute left-0 top-0 h-0.5 w-1/5 rounded-b-full bg-brand-600" style={{ transform: `translateX(${Math.max(activeIndex, 0) * 100}%)`, opacity: activeIndex < 0 ? 0 : 1 }} />
      {ITEMS.map((it, i) => {
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
