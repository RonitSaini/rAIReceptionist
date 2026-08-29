import Link from "next/link";
import { ArrowLeftIcon } from "@/components/icons";
import { notFound } from "next/navigation";
import { requireAccount } from "@/lib/current-account";
import { prisma } from "@/lib/prisma";
import { setTakeoutStatus, updateTakeoutOrder } from "@/actions/takeout";
import { formatDateTime, toDateString, toTimeString } from "@/lib/time";
import { formatUsPhone } from "@/lib/form";
import { humanize } from "@/lib/constants";
import { Badge, Card, PageHeader, takeoutTone } from "@/components/ui";
import { TakeoutForm } from "@/components/takeout-form";
import { StatusButtons, TAKEOUT_TRANSITIONS } from "@/components/status-buttons";

export const metadata = { title: "Takeout order" };

export default async function TakeoutDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { account } = await requireAccount();
  const o = await prisma.takeoutOrder.findFirst({ where: { id, accountId: account.id }, include: { calls: { take: 1, orderBy: { startedAt: "desc" } } } });
  if (!o) notFound();
  const tz = account.timeZone;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Link href="/takeout" className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-ink">
        <ArrowLeftIcon size={18} /> Takeout orders
      </Link>
      <PageHeader title={o.guestName} subtitle={`${o.isDelivery ? "Delivery" : "Pickup"} ${formatDateTime(o.pickupTime, tz)}${o.guestPhone ? ` · ${formatUsPhone(o.guestPhone)}` : ""}`} action={<Badge tone={takeoutTone[o.status]}>{humanize(o.status)}</Badge>} />

      <Card title="Order">
        <p className="whitespace-pre-line text-base">{o.items}</p>
        {o.notes ? <p className="mt-2 text-sm text-gray-600">Notes: {o.notes}</p> : null}
        {o.isDelivery && o.deliveryAddress ? <p className="mt-2 text-sm text-gray-600">Deliver to: {o.deliveryAddress}</p> : null}
      </Card>

      <Card title="Status">
        <StatusButtons id={o.id} current={o.status} transitions={TAKEOUT_TRANSITIONS[o.status]} action={setTakeoutStatus} />
        <p className="mt-3 text-xs text-gray-500">
          {o.source === "ai" ? "Taken by your AI host" : "Added manually"}
          {o.calls[0] ? (
            <>
              {" · "}
              <Link href={`/calls/${o.calls[0].id}`} className="font-semibold text-brand-700">
                View call
              </Link>
            </>
          ) : null}
        </p>
      </Card>

      <Card title="Edit details">
        <TakeoutForm
          action={updateTakeoutOrder}
          offersDelivery={account.offersDelivery}
          initial={{
            id: o.id,
            guestName: o.guestName,
            guestPhone: formatUsPhone(o.guestPhone),
            items: o.items,
            notes: o.notes ?? "",
            date: toDateString(o.pickupTime, tz),
            time: toTimeString(o.pickupTime, tz),
            isDelivery: o.isDelivery,
            deliveryAddress: o.deliveryAddress ?? "",
          }}
        />
      </Card>
    </div>
  );
}
