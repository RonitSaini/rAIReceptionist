"use client";

import { useActionState, useState } from "react";
import { saveBusinessBasics } from "@/actions/onboarding";
import type { AccountView } from "@/lib/serialize";
import { CUISINE_TYPES, PRICE_RANGES, timeZonesFor } from "@/lib/constants";
import { formatUsPhone } from "@/lib/form";
import { accountCountry, COUNTRIES, type Country } from "@/lib/locale";
import { Field, Input, Select } from "@/components/ui";
import { FormFooter, type FormMode } from "@/components/form-footer";
import { AddressFields } from "@/components/forms/address-fields";
import { ActionForm } from "@/components/action-form";

/**
 * Country comes first: until it is chosen (new accounts in onboarding) the address and time-zone fields stay
 * hidden, and once chosen everything below only offers that country's states/provinces, postal format and
 * time zones. Switching country clears the region and re-defaults the time zone.
 */
export function BusinessBasicsForm({ account, mode }: { account: AccountView; mode: FormMode }) {
  const [state, action, pending] = useActionState(saveBusinessBasics, null);
  const hasAddress = !!(account.addressLine1 || account.state || account.zip);
  const [country, setCountry] = useState<Country | "">(mode === "onboarding" && !hasAddress ? "" : accountCountry(account));
  const [timeZone, setTimeZone] = useState(account.timeZone);
  const [addressKey, setAddressKey] = useState(0);

  function chooseCountry(next: Country | "") {
    setCountry(next);
    if (!next) return;
    const zones = timeZonesFor(next);
    if (!zones.some((z) => z.id === timeZone)) setTimeZone(next === "CA" ? "America/Toronto" : "America/New_York"); // Eastern is the most common in both
    setAddressKey((k) => k + 1); // remount the address block so the old country's region/postal code don't linger
  }

  const zones = country ? timeZonesFor(country) : [];

  return (
    <ActionForm action={action} className="space-y-4">
      <Field label="Restaurant name" htmlFor="restaurantName">
        <Input id="restaurantName" name="restaurantName" defaultValue={account.restaurantName} required />
      </Field>
      <Field label="Owner / manager name" htmlFor="ownerName">
        <Input id="ownerName" name="ownerName" defaultValue={account.ownerName ?? ""} autoComplete="name" placeholder="Maria Lopez" />
      </Field>
      <Field label="Owner cell phone" htmlFor="cellPhone" hint="Used for urgent manager call-backs (escalations).">
        <Input id="cellPhone" name="cellPhone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={formatUsPhone(account.cellPhone)} placeholder="(555) 123-4567" />
      </Field>

      <Field label="Country" htmlFor="country" hint={country ? undefined : "Pick your country to set up the address, time zone and distance units."}>
        <Select id="country" name="country" value={country} onChange={(e) => chooseCountry(e.target.value as Country | "")} required autoComplete="country">
          <option value="">Choose…</option>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>

      {country ? (
        <>
          <AddressFields
            key={addressKey}
            country={country}
            initial={{
              addressLine1: account.addressLine1 ?? "",
              addressLine2: account.addressLine2 ?? "",
              city: account.city ?? "",
              state: accountCountry(account) === country ? (account.state ?? "") : "",
              zip: accountCountry(account) === country ? (account.zip ?? "") : "",
              latitude: accountCountry(account) === country ? account.latitude : null,
              longitude: accountCountry(account) === country ? account.longitude : null,
            }}
          />

          <Field label="Time zone" htmlFor="timeZone" hint="All times in the app are shown in this time zone.">
            <Select id="timeZone" name="timeZone" value={timeZone} onChange={(e) => setTimeZone(e.target.value)} required>
              {zones.map((tz) => (
                <option key={tz.id} value={tz.id}>
                  {tz.label}
                </option>
              ))}
            </Select>
          </Field>
        </>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Cuisine type" htmlFor="cuisineType">
          <Select id="cuisineType" name="cuisineType" defaultValue={account.cuisineType ?? ""}>
            <option value="">Choose…</option>
            {CUISINE_TYPES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Price range" htmlFor="priceRange">
          <Select id="priceRange" name="priceRange" defaultValue={account.priceRange ?? ""}>
            <option value="">Choose…</option>
            {PRICE_RANGES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <FormFooter state={state} pending={pending} mode={mode} />
    </ActionForm>
  );
}
