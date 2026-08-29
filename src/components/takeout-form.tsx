"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "@/lib/form";
import { Field, Input, Textarea, Toggle } from "@/components/ui";
import { FormFooter } from "@/components/form-footer";

export type TakeoutFormValues = {
  id?: string;
  guestName: string;
  guestPhone: string;
  items: string;
  notes: string;
  date: string;
  time: string;
  isDelivery: boolean;
  deliveryAddress: string;
};

export function TakeoutForm({ action, initial, offersDelivery }: { action: (prev: ActionState, fd: FormData) => Promise<ActionState>; initial: TakeoutFormValues; offersDelivery: boolean }) {
  const [state, formAction, pending] = useActionState(action, null);
  const [isDelivery, setIsDelivery] = useState(initial.isDelivery);

  return (
    <form action={formAction} className="space-y-4">
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      <Field label="Guest name" htmlFor="guestName">
        <Input id="guestName" name="guestName" defaultValue={initial.guestName} required autoComplete="off" />
      </Field>
      <Field label="Guest phone" htmlFor="guestPhone">
        <Input id="guestPhone" name="guestPhone" type="tel" inputMode="tel" defaultValue={initial.guestPhone} placeholder="(555) 123-4567" />
      </Field>
      <Field label="Order" htmlFor="items" hint="As dictated — one item per line works well.">
        <Textarea id="items" name="items" defaultValue={initial.items} rows={4} required placeholder={"2x Margherita pizza\n1x Caesar salad, no croutons"} />
      </Field>
      <Field label="Notes" htmlFor="notes">
        <Input id="notes" name="notes" defaultValue={initial.notes} placeholder="Extra napkins, allergy…" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={isDelivery ? "Delivery date" : "Pickup date"} htmlFor="date">
          <Input id="date" name="date" type="date" defaultValue={initial.date} required />
        </Field>
        <Field label={isDelivery ? "Delivery time" : "Pickup time"} htmlFor="time">
          <Input id="time" name="time" type="time" defaultValue={initial.time} required />
        </Field>
      </div>
      {offersDelivery || initial.isDelivery ? <Toggle name="isDelivery" label="Delivery" checked={isDelivery} onChange={setIsDelivery} /> : null}
      {isDelivery ? (
        <Field label="Delivery address" htmlFor="deliveryAddress">
          <Input id="deliveryAddress" name="deliveryAddress" defaultValue={initial.deliveryAddress} placeholder="123 Main St, Apt 4B, City, ST 12345" required />
        </Field>
      ) : null}
      <FormFooter state={state} pending={pending} mode="settings" submitLabel={initial.id ? "Save changes" : "Add order"} />
    </form>
  );
}
