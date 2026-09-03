"use client";

import { useState } from "react";
import { US_STATES } from "@/lib/constants";
import { CA_PROVINCES, type Country } from "@/lib/locale";
import { Input, Select } from "@/components/ui";
import { AddressAutocomplete } from "@/components/forms/address-autocomplete";

export type AddressValue = { addressLine1: string; addressLine2: string; city: string; state: string; zip: string; latitude: number | null; longitude: number | null };

/**
 * Restaurant address with Google Places suggestions under the street field. Picking a suggestion fills every
 * field and pins the exact coordinates (hidden inputs); editing any field afterwards drops the pin so the
 * server re-geocodes on save. Without GOOGLE_MAPS_API_KEY the server answers 503 and this is a plain form.
 *
 * The combobox itself lives in <AddressAutocomplete>, shared with the job form. This component keeps what
 * is specific to a STRUCTURED address: the extra fields, the pin, and the hint line. No bias is requested —
 * the account is setting its own location here, so its previous location is the wrong thing to lean on.
 */
export function AddressFields({ initial, country, legend = "Business address" }: { initial: AddressValue; country: Country; legend?: string }) {
  const [v, setV] = useState<AddressValue>(initial);
  const [query, setQuery] = useState(initial.addressLine1);
  const [available, setAvailable] = useState(true);
  const [busy, setBusy] = useState(false);

  const set = (patch: Partial<AddressValue>, keepPin = false) => setV((p) => ({ ...p, ...patch, ...(keepPin ? {} : { latitude: null, longitude: null }) }));

  const pinned = v.latitude != null && v.longitude != null;
  const regions: readonly string[] = country === "CA" ? CA_PROVINCES : US_STATES;

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold text-gray-800">{legend} <span className="font-normal text-gray-500">({country === "CA" ? "Canada" : "United States"})</span></legend>
      <AddressAutocomplete
        name="addressLine1"
        value={query}
        onChange={(text) => {
          setQuery(text);
          set({ addressLine1: text });
        }}
        onPick={(a) => {
          setQuery(a.addressLine1 || a.formatted);
          setV((p) => ({ addressLine1: a.addressLine1 || a.formatted, addressLine2: a.addressLine2 || p.addressLine2, city: a.city, state: a.state, zip: a.zip, latitude: a.lat, longitude: a.lng }));
        }}
        country={country}
        onAvailability={setAvailable}
        onBusy={setBusy}
        placeholder="Street address"
        aria-label="Street address"
      />
      <Input name="addressLine2" value={v.addressLine2} onChange={(e) => set({ addressLine2: e.target.value }, true)} placeholder="Suite, floor (optional)" autoComplete="address-line2" aria-label="Address line 2" />
      <div className="grid grid-cols-6 gap-2">
        <Input name="city" value={v.city} onChange={(e) => set({ city: e.target.value })} placeholder="City" autoComplete="address-level2" aria-label="City" className="col-span-3" />
        <Select name="state" value={v.state} onChange={(e) => set({ state: e.target.value })} aria-label={country === "CA" ? "Province" : "State"} className="col-span-1 px-2">
          <option value="">{country === "CA" ? "Prov" : "ST"}</option>
          {regions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Input name="zip" value={v.zip} onChange={(e) => set({ zip: e.target.value })} placeholder={country === "CA" ? "Postal code" : "ZIP"} inputMode={country === "CA" ? "text" : "numeric"} autoComplete="postal-code" aria-label={country === "CA" ? "Postal code" : "ZIP code"} className="col-span-2" />
      </div>
      <input type="hidden" name="latitude" value={pinned ? String(v.latitude) : ""} />
      <input type="hidden" name="longitude" value={pinned ? String(v.longitude) : ""} />
      <p className="text-xs text-gray-500">
        {busy ? "Looking up that address…" : pinned ? "📍 Pinned on the map — the delivery radius is measured from here." : available ? "Start typing and pick your address from the suggestions to pin it on the map." : "Enter the address; we'll locate it when you save."}
      </p>
    </fieldset>
  );
}
