import Link from "next/link";
import { ArrowLeftIcon } from "@/components/icons";
import { DrawIcon } from "@/components/draw-icon";
import { notFound } from "next/navigation";
import { requireAccount } from "@/lib/current-account";
import { prisma } from "@/lib/prisma";
import { isCallLive } from "@/lib/calls";
import { formatDateTime, formatDuration } from "@/lib/time";
import { formatUsPhone } from "@/lib/form";
import { humanize } from "@/lib/constants";
import { Badge, Card, PageHeader, classificationTone } from "@/components/ui";

export const metadata = { title: "Call" };

function TranscriptLines({ text, hostName }: { text: string; hostName: string }) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        const m = /^(Agent|User|Caller)\s*:\s*(.*)$/i.exec(line);
        if (!m) return <p key={i} className="text-sm text-gray-800">{line}</p>;
        const isAgent = m[1].toLowerCase() === "agent";
        return (
          <div key={i} className={`flex ${isAgent ? "justify-start" : "justify-end"}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${isAgent ? "bg-brand-50 text-brand-900" : "bg-gray-100 text-gray-900"}`}>
              <span className="block text-[11px] font-semibold uppercase tracking-wide opacity-60">{isAgent ? hostName : "Caller"}</span>
              {m[2]}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default async function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { account } = await requireAccount();
  const call = await prisma.call.findFirst({ where: { id, accountId: account.id }, include: { reservation: true, takeoutOrder: true, notifications: { where: { type: "escalation" }, take: 1 } } });
  if (!call) notFound();
  const escalation = call.notifications[0] ?? null;
  const live = isCallLive(call);

  return (
    <div className="space-y-4">
      <Link href="/calls" className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-ink">
        <ArrowLeftIcon size={18} /> Calls
      </Link>
      <PageHeader
        title={call.callerName ?? (call.callerPhone ? formatUsPhone(call.callerPhone) : "Unknown caller")}
        subtitle={`${call.callerName && call.callerPhone ? `${formatUsPhone(call.callerPhone)} · ` : ""}${formatDateTime(call.startedAt, account.timeZone)} · ${live ? "in progress" : formatDuration(call.duration)}`}
        action={
          <div className="flex flex-col items-end gap-1">
            <Badge tone={classificationTone[call.classification]}>{humanize(call.classification)}</Badge>
            {live ? <Badge tone="green">Live</Badge> : null}
            {call.isTest ? <Badge tone="gray">Test call</Badge> : null}
          </div>
        }
      />

      {call.summary || call.sentiment || call.callbackRequested ? (
        <Card title="Summary">
          {call.summary ? <p className="text-sm text-gray-800">{call.summary}</p> : null}
          <div className="mt-2 flex flex-wrap gap-2">
            {call.sentiment ? <Badge tone={call.sentiment === "Negative" ? "red" : call.sentiment === "Positive" ? "green" : "gray"}>Caller sentiment: {call.sentiment}</Badge> : null}
            {call.callbackRequested ? <Badge tone="amber">Callback requested</Badge> : null}
            {call.disconnectionReason ? <Badge tone="gray">{humanize(call.disconnectionReason)}</Badge> : null}
          </div>
        </Card>
      ) : null}

      {call.messageText ? (
        <Card title={call.escalationReason ? "Escalated to manager" : "Message"} className={call.escalationReason ? "border-red-200" : undefined}>
          {call.escalationReason ? <Badge tone="red" className="mb-2">{humanize(call.escalationReason)}</Badge> : null}
          <p className="whitespace-pre-line text-sm text-gray-800">{call.messageText}</p>
          {call.escalationReason ? (
            <ul className="mt-3 space-y-1 text-xs text-gray-500">
              <li>{call.managerCalledAt ? `📞 Manager's cell rang ${formatDateTime(call.managerCalledAt, account.timeZone)}` : "📞 Manager's cell was not rung (outside manager hours or phone not connected)"}</li>
              {escalation ? (
                <li>
                  {escalation.acknowledgedAt
                    ? `✅ Acknowledged ${formatDateTime(escalation.acknowledgedAt, account.timeZone)}`
                    : escalation.followUpSentAt
                      ? `💬 Not acknowledged in time — caller was texted ${formatDateTime(escalation.followUpSentAt, account.timeZone)}`
                      : "⏳ Waiting for a manager to acknowledge (caller is texted if the window lapses)"}
                </li>
              ) : null}
            </ul>
          ) : null}
        </Card>
      ) : null}

      {(call.reservation || call.takeoutOrder) && (
        <Card title="Result">
          {call.reservation ? (
            <Link href={`/reservations/${call.reservation.id}`} className="block rounded-xl border border-gray-200 p-3 hover:bg-gray-50">
              <p className="flex items-center gap-1.5 font-semibold">
                <DrawIcon name="calendar" size={16} draw={false} className="shrink-0 text-gray-400" /> {call.reservation.isWaitlist ? "Waitlist" : "Reservation"} · {call.reservation.guestName}, party of {call.reservation.partySize}
              </p>
              <p className="text-sm text-gray-500">{formatDateTime(call.reservation.startTime, account.timeZone)}</p>
            </Link>
          ) : null}
          {call.takeoutOrder ? (
            <Link href={`/takeout/${call.takeoutOrder.id}`} className="mt-2 block rounded-xl border border-gray-200 p-3 hover:bg-gray-50">
              <p className="flex items-center gap-1.5 font-semibold">
                <DrawIcon name="bag" size={16} draw={false} className="shrink-0 text-gray-400" /> {call.takeoutOrder.isDelivery ? "Delivery" : "Takeout"} · {call.takeoutOrder.guestName}
              </p>
              <p className="text-sm text-gray-500">{formatDateTime(call.takeoutOrder.pickupTime, account.timeZone)}</p>
            </Link>
          ) : null}
        </Card>
      )}

      <Card title="Recording">
        {call.recordingUrl ? (
          <audio controls preload="none" src={call.recordingUrl} className="w-full">
            Your browser can&apos;t play this recording.
          </audio>
        ) : (
          <p className="text-sm text-gray-500">{live ? "The recording will appear after the call ends." : "No recording available for this call."}</p>
        )}
      </Card>

      <Card title="Transcript">
        {call.transcript ? <TranscriptLines text={call.transcript} hostName={account.hostName} /> : <p className="text-sm text-gray-500">{live ? "The transcript will appear after the call ends." : "No transcript available."}</p>}
        {call.publicLogUrl ? (
          <a href={call.publicLogUrl} target="_blank" rel="noreferrer" className="mt-3 block text-xs font-semibold text-gray-500 hover:text-ink">
            View Retell call log ↗
          </a>
        ) : null}
      </Card>
    </div>
  );
}
