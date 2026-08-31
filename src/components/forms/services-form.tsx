"use client";

import { useActionState, useState } from "react";
import { saveServices } from "@/actions/field-service";
import type { AccountView } from "@/lib/serialize";
import type { ServiceOfferingView } from "@/lib/serialize";
import { Button, Field, Input, Toggle } from "@/components/ui";
import { FormFooter, type FormMode } from "@/components/form-footer";
import { ActionForm } from "@/components/action-form";

type Row = { key: number; id?: string; name: string; category: string; priceFrom: string; canQuote: boolean; enabled: boolean };

let nextKey = 1;
const newRow = (partial: Partial<Row> = {}): Row => ({ key: nextKey++, name: "", category: "", priceFrom: "", canQuote: false, enabled: true, ...partial });

/**
 * What the business sells, and what the AI is allowed to say about the price.
 *
 * Two separate permissions on purpose. The account-wide switch decides whether prices may be spoken
 * at all; the per-service tick decides which ones. A trade will happily publish "drain unblocking
 * from $99" while refusing to put any number on a leak nobody has looked at yet, and the agent must
 * be able to tell those apart.
 */
export function ServicesForm({ account, services, mode }: { account: AccountView; services: ServiceOfferingView[]; mode: FormMode }) {
  const [state, action, pending] = useActionState(saveServices, null);
  const [rows, setRows] = useState<Row[]>(() =>
    services.length ? services.map((s) => newRow({ id: s.id, name: s.name, category: s.category ?? "", priceFrom: s.priceFrom == null ? "" : String(s.priceFrom), canQuote: s.canQuote, enabled: s.enabled })) : [newRow()],
  );
  const [canQuotePrices, setCanQuotePrices] = useState(account.canQuotePrices);

  const update = (key: number, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  // The React list key is local state, not something the server should ever see.
  const servicesJson = JSON.stringify(rows.filter((r) => r.name.trim()).map((r) => ({ id: r.id, name: r.name, category: r.category, priceFrom: r.priceFrom, canQuote: r.canQuote, enabled: r.enabled })));

  return (
    <ActionForm action={action} className="space-y-5">
      <input type="hidden" name="services" value={servicesJson} />

      <section className="space-y-3">
        <Field label="Call-out fee" htmlFor="calloutFee" hint="Charged just to attend. Leave blank if you don't charge one.">
          <Input id="calloutFee" name="calloutFee" inputMode="decimal" placeholder="$0.00" defaultValue={account.calloutFeeMicros == null ? "" : String(Number(account.calloutFeeMicros) / 1_000_000)} className="max-w-40" />
        </Field>
        <Toggle
          name="canQuotePrices"
          label="Let the AI say prices out loud"
          description="Even with this on, only services you tick below are quoted, and always as a starting price."
          checked={canQuotePrices}
          onChange={setCanQuotePrices}
        />
      </section>

      <section className="space-y-3">
        <p className="text-sm font-semibold text-gray-800">Services</p>
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.key} className="rounded-xl border border-gray-200 bg-surface p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                <Input aria-label="Service name" placeholder="Drain unblocking" value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} className="sm:col-span-5" />
                <Input aria-label="Category" placeholder="Drains" value={r.category} onChange={(e) => update(r.key, { category: e.target.value })} className="sm:col-span-3" />
                <Input aria-label="Price from" inputMode="decimal" placeholder="From $" value={r.priceFrom} onChange={(e) => update(r.key, { priceFrom: e.target.value })} className="sm:col-span-2" />
                <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 sm:col-span-2">
                  <input type="checkbox" checked={r.canQuote} onChange={(e) => update(r.key, { canQuote: e.target.checked })} className="h-4 w-4" />
                  Quote it
                </label>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-gray-500">
                  <input type="checkbox" checked={r.enabled} onChange={(e) => update(r.key, { enabled: e.target.checked })} className="h-4 w-4" />
                  Offered
                </label>
                <button type="button" onClick={() => setRows((prev) => (prev.length > 1 ? prev.filter((x) => x.key !== r.key) : prev))} className="text-xs font-semibold text-red-600">
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
        <Button type="button" variant="secondary" size="sm" onClick={() => setRows((prev) => [...prev, newRow()])}>
          + Add a service
        </Button>
        <p className="text-xs text-gray-500">Leave this empty if you&apos;d rather the AI just described the problem and booked a visit.</p>
      </section>

      <FormFooter state={state} pending={pending} mode={mode} backHref="/onboarding/4" />
    </ActionForm>
  );
}
