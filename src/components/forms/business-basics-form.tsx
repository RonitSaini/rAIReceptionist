"use client";

import { useActionState } from "react";
import { saveBusinessBasics } from "@/actions/onboarding";
import type { AccountView } from "@/lib/serialize";
import { CUISINE_TYPES, PRICE_RANGES, US_TIME_ZONES } from "@/lib/constants";
import { formatUsPhone } from "@/lib/form";
import { Field, Input, Select } from "@/components/ui";
import { FormFooter, type FormMode } from "@/components/form-footer";
import { AddressFields } from "@/components/forms/address-fields";

export function BusinessBasicsForm({ account, mode }: { account: AccountView; mode: FormMode }) {
  const [state, action, pending] = useActionState(saveBusinessBasics, null);

  return (
    <form action={action} className="space-y-4">
      <Field label="Restaurant name" htmlFor="restaurantName">
        <Input id="restaurantName" name="restaurantName" defaultValue={account.restaurantName} required />
      </Field>
      <Field label="Owner / manager name" htmlFor="ownerName">
        <Input id="ownerName" name="ownerName" defaultValue={account.ownerName ?? ""} autoComplete="name" placeholder="Maria Lopez" />
      </Field>
      <Field label="Owner cell phone" htmlFor="cellPhone" hint="Used for urgent manager call-backs (escalations).">
        <Input id="cellPhone" name="cellPhone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={formatUsPhone(account.cellPhone)} placeholder="(555) 123-4567" />
      </Field>

      <AddressFields initial={{ addressLine1: account.addressLine1 ?? "", addressLine2: account.addressLine2 ?? "", city: account.city ?? "", state: account.state ?? "", zip: account.zip ?? "", latitude: account.latitude, longitude: account.longitude }} />

      <Field label="Time zone" htmlFor="timeZone" hint="All times in the app are shown in this time zone.">
        <Select id="timeZone" name="timeZone" defaultValue={account.timeZone} required>
          {US_TIME_ZONES.map((tz) => (
            <option key={tz.id} value={tz.id}>
              {tz.label}
            </option>
          ))}
        </Select>
      </Field>

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
    </form>
  );
}
