"use client";

import { useActionState } from "react";
import { saveBusinessBasics } from "@/actions/onboarding";
import type { AccountView } from "@/lib/serialize";
import { CUISINE_TYPES, PRICE_RANGES, US_STATES, US_TIME_ZONES } from "@/lib/constants";
import { formatUsPhone } from "@/lib/form";
import { Field, Input, Select } from "@/components/ui";
import { FormFooter, type FormMode } from "@/components/form-footer";

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

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-gray-800">Restaurant address</legend>
        <Input name="addressLine1" defaultValue={account.addressLine1 ?? ""} placeholder="Street address" autoComplete="address-line1" aria-label="Street address" />
        <Input name="addressLine2" defaultValue={account.addressLine2 ?? ""} placeholder="Suite, floor (optional)" autoComplete="address-line2" aria-label="Address line 2" />
        <div className="grid grid-cols-6 gap-2">
          <Input name="city" defaultValue={account.city ?? ""} placeholder="City" autoComplete="address-level2" aria-label="City" className="col-span-3" />
          <Select name="state" defaultValue={account.state ?? ""} aria-label="State" className="col-span-1 px-2">
            <option value="">ST</option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <Input name="zip" defaultValue={account.zip ?? ""} placeholder="ZIP" inputMode="numeric" autoComplete="postal-code" aria-label="ZIP code" className="col-span-2" />
        </div>
      </fieldset>

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
