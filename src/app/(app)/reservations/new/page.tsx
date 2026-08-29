import Link from "next/link";
import { requireAccount } from "@/lib/current-account";
import { createReservation } from "@/actions/reservations";
import { isValidDateString, todayString } from "@/lib/time";
import { PageHeader } from "@/components/ui";
import { ReservationForm } from "@/components/reservation-form";

export const metadata = { title: "New reservation" };

export default async function NewReservationPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { account } = await requireAccount();
  const { date } = await searchParams;
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Link href="/reservations" className="text-sm font-semibold text-gray-500">
        ← Reservations
      </Link>
      <PageHeader title="New reservation" />
      <ReservationForm
        action={createReservation}
        largePartyThreshold={account.largePartyThreshold}
        initial={{
          guestName: "",
          guestPhone: "",
          partySize: 2,
          date: isValidDateString(date) ? date : todayString(account.timeZone),
          time: "",
          seatingPreference: "",
          specialRequests: "",
          isWaitlist: false,
        }}
      />
    </div>
  );
}
