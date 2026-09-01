import Link from "next/link";
import type { JobStatus } from "@prisma/client";
import { requireAccount } from "@/lib/current-account";
import { prisma } from "@/lib/prisma";
import { formatDateTime, nowUtc, timeAgo } from "@/lib/time";
import { formatUsPhone } from "@/lib/form";
import { humanize } from "@/lib/constants";
import { vocabularyFor } from "@/verticals";
import { Badge, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { Reveal } from "@/components/reveal";
import { JOB_STATUS_TONE, JOB_STATUS_ORDER } from "@/lib/jobs-ui";
import { getGoogleCalendarStatus } from "@/lib/google-calendar-view";
import { calendarBlurbFor, calendarSettingsHref } from "@/lib/calendar-sync-ui";
import { CalendarSyncPrompt } from "@/components/calendar-sync-prompt";

export const metadata = { title: "Work orders" };

/**
 * The queue.
 *
 * Two flags do the work here. `Emergency` is obvious. `Unverified` is the one that matters and is
 * easy to miss: it means the address came from whoever was on the phone and nobody has checked it,
 * because the number they called from was not on file. The office needs to see that before it sends
 * someone to a door.
 */
export default async function WorkOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; google?: string; message?: string }> }) {
  const { account } = await requireAccount();
  const { status, google: googleStatus, message: googleMessage } = await searchParams;
  const words = vocabularyFor(account);
  const now = nowUtc();

  const active = JOB_STATUS_ORDER.includes(status as JobStatus) ? (status as JobStatus) : null;
  const jobs = await prisma.job.findMany({
    where: { accountId: account.id, ...(active ? { status: active } : {}) },
    orderBy: [{ isEmergency: "desc" }, { createdAt: "desc" }],
    take: 200,
    include: { property: true, unit: true },
  });

  const [counts, calendar] = await Promise.all([
    prisma.job.groupBy({ by: ["status"], where: { accountId: account.id }, _count: { _all: true } }),
    getGoogleCalendarStatus(account.id),
  ]);
  const countFor = (s: JobStatus) => counts.find((c) => c.status === s)?._count._all ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader title={words.booking.Many} subtitle={`${jobs.length} shown`} action={<LinkButton href="/jobs/new" size="sm">+ {words.booking.One}</LinkButton>} />

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link href="/work-orders" className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold ${!active ? "border-brand-600 bg-brand-50 text-brand-800" : "border-gray-300 bg-surface text-gray-700"}`}>
          All
        </Link>
        {JOB_STATUS_ORDER.map((s) => (
          <Link key={s} href={`/work-orders?status=${s}`} className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold ${active === s ? "border-brand-600 bg-brand-50 text-brand-800" : "border-gray-300 bg-surface text-gray-700"}`}>
            {humanize(s)} · {countFor(s)}
          </Link>
        ))}
      </div>

      {jobs.length === 0 ? (
        <EmptyState title={`No ${words.booking.many}`} body={`Anything ${account.hostName} takes on the phone arrives here.`} />
      ) : (
        <ul className="space-y-3">
          {jobs.map((job, i) => {
            const details = (job.details ?? {}) as Record<string, unknown>;
            const unverified = details.unverified === true;
            const category = typeof details.category === "string" ? details.category : null;
            return (
              <Reveal as="li" index={i} key={job.id} className={`rounded-2xl border bg-surface p-4 ${job.isEmergency ? "border-red-300" : "border-gray-200"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/jobs/${job.id}`} className="block font-semibold">
                      {job.property ? `${job.property.name}${job.unit ? ` · ${job.unit.label}` : ""}` : (job.address ?? "Address not given")}
                    </Link>
                    <p className="text-sm text-gray-700">{job.description}</p>
                    <p className="text-xs text-gray-500">
                      {job.customerName}
                      {job.customerPhone ? ` · ${formatUsPhone(job.customerPhone)}` : ""} · {timeAgo(job.createdAt, now)}
                      {job.assignedTo ? ` · ${job.assignedTo}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    {job.isEmergency ? <Badge tone="red">Emergency</Badge> : null}
                    {unverified ? <Badge tone="amber">Unverified address</Badge> : null}
                    {category ? <Badge tone="gray">{humanize(category)}</Badge> : null}
                    <Badge tone={JOB_STATUS_TONE[job.status]}>{humanize(job.status)}</Badge>
                  </div>
                </div>
                {job.scheduledStart ? <p className="mt-2 text-xs text-gray-500">Scheduled {formatDateTime(job.scheduledStart, account.timeZone)}</p> : null}
              </Reveal>
            );
          })}
        </ul>
      )}

      <CalendarSyncPrompt
        status={calendar}
        returnTo="/work-orders"
        manageHref={calendarSettingsHref("property_management")}
        blurb={calendarBlurbFor("property_management")}
        itemsLabel={words.booking.many}
        googleStatus={googleStatus}
        googleMessage={googleMessage}
      />
    </div>
  );
}
