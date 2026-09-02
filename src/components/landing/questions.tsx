"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { DrawIcon } from "@/components/draw-icon";
import { QUESTIONS } from "@/components/landing/questions-data";

/**
 * "Questions, answered" as a single-column accordion: one row per question, each row showing the
 * question and its one-line short answer, the elaboration folded beneath. Every row toggles on its
 * own (several may be open), all start collapsed, desktop and mobile alike.
 *
 * Motion is the expansion itself and nothing else: the fold opens on grid-template-rows (the
 * motion spec's pre-registered collapse exception, .fold in globals.css) while the paragraph fades
 * in, and the arrow indicator redraws itself on every toggle (the profession rail's idiom: an icon
 * draws on an active-state change, never on mount, at the 18px floor) while turning to point the
 * other way. Reduced motion toggles instantly with the arrow fully drawn.
 *
 * Accessibility: a real <button> with aria-expanded/aria-controls inside a heading, the panel a
 * labelled region that stays in the DOM when collapsed (crawlable; hidden from assistive tech by
 * a delayed visibility swap), a visible focus ring, and Up/Down/Home/End between headers. Without
 * JavaScript every panel is open.
 *
 * Shape: the plus/minus accordion family on 21st.dev (cnippet #24907, ddoemonn #23530, coss
 * #11312) — those are Base UI / spring-height implementations, so only the pattern was taken.
 */

export function Questions({ className = "" }: { className?: string }) {
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  /* Toggle count per row: keys the arrow so each toggle remounts it and the draw runs again. */
  const [ticks, setTicks] = useState<Record<string, number>>({});

  const onKeyDown = (index: number) => (event: React.KeyboardEvent) => {
    const headers = listRef.current?.querySelectorAll<HTMLButtonElement>("button[aria-expanded]");
    if (!headers?.length) return;
    let next: number | null = null;
    if (event.key === "ArrowDown") next = (index + 1) % headers.length;
    else if (event.key === "ArrowUp") next = (index - 1 + headers.length) % headers.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = headers.length - 1;
    if (next === null) return;
    event.preventDefault();
    headers[next].focus();
  };

  return (
    <div ref={listRef} className={`max-w-3xl divide-y divide-gray-200 border-t border-gray-200 ${className}`.trim()}>
      {QUESTIONS.map((item, i) => {
        const isOpen = Boolean(open[item.id]);
        return (
          <div key={item.id} id={`faq-${item.id}`} className="scroll-mt-24">
            <h3>
              <button
                type="button"
                id={`faq-button-${item.id}`}
                aria-expanded={isOpen}
                aria-controls={`faq-panel-${item.id}`}
                onClick={() => {
                  setOpen((o) => ({ ...o, [item.id]: !isOpen }));
                  setTicks((t) => ({ ...t, [item.id]: (t[item.id] ?? 0) + 1 }));
                }}
                onKeyDown={onKeyDown(i)}
                className="group flex w-full items-start justify-between gap-5 rounded-xl py-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              >
                <span>
                  <span className="block text-base font-bold tracking-tight text-ink">{item.q}</span>
                  <span className="mt-1 block text-lg font-semibold leading-snug text-brand-800">{item.short}</span>
                </span>
                {/* The arrow redraws on each toggle (shaft, then head) and turns to point up when open. */}
                <span
                  className="fold-arrow mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-surface text-gray-500 transition-colors group-hover:border-gray-400 group-hover:text-ink"
                  aria-hidden="true"
                >
                  <DrawIcon key={ticks[item.id] ?? 0} name="arrow-down" size={18} draw={(ticks[item.id] ?? 0) > 0} className={isOpen ? "text-brand-700" : ""} />
                </span>
              </button>
            </h3>
            <div id={`faq-panel-${item.id}`} role="region" aria-labelledby={`faq-button-${item.id}`} className={`fold ${isOpen ? "is-open" : ""}`.trim()}>
              <div>
                <p className="max-w-prose pb-5 text-sm leading-relaxed text-gray-600">
                  {item.rest.map((segment, j) =>
                    typeof segment === "string" ? (
                      segment
                    ) : (
                      <Link key={j} href={segment.href} className="font-semibold text-brand-700 underline">
                        {segment.label}
                      </Link>
                    ),
                  )}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
