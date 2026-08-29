"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRightIcon } from "@/components/icons";

/**
 * Pill nav button with a hover animation: the resting label slides out to the right and fades,
 * a label + arrow slides in from the right, and a small dot grows to fill the pill with the brand color.
 * The active item renders in the filled state without animating.
 */
export function NavButton({ href, label, icon, active = false, className = "" }: { href: string; label: string; icon?: ReactNode; active?: boolean; className?: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`group relative block overflow-hidden rounded-full border px-4 py-2.5 text-sm font-semibold transition-colors ${active ? "border-brand-600 bg-brand-600 text-white" : "border-gray-200 bg-white text-ink hover:border-brand-600"} ${className}`}
    >
      {/* Resting label */}
      <span className={`relative z-20 flex items-center gap-3 transition-all duration-300 ${active ? "" : "group-hover:translate-x-12 group-hover:opacity-0"}`}>
        {icon ? (
          <span aria-hidden="true" className="text-base leading-none">
            {icon}
          </span>
        ) : null}
        {label}
      </span>

      {!active ? (
        <>
          {/* Hover label + arrow */}
          <span className="absolute inset-0 z-20 flex translate-x-12 items-center justify-center gap-2 text-white opacity-0 transition-all duration-300 group-hover:-translate-x-1 group-hover:opacity-100">
            {label}
            <ArrowRightIcon size={18} />
          </span>
          {/* Expanding dot */}
          <span
            aria-hidden="true"
            className="absolute left-[20%] top-[40%] z-10 h-2 w-2 scale-0 rounded-lg bg-brand-600 transition-all duration-300 group-hover:left-0 group-hover:top-0 group-hover:h-full group-hover:w-full group-hover:scale-[1.8]"
          />
        </>
      ) : null}
    </Link>
  );
}
