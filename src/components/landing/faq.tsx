"use client";

import { useState, type ReactNode } from "react";

/**
 * Disclosure list using the motion spec's pre-registered collapse exception (grid-template-rows,
 * see .faq-panel in globals.css). Collapse is gated on `.js`, so a no-JS visitor reads every answer;
 * closed panels leave the accessibility tree via a delayed visibility swap. Answers are server JSX
 * passed across the boundary, so links inside them stay server-rendered.
 */
export function Faq({ items }: { items: { q: string; a: ReactNode }[] }) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-surface">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q} className={`px-5 ${isOpen ? "faq-open" : ""}`.trim()}>
            <h3>
              <button
                type="button"
                id={`faq-button-${i}`}
                aria-expanded={isOpen}
                aria-controls={`faq-panel-${i}`}
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-4 rounded-xl py-4 text-left font-semibold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              >
                {item.q}
                <svg aria-hidden="true" className="faq-chevron h-4 w-4 shrink-0 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            </h3>
            <div id={`faq-panel-${i}`} role="region" aria-labelledby={`faq-button-${i}`} className={`faq-panel ${isOpen ? "is-open" : ""}`.trim()}>
              <div>
                <div className="space-y-2 pb-4 text-sm text-gray-600">{item.a}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
