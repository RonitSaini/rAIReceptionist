import Link from "next/link";
import type { CallClassification } from "@prisma/client";
import { requireAccount } from "@/lib/current-account";
import { prisma } from "@/lib/prisma";
import { isCallLive } from "@/lib/calls";
import { formatDateTime, formatDuration } from "@/lib/time";
import { formatUsPhone } from "@/lib/form";
import { classificationLabel } from "@/lib/constants";
import { verticalFor, vocabularyFor } from "@/verticals";
import { Badge, EmptyState, PageHeader, StatusDot, classificationTone } from "@/components/ui";
import { SegmentedLinks } from "@/components/segmented-links";

export const metadata = { title: "Calls" };

const CLASSIFICATIONS: CallClassification[] = ["reservation", "takeout", "question", "waitlist", "message", "escalation", "missed", "other"];
// A trade takes no takeout orders and runs no waitlist, so those two chips could only ever come
// back empty.
const FIELD_SERVICE_CLASSIFICATIONS: CallClassification[] = ["service_call", "estimate", "emergency", "question", "message", "escalation", "missed", "other"];

export default async function CallsPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { account } = await requireAccount();
  const { type } = await searchParams;
  const filter = CLASSIFICATIONS.includes(type as CallClassification) ? (type as CallClassification) : null;
  const words = vocabularyFor(account);
  const choices = verticalFor(account).archetype === "restaurant" ? CLASSIFICATIONS : FIELD_SERVICE_CLASSIFICATIONS;
  const label = (c: string) => classificationLabel(c, words);

  const calls = await prisma.call.findMany({
    where: { accountId: account.id, ...(filter ? { classification: filter } : {}) },
    orderBy: { startedAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Calls" subtitle={account.twilioNumber ? `${account.hostName} is answering ${formatUsPhone(account.twilioNumber)}` : "Your AI host's call history"} />

      <SegmentedLinks
        fill="soft"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
        itemClass="shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold"
        activeClass="border-brand-600 bg-brand-50 text-brand-800"
        inactiveClass="border-gray-300 bg-surface text-gray-700"
        items={[{ key: "all", href: "/calls", label: "All", active: !filter }, ...choices.map((c) => ({ key: c, href: `/calls?type=${c}`, label: label(c), active: filter === c }))]}
      />

      {calls.length === 0 ? (
        <EmptyState
          title={filter ? `No ${label(filter).toLowerCase()} calls` : "No calls yet"}
          body={account.twilioNumber ? "Every call your AI host answers will appear here with a recording and transcript." : "Connect your phone number in Settings → Phone to start taking calls."}
        />
      ) : (
        <ul data-arrival="cascade" className="grid gap-3 xl:grid-cols-2 3xl:grid-cols-3">
          {calls.map((c) => {
            const live = isCallLive(c);
            // An emergency or an escalation is an alarm: it arrives complete, never staggered behind
            // ordinary calls (motion spec §7.4 rule 17). Its red badge is untouched.
            const urgent = c.classification === "emergency" || c.classification === "escalation";
            return (
              <li key={c.id} data-urgent={urgent ? "true" : undefined} className="lift overflow-hidden rounded-2xl border border-gray-200 bg-surface">
                <Link href={`/calls/${c.id}`} className="block h-full p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={classificationTone[c.classification]}>{label(c.classification)}</Badge>
                    {live ? (
                      <Badge tone="green" className="gap-1.5">
                        <StatusDot /> Live
                      </Badge>
                    ) : null}
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
