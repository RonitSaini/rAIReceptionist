"use client";

import type { VerticalCatalogEntry } from "@/verticals/types";

/**
 * "What kind of business is this?" — the first question at sign-up.
 *
 * The choice decides the onboarding steps, the pages, the words and the agent's whole prompt, so
 * it is asked before anything else and is fixed once setup begins. Professions without a working
 * definition are shown but disabled: an owner can see the product's direction without being able
 * to pick something that would answer their phone badly.
 *
 * The catalog is passed in from the server. Importing the registry here would pull every
 * profession's prompt text and Zod schemas into the browser bundle to render ten cards.
 */
export function VerticalPicker({ catalog, value, onChange, name = "vertical" }: { catalog: readonly VerticalCatalogEntry[]; value: string; onChange: (slug: string) => void; name?: string }) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-gray-800">What kind of business is this?</legend>
      <p className="mt-1 text-xs text-gray-500">This sets up your questions, your pages and what your AI receptionist says. It can&apos;t be changed later.</p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {catalog.map((v) => {
          const selected = value === v.slug;
          return (
            <label
              key={v.slug}
              className={`lift relative flex min-h-16 cursor-pointer flex-col justify-center rounded-xl border p-3 transition-colors ${
                v.available
                  ? selected
                    ? "border-brand-600 bg-brand-50 text-brand-900"
                    : "border-gray-200 bg-surface hover:bg-gray-50"
                  : "cursor-not-allowed border-dashed border-gray-200 bg-surface/50 text-gray-400"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={v.slug}
                checked={selected}
                disabled={!v.available}
                onChange={() => onChange(v.slug)}
                className="sr-only"
                required
              />
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">{v.label}</span>
                {v.available ? null : <span className="shrink-0 text-[10px] uppercase tracking-wide">Soon</span>}
              </span>
              <span className={`text-xs ${v.available ? "text-gray-500" : "text-gray-400"}`}>{v.blurb}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
