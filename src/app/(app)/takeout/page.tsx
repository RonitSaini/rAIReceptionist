import Link from "next/link";
import { DrawIcon } from "@/components/draw-icon";
import type { TakeoutStatus } from "@prisma/client";
import { requireAccount } from "@/lib/current-account";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/time";
import { formatUsPhone } from "@/lib/form";
import { TAKEOUT_STATUSES, humanize } from "@/lib/constants";
import { setTakeoutStatus } from "@/actions/takeout";
import { Badge, EmptyState, LinkButton, PageHeader, takeoutTone } from "@/components/ui";
import { StatusButtons, TAKEOUT_TRANSITIONS } from "@/components/status-buttons";
import { SegmentedLinks } from "@/components/segmented-links";

export const metadata = { title: "Takeout orders" };

export default async function TakeoutPage({ searchParams }: { searchParams: Promise<{ status?: string; changed?: string }> }) {
  const { account } = await requireAccount();
  const { status, changed } = await searchParams;
  const filter = status === "all" ? "all" : TAKEOUT_STATUSES.includes(status as TakeoutStatus) ? (status as TakeoutStatus) : "open";

  const orders = await prisma.takeoutOrder.findMany({
    where: {
      accountId: account.id,
      ...(filter === "open" ? { status: { in: ["new", "confirmed", "ready"] } } : filter === "all" ? {} : { status: filter }),
    },
    orderBy: { pickupTime: filter === "open" ? "asc" : "desc" },
    take: 100,
  });

  const chip = (value: string, label: string) => ({ key: value, href: `/takeout?status=${value}`, label, active: filter === value });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Takeout orders"
        action={
          <LinkButton href="/takeout/new" size="sm">
            + New
          </LinkButton>
        }
      />
      <SegmentedLinks fill="soft" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" itemClass="shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold" activeClass="border-brand-600 bg-brand-50 text-brand-800" inactiveClass="border-gray-300 bg-surface text-gray-700" items={[chip("open", "Open"), ...TAKEOUT_STATUSES.map((s) => chip(s, humanize(s))), chip("all", "All")]} />

      {orders.length === 0 ? (
        <EmptyState title="No orders" body={filter === "open" ? "New takeout and delivery orders will show up here." : undefined} />
      ) : (
        <ul data-arrival="cascade" className="grid gap-3 xl:grid-cols-2 3xl:grid-cols-3">
          {orders.map((o) => (
            <li key={o.id} className="lift flex flex-col rounded-2xl border border-gray-200 bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/takeout/${o.id}`} className="block font-semibold">
                    {o.guestName}
                    {o.guestPhone ? <span className="font-normal text-gray-500"> · {formatUsPhone(o.guestPhone)}</span> : null}
                  </Link>
                  <p className="text-sm text-gray-500">
                    <DrawIcon name={o.isDelivery ? "truck" : "bag"} size={14} draw={false} className="mr-1 inline-block align-[-2px] text-gray-400" />
                    {o.isDelivery ? "Delivery" : "Pickup"} {formatDateTime(o.pickupTime, account.timeZone)}
                    {o.source === "ai" ? " · taken by AI" : ""}
                  </p>
                  <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-gray-800">{o.items}</p>
                </div>
                <Badge tone={takeoutTone[o.status]} className={changed === o.id ? "badge-pop" : undefined}>{humanize(o.status)}</Badge>
              </div>
              <div className="mt-auto pt-3">
                <StatusButtons id={o.id} current={o.status} transitions={TAKEOUT_TRANSITIONS[o.status]} action={setTakeoutStatus} returnTo={`/takeout?status=${filter}`} size="sm" />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
