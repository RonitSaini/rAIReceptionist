"use client";

import { useActionState, useState } from "react";
import { saveServiceArea } from "@/actions/field-service";
import type { AccountView } from "@/lib/serialize";
import { accountCountry, displayDistance, postalLabel } from "@/lib/locale";
import { Field, Input } from "@/components/ui";
import { FormFooter, type FormMode } from "@/components/form-footer";
import { ActionForm } from "@/components/action-form";
import { DeliveryRadiusMap, deliveryMapAvailable } from "@/components/forms/delivery-radius-map";

/**
 * How far the business will travel.
 *
 * The radius is typed in the owner's own units — kilometres for a Canadian account — and stored in
 * miles, the same convention the restaurant delivery radius already uses. The map is the same
 * component too: seeing the circle is how an owner notices they have drawn it too small.
 */
export function ServiceAreaForm({ account, mode }: { account: AccountView; mode: FormMode }) {
  const [state, action, pending] = useActionState(saveServiceArea, null);
  const country = accountCountry(account);
  const unit = country === "CA" ? "km" : "miles";
  const [radius, setRadius] = useState(account.deliveryRadiusMiles == null ? "" : String(displayDistance(account.deliveryRadiusMiles, country)));
  const radiusNumber = Number.parseFloat(radius);
  const radiusMiles = Number.isFinite(radiusNumber) ? (country === "CA" ? radiusNumber / 1.609344 : radiusNumber) : NaN;
  const pinned = account.latitude != null && account.longitude != null;

  return (
    <ActionForm action={action} className="space-y-4">
      <p className="text-sm text-gray-600">
        Callers outside this area are told politely that you don&apos;t cover them, and nothing is booked. Your {account.hostName} checks every address against it before offering a time.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Field label={`Base ${postalLabel(country)}`} htmlFor="serviceZip" hint="Where you work out from.">
          <Input
            id="serviceZip"
            name="serviceZip"
            defaultValue={account.deliveryZip ?? account.zip ?? ""}
            placeholder={country === "CA" ? "M5V 3L9" : "10001"}
            inputMode={country === "CA" ? "text" : "numeric"}
            required
          />
        </Field>
        <Field label={`How far you travel (${unit})`} htmlFor="serviceRadius" hint="Measured from your address.">
          <Input id="serviceRadius" name="serviceRadius" inputMode="decimal" placeholder="25" value={radius} onChange={(e) => setRadius(e.target.value)} required />
        </Field>
      </div>

      {pinned && deliveryMapAvailable() && Number.isFinite(radiusMiles) && radiusMiles > 0 ? (
        <DeliveryRadiusMap
          center={{ lat: account.latitude as number, lng: account.longitude as number }}
          radiusMiles={radiusMiles}
          radiusLabel={`${radiusNumber} ${unit}`}
          label={account.restaurantName}
        />
      ) : !pinned ? (
        <p className="text-xs text-gray-500">Add your street address in Business basics to see the area on a map. The radius still works without it.</p>
      ) : null}

      <FormFooter state={state} pending={pending} mode={mode} backHref="/onboarding/3" />
    </ActionForm>
  );
}
