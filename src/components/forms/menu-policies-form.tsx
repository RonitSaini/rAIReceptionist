"use client";

import { useActionState, useState } from "react";
import { saveMenuPolicies } from "@/actions/onboarding";
import type { AccountView, MenuItemView } from "@/lib/serialize";
import { DIETARY_TAGS, MENU_CATEGORIES } from "@/lib/constants";
import { Button, Field, Input, Toggle, inputClass } from "@/components/ui";
import { FormFooter, type FormMode } from "@/components/form-footer";
import { DeliveryRadiusMap, deliveryMapAvailable } from "@/components/forms/delivery-radius-map";
import { accountCountry, displayDistance, postalLabel, toMiles, unitWord } from "@/lib/locale";
import { ActionForm } from "@/components/action-form";

type Row = Omit<MenuItemView, "id" | "price"> & { key: number; price: string };

let nextKey = 1;
function newRow(partial: Partial<Row> = {}): Row {
  return { key: nextKey++, name: "", category: "", price: "", description: "", dietaryTags: [], enabled: true, ...partial };
}

export function MenuPoliciesForm({ account, menu, mode, backHref }: { account: AccountView; menu: MenuItemView[]; mode: FormMode; backHref?: string }) {
  const [state, action, pending] = useActionState(saveMenuPolicies, null);
  const [rows, setRows] = useState<Row[]>(() => (menu.length ? menu.map((m) => newRow({ ...m, price: m.price == null ? "" : m.price.toFixed(2) })) : [newRow()]));
  const [expanded, setExpanded] = useState<number | null>(null);
  const [offersDelivery, setOffersDelivery] = useState(account.offersDelivery);
  const country = accountCountry(account);
  const unit = country === "CA" ? "km" : "mi";
  const [radius, setRadius] = useState(account.serviceAreaRadiusMiles == null ? "" : String(displayDistance(account.serviceAreaRadiusMiles, country)));
  const radiusNum = Number.parseFloat(radius);
  const radiusMiles = Number.isFinite(radiusNum) ? toMiles(radiusNum, unit) : NaN;
  const pinned = account.latitude != null && account.longitude != null;

  function update(key: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function toggleTag(key: number, tag: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, dietaryTags: r.dietaryTags.includes(tag) ? r.dietaryTags.filter((t) => t !== tag) : [...r.dietaryTags, tag] } : r)));
  }

  const menuJson = JSON.stringify(rows.filter((r) => r.name.trim()).map((r) => ({ name: r.name, category: r.category, price: r.price, description: r.description, dietaryTags: r.dietaryTags, enabled: r.enabled })));

  return (
    <ActionForm action={action} className="space-y-6">
      <input type="hidden" name="menu" value={menuJson} />

      <section className="space-y-3">
        <h2 className="text-base font-bold">Menu</h2>
        <p className="text-sm text-gray-500">The AI only ever mentions items listed here. It never invents an item or a price.</p>
        {rows.map((r) => (
          <div key={r.key} className="rounded-2xl border border-gray-200 bg-surface p-3">
            <div className="grid grid-cols-12 gap-2">
              <input aria-label="Item name" value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} placeholder="Margherita pizza" className={`${inputClass} col-span-8 min-h-11`} />
              <div className="relative col-span-4">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                <input aria-label="Price" value={r.price} onChange={(e) => update(r.key, { price: e.target.value })} inputMode="decimal" placeholder="0.00" className={`${inputClass} min-h-11 pl-7`} />
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <button type="button" onClick={() => setExpanded(expanded === r.key ? null : r.key)} className="text-sm font-semibold text-brand-700">
                {expanded === r.key ? "Hide details" : "Category, description, dietary tags"}
              </button>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1 text-xs text-gray-600">
                  <input type="checkbox" checked={r.enabled} onChange={(e) => update(r.key, { enabled: e.target.checked })} className="h-4 w-4 accent-brand-600" />
                  Available
                </label>
                <button type="button" onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))} className="text-sm font-semibold text-red-600" aria-label="Remove item">
                  Remove
                </button>
              </div>
            </div>
            {expanded === r.key ? (
              <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
                <div className="grid grid-cols-2 gap-2">
                  <input aria-label="Category" list="menu-categories" value={r.category} onChange={(e) => update(r.key, { category: e.target.value })} placeholder="Category" className={`${inputClass} min-h-11`} />
                  <datalist id="menu-categories">
                    {MENU_CATEGORIES.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
                <textarea aria-label="Description" value={r.description} onChange={(e) => update(r.key, { description: e.target.value })} placeholder="Short description the AI can read to callers" className={`${inputClass} min-h-20 py-2`} />
                <div className="flex flex-wrap gap-2">
                  {DIETARY_TAGS.map((t) => {
                    const on = r.dietaryTags.includes(t);
                    return (
                      <button key={t} type="button" onClick={() => toggleTag(r.key, t)} className={`rounded-full border px-3 py-1.5 text-sm ${on ? "border-brand-600 bg-brand-50 text-brand-800" : "border-gray-300 text-gray-600"}`}>
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        ))}
        <Button type="button" variant="secondary" full onClick={() => setRows((prev) => [...prev, newRow()])}>
          + Add menu item
        </Button>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold">Policies</h2>
        <Toggle name="canQuotePrices" label="AI can state prices" description="If off, the AI says prices are available in person." defaultChecked={account.canQuotePrices} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Large-party threshold" htmlFor="largePartyThreshold" hint="Parties above this go to a manager.">
            <Input id="largePartyThreshold" name="largePartyThreshold" type="number" min={2} max={100} inputMode="numeric" defaultValue={account.largePartyThreshold} />
          </Field>
          <Field label="Large-party deposit" htmlFor="largePartyDepositFee" hint="Per person, USD. Optional.">
            <Input id="largePartyDepositFee" name="largePartyDepositFee" inputMode="decimal" placeholder="$0.00" defaultValue={account.largePartyDepositFee ?? ""} />
          </Field>
        </div>
        <Toggle name="takesTakeoutOrders" label="Take takeout orders by phone" defaultChecked={account.takesTakeoutOrders} />
        <Toggle name="offersDelivery" label="Offer delivery" description="Callers outside the area are offered pickup instead." checked={offersDelivery} onChange={setOffersDelivery} />
        {offersDelivery ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Radius (${unit === "km" ? "km" : "miles"})`} htmlFor="serviceAreaRadiusMiles" hint="Measured from your restaurant address.">
                <Input id="serviceAreaRadiusMiles" name="serviceAreaRadiusMiles" inputMode="decimal" placeholder="5" value={radius} onChange={(e) => setRadius(e.target.value)} />
                <input type="hidden" name="radiusUnit" value={unit} />
              </Field>
              <Field label={`Delivery from ${postalLabel(country)}`} htmlFor="serviceAreaZip" hint="Fallback when an address can't be located.">
                <Input id="serviceAreaZip" name="serviceAreaZip" inputMode={country === "CA" ? "text" : "numeric"} placeholder={country === "CA" ? "M5V 3L9" : "10001"} defaultValue={account.serviceAreaZip ?? ""} />
              </Field>
            </div>
            {pinned && deliveryMapAvailable() && Number.isFinite(radiusMiles) && radiusMiles > 0 ? (
              <DeliveryRadiusMap center={{ lat: account.latitude as number, lng: account.longitude as number }} radiusMiles={radiusMiles} radiusLabel={`${radiusNum} ${unitWord(country, radiusNum)}`} label={account.businessName} />
            ) : !pinned ? (
              <p className="text-xs text-gray-500">Save your restaurant address (Business step) to see the delivery area on a map. Callers&apos; addresses are checked against this radius.</p>
            ) : null}
          </div>
        ) : null}
      </section>

      <FormFooter state={state} pending={pending} mode={mode} backHref={backHref} />
    </ActionForm>
  );
}
