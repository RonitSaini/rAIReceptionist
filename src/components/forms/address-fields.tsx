"use client";

import { useEffect, useId, useRef, useState } from "react";
import { US_STATES } from "@/lib/constants";
import { Input, Select } from "@/components/ui";

type Suggestion = { placeId: string; main: string; secondary: string; text: string };
type Address = { addressLine1: string; addressLine2: string; city: string; state: string; zip: string; lat: number; lng: number };

export type AddressValue = { addressLine1: string; addressLine2: string; city: string; state: string; zip: string; latitude: number | null; longitude: number | null };

/**
 * Restaurant address with Google Places suggestions under the street field. Picking a suggestion fills every
 * field and pins the exact coordinates (hidden inputs); editing any field afterwards drops the pin so the
 * server re-geocodes on save. Without GOOGLE_MAPS_API_KEY the server answers 503 and this is a plain form.
 */
export function AddressFields({ initial }: { initial: AddressValue }) {
  const [v, setV] = useState<AddressValue>(initial);
  const [query, setQuery] = useState(initial.addressLine1);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [available, setAvailable] = useState(true);
  const [busy, setBusy] = useState(false);
  const sessionRef = useRef<string | null>(null);
  const skipNextFetch = useRef(false);
  const listId = useId();

  const set = (patch: Partial<AddressValue>, keepPin = false) => setV((p) => ({ ...p, ...patch, ...(keepPin ? {} : { latitude: null, longitude: null }) }));

  // Debounced suggestions while typing in the street field.
  useEffect(() => {
    if (!available || skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }
    if (query.trim().length < 3) return; // the onChange handler already cleared the list
    const controller = new AbortController();
    const t = setTimeout(async () => {
      sessionRef.current ??= crypto.randomUUID();
      try {
        const res = await fetch(`/api/places/autocomplete?q=${encodeURIComponent(query)}&session=${sessionRef.current}`, { signal: controller.signal });
        if (res.status === 503) {
          setAvailable(false);
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as { suggestions: Suggestion[] };
        setItems(data.suggestions);
        setOpen(data.suggestions.length > 0);
        setActive(-1);
      } catch {
        /* aborted or offline — keep whatever is showing */
      }
    }, 250);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query, available]);

  async function choose(s: Suggestion) {
    setOpen(false);
    setBusy(true);
    try {
      const res = await fetch(`/api/places/details?id=${encodeURIComponent(s.placeId)}&session=${sessionRef.current ?? ""}`);
      sessionRef.current = null; // a session ends with the details call
      if (!res.ok) return;
      const { address: a } = (await res.json()) as { address: Address };
      skipNextFetch.current = true;
      setQuery(a.addressLine1 || s.main);
      setV({ addressLine1: a.addressLine1 || s.main, addressLine2: a.addressLine2 || v.addressLine2, city: a.city, state: a.state, zip: a.zip, latitude: a.lat, longitude: a.lng });
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      void choose(items[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const pinned = v.latitude != null && v.longitude != null;

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold text-gray-800">Restaurant address</legend>
      <div className="relative">
        <Input
          name="addressLine1"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            set({ addressLine1: e.target.value });
            if (e.target.value.trim().length < 3) {
              setItems([]);
              setOpen(false);
            }
          }}
          onKeyDown={onKeyDown}
          onFocus={() => items.length > 0 && setOpen(true)}
          onBlur={() => setOpen(false)}
          placeholder="Street address"
          autoComplete="off"
          aria-label="Street address"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          role="combobox"
        />
        {open ? (
          <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-gray-200 bg-surface shadow-lg">
            {items.map((s, i) => (
              <li
                key={s.placeId}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault() /* keep focus on the input */}
                onClick={() => void choose(s)}
                onMouseEnter={() => setActive(i)}
                className={`cursor-pointer px-3 py-2 text-sm ${i === active ? "bg-brand-50 text-brand-800" : "text-ink hover:bg-gray-50"}`}
              >
                <span className="block font-semibold">{s.main}</span>
                <span className="block text-xs text-gray-500">{s.secondary}</span>
              </li>
            ))}
            <li aria-hidden="true" className="border-t border-gray-100 px-3 py-1 text-right text-[10px] uppercase tracking-wide text-gray-400">
              Suggestions by Google
            </li>
          </ul>
        ) : null}
      </div>
      <Input name="addressLine2" value={v.addressLine2} onChange={(e) => set({ addressLine2: e.target.value }, true)} placeholder="Suite, floor (optional)" autoComplete="address-line2" aria-label="Address line 2" />
      <div className="grid grid-cols-6 gap-2">
        <Input name="city" value={v.city} onChange={(e) => set({ city: e.target.value })} placeholder="City" autoComplete="address-level2" aria-label="City" className="col-span-3" />
        <Select name="state" value={v.state} onChange={(e) => set({ state: e.target.value })} aria-label="State" className="col-span-1 px-2">
          <option value="">ST</option>
          {US_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Input name="zip" value={v.zip} onChange={(e) => set({ zip: e.target.value })} placeholder="ZIP" inputMode="numeric" autoComplete="postal-code" aria-label="ZIP code" className="col-span-2" />
      </div>
      <input type="hidden" name="latitude" value={pinned ? String(v.latitude) : ""} />
      <input type="hidden" name="longitude" value={pinned ? String(v.longitude) : ""} />
      <p className="text-xs text-gray-500">
        {busy ? "Looking up that address…" : pinned ? "📍 Pinned on the map — the delivery radius is measured from here." : available ? "Start typing and pick your address from the suggestions to pin it on the map." : "Enter the address; we'll locate it when you save."}
      </p>
    </fieldset>
  );
}
