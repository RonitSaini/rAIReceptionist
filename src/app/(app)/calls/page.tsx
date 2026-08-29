import Link from "next/link";
import type { CallClassification } from "@prisma/client";
import { requireAccount } from "@/lib/current-account";
import { prisma } from "@/lib/prisma";
import { formatDateTime, formatDuration } from "@/lib/time";
import { formatUsPhone } from "@/lib/form";
import { humanize } from "@/lib/constants";
import { Badge, EmptyState, PageHeader, classificationTone } from "@/components/ui";

export const metadata = { title: "Calls" };

const CLASSIFICATIONS: CallClassification[] = ["reservation", "takeout", "question", "waitlist", "message", "escalation", "missed", "other"];

export default async function CallsPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { account } = await requireAccount();
  const { type } = await searchParams;
  const filter = CLASSIFICATIONS.includes(type as CallClassification) ? (type as CallClassification) : null;

  const calls = await prisma.call.findMany({
    where: { accountId: account.id, ...(filter ? { classification: filter } : {}) },
    orderBy: { startedAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Calls" subtitle={account.twilioNumber ? `${account.hostName} is answering ${formatUsPhone(account.twilioNumber)}` : "Your AI host's call history"} />

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link href="/calls" className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold ${!filter ? "border-brand-600 bg-brand-50 text-brand-800" : "border-gray-300 bg-white text-gray-700"}`}>
          All
        </Link>
        {CLASSIFICATIONS.map((c) => (
          <Link key={c} href={`/calls?type=${c}`} className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold ${filter === c ? "border-brand-600 bg-brand-50 text-brand-800" : "border-gray-300 bg-white text-gray-700"}`}>
            {humanize(c)}
          </Link>
        ))}
      </div>

      {calls.length === 0 ? (
        <EmptyState
          title={filter ? `No ${humanize(filter).toLowerCase()} calls` : "No calls yet"}
          body={account.twilioNumber ? "Every call your AI host answers will appear here with a recording and transcript." : "Connect your phone number in Settings → Phone to start taking calls."}
        />
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2 3xl:grid-cols-3">
          {calls.map((c) => {
            const live = c.callStatus === "ongoing" || c.callStatus === "registered";
            return (
              <li key={c.id} className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                <Link href={`/calls/${c.id}`} className="block h-full p-4 hover:bg-gray-50">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={classificationTone[c.classification]}>{humanize(c.classification)}</Badge>
                    {live ? <Badge tone="green">Live</Badge> : null}
                    {c.isTest ? <Badge tone="gray">Test</Badge> : null}
                    {c.callbackRequested ? <Badge tone="amber">Callback</Badge> : null}
                    <span className="ml-auto text-xs text-gray-500">{live ? "in progress" : formatDuration(c.duration)}</span>
                  </div>
                  <p className="mt-1 font-semibold">
                    {c.callerName ? `${c.callerName} · ` : ""}
                    {c.callerPhone ? formatUsPhone(c.callerPhone) : "Unknown caller"}
                  </p>
                  <p className="text-sm text-gray-500">{formatDateTime(c.startedAt, account.timeZone)}</p>
                  {c.summary ? <p className="mt-1 line-clamp-2 text-sm text-gray-700">{c.summary}</p> : c.messageText ? <p className="mt-1 line-clamp-2 text-sm text-gray-700">{c.messageText}</p> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
