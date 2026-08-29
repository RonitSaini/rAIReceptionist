import Link from "next/link";
import { ArrowLeftIcon } from "@/components/icons";
import { requireAccount } from "@/lib/current-account";
import { createTakeoutOrder } from "@/actions/takeout";
import { minutesToTime, timeToMinutes, toTimeString, todayString } from "@/lib/time";
import { PageHeader } from "@/components/ui";
import { TakeoutForm } from "@/components/takeout-form";

export const metadata = { title: "New takeout order" };

export default async function NewTakeoutPage() {
  const { account } = await requireAccount();
  // Default pickup: 30 minutes from now, rounded up to the next 5 minutes.
  const nowMin = timeToMinutes(toTimeString(new Date(), account.timeZone)) + 30;
  const defaultTime = minutesToTime(Math.ceil(nowMin / 5) * 5);
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Link href="/takeout" className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-ink">
        <ArrowLeftIcon size={18} /> Takeout orders
      </Link>
      <PageHeader title="New takeout order" />
      <TakeoutForm
        action={createTakeoutOrder}
        offersDelivery={account.offersDelivery}
        initial={{ guestName: "", guestPhone: "", items: "", notes: "", date: todayString(account.timeZone), time: defaultTime, isDelivery: false, deliveryAddress: "" }}
      />
    </div>
  );
}
