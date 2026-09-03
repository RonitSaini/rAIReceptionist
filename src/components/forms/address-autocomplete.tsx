"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Country } from "@/lib/locale";
import { Input } from "@/components/ui";
import { Presence } from "@/components/presence";

export type Suggestion = { placeId: string; main: string; secondary: string; text: string };

/** What `/api/places/details` resolves a suggestion to. `formatted` is the one-line form. */
export type PickedAddress = {
  placeId: string;
  formatted: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zip: string;
  lat: number;
  lng: number;
};

/**
 * One address combobox, shared by every form that takes an address.
 *
 * This was inlined in <AddressFields> (the onboarding business address) and is now extracted so the
 * job form reuses the same behaviour rather than growing a second implementation: the same debounce,
 * the same session token, the same keyboard model, the same listbox motion, and the same silent
 * degradation. The Google key never reaches the browser — suggestions come from `/api/places/*`,
 * which are signed-in-only server routes holding GOOGLE_MAPS_API_KEY (Places API (New)).
 *
 * The caller owns the TEXT. That is what keeps free typing working: this component never rejects,
 * clears or requires a pick, so an address nobody can find ("the Shell on Highway 7") types straight
 * through and submits. Picking a suggestion is an accelerator, never a gate.
 *
 * Degrading: the routes answer 503 when the key is absent, and the first such answer flips this to a
 * plain text input for the rest of the session — no error, no retry storm, nothing the user must
 * dismiss. `onAvailability` lets a caller soften its own hint text to match.
 */
export function AddressAutocomplete({
  value,
  onChange,
  onPick,
  country,
  biasToAccount = false,
  onAvailability,
  onBusy,
  minChars = 3,
  ...input
}: {
  value: string;
  onChange: (text: string) => void;
  onPick?: (place: PickedAddress) => void;
  country: Country;
  /** Ask the server to bias suggestions toward this account's own location and service radius. */
  biasToAccount?: boolean;
  onAvailability?: (available: boolean) => void;
  onBusy?: (busy: boolean) => void;
  minChars?: number;
} & Omit<React.ComponentPropsWithoutRef<typeof Input>, "value" | "onChange" | "country">) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [available, setAvailable] = useState(true);
  const sessionRef = useRef<string | null>(null);
  const skipNextFetch = useRef(false);
  const typed = useRef(false); // suggestions only after the user types — never for a saved value on load
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const optionId = (i: number) => `${listId}-o${i}`;

  useEffect(() => {
    if (!available || !typed.current || skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }
    if (value.trim().length < minChars) return; // the change handler already cleared the list
    const controller = new AbortController();
    const t = setTimeout(async () => {
      sessionRef.current ??= crypto.randomUUID();
      try {
        const qs = new URLSearchParams({ q: value, session: sessionRef.current, country });
        if (biasToAccount) qs.set("bias", "account");
        const res = await fetch(`/api/places/autocomplete?${qs}`, { signal: controller.signal });
        if (res.status === 503) {
          setAvailable(false);
          onAvailability?.(false);
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as { suggestions: Suggestion[] };
        setItems(data.suggestions);
        setOpen(data.suggestions.length > 0 && document.activeElement === inputRef.current);
        setActive(-1);
      } catch {
        /* aborted or offline — keep whatever is showing rather than flashing an error */
      }
    }, 250);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [value, available, country, biasToAccount, minChars, onAvailability]);

  async function choose(s: Suggestion) {
    setOpen(false);
    onBusy?.(true);
    // Fill from the suggestion immediately, so a slow or failed details call still leaves the field
    // holding what the user picked rather than reverting under them.
    skipNextFetch.current = true;
    onChange(s.text || s.main);
    try {
      const res = await fetch(`/api/places/details?id=${encodeURIComponent(s.placeId)}&session=${sessionRef.current ?? ""}`);
      sessionRef.current = null; // a session ends with the details call
      if (!res.ok) return;
      const { address } = (await res.json()) as { address: PickedAddress };
      skipNextFetch.current = true;
      onPick?.(address);
    } catch {
      /* keep the suggestion text already in the field */
    } finally {
      onBusy?.(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape" && open) {
      e.stopPropagation(); // close the list, don't also close a sheet or dialog around it
      setOpen(false);
      setActive(-1);
      return;
    }
    if (!open || items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      // Only swallow Enter when a suggestion is highlighted; otherwise the form submits as usual.
      e.preventDefault();
      void choose(items[active]);
    }
  }

  return (
    <div className="relative">
      <Input
        {...input}
        ref={inputRef}
        value={value}
        onChange={(e) => {
          typed.current = true;
          onChange(e.target.value);
          if (e.target.value.trim().length < minChars) {
            setItems([]);
            setOpen(false);
            setActive(-1);
          }
        }}
        onKeyDown={onKeyDown}
        onFocus={() => items.length > 0 && setOpen(true)}
        onBlur={() => setOpen(false)}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
      />
      <Presence show={open}>
        {(state) => (
          <ul
            id={listId}
            role="listbox"
            className={`absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-gray-200 bg-surface shadow-lg ${state === "open" ? "menu-in" : "menu-out"}`}
          >
            {items.map((s, i) => (
              <li
                key={s.placeId}
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault() /* keep focus on the input */}
                onClick={() => void choose(s)}
                onMouseEnter={() => setActive(i)}
                className={`press-soft cursor-pointer px-3 py-2 text-sm ${i === active ? "bg-brand-50 text-brand-800" : "text-ink hover:bg-gray-50"}`}
              >
                <span className="block font-semibold">{s.main}</span>
                <span className="block text-xs text-gray-500">{s.secondary}</span>
              </li>
            ))}
            <li aria-hidden="true" className="border-t border-gray-100 px-3 py-1 text-right text-[10px] uppercase tracking-wide text-gray-400">
              Suggestions by Google
            </li>
          </ul>
        )}
      </Presence>
    </div>
  );
}
