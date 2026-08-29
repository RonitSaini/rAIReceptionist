"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/dashboard", label: "Home", icon: "🏠" },
  { href: "/reservations", label: "Book", icon: "📅" },
  { href: "/takeout", label: "Takeout", icon: "🥡" },
  { href: "/calls", label: "Calls", icon: "📞" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

const SIDEBAR_ITEMS = [ITEMS[0], { href: "/notifications", label: "Notifications", icon: "🔔" }, ...ITEMS.slice(1)];

export function AppNav({ variant }: { variant: "sidebar" | "tabs" }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  if (variant === "sidebar") {
    return (
      <nav className="flex flex-col gap-1 px-3 py-2">
        {SIDEBAR_ITEMS.map((it) => (
          <Link key={it.href} href={it.href} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold ${isActive(it.href) ? "bg-brand-50 text-brand-800" : "text-gray-700 hover:bg-gray-100"}`}>
            <span aria-hidden="true">{it.icon}</span>
            {it.label}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <div className="grid grid-cols-5">
      {ITEMS.map((it) => (
        <Link key={it.href} href={it.href} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${isActive(it.href) ? "text-brand-700" : "text-gray-500"}`}>
          <span className="text-xl" aria-hidden="true">
            {it.icon}
          </span>
          {it.label}
        </Link>
      ))}
    </div>
  );
}
