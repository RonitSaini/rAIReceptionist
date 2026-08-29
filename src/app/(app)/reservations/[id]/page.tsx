import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccount } from "@/lib/current-account";
import { prisma } from "@/lib/prisma";
import { setReservationStatus, updateReservation } from "@/actions/reservations";
import { formatDateTime, toDateString, toTimeString } from "@/lib/time";
import { formatUsPhone } from "@/lib/form";
import { humanize } from "@/lib/constants";
import { Badge, Card, PageHeader, reservationTone } from "@/components/ui";
import { ReservationForm } from "@/components/reservation-form";
import { RESERVATION_TRANSITIONS, StatusButtons } from "@/components/status-buttons";

export const metadata = { title: "Reservation" };

export default async function ReservationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { account } = await requireAccount();
  const r = await prisma.reservation.findFirst({ where: { id, accountId: account.id }, include: { calls: { take: 1, orderBy: { startedAt: "desc" } } } });
  if (!r) notFound();
  const tz = account.timeZone;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Link href={`/reservations?date=${toDateString(r.startTime, tz)}`} className="text-sm font-semibold text-gray-500">
        ← Reservations
      </Link>
      <PageHeader title={r.guestName} subtitle={`${formatDateTime(r.startTime, tz)} · party of ${r.partySize}${r.guestPhone ? ` · ${formatUsPhone(r.guestPhone)}` : ""}`} action={<Badge tone={reservationTone[r.status]}>{humanize(r.status)}</Badge>} />

      <Card title="Status">
        <StatusButtons id={r.id} current={r.status} transitions={RESERVATION_TRANSITIONS[r.status]} action={setReservationStatus} />
        <p className="mt-3 text-xs text-gray-500">
          {r.isWaitlist ? "Waitlist entry · " : ""}
          {r.source === "ai" ? "Booked by your AI host" : "Added manually"}
          {r.calls[0] ? (
            <>
              {" · "}
              <Link href={`/calls/${r.calls[0].id}`} className="font-semibold text-brand-700">
                View call
              </Link>
            </>
          ) : null}
        </p>
      </Card>

      <Card title="Edit details">
        <ReservationForm
          action={updateReservation}
          largePartyThreshold={account.largePartyThreshold}
          initial={{
            id: r.id,
            guestName: r.guestName,
            guestPhone: formatUsPhone(r.guestPhone),
            partySize: r.partySize,
            date: toDateString(r.startTime, tz),
            time: toTimeString(r.startTime, tz),
            seatingPreference: r.seatingPreference ?? "",
            specialRequests: r.specialRequests ?? "",
            isWaitlist: r.isWaitlist,
          }}
        />
      </Card>
    </div>
  );
}
