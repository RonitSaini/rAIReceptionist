import Link from "next/link";
import type { JobStatus } from "@prisma/client";
import { requireAccount } from "@/lib/current-account";
import { prisma } from "@/lib/prisma";
import { formatDateTime, nowUtc, timeAgo } from "@/lib/time";
import { formatUsPhone } from "@/lib/form";
import { humanize } from "@/lib/constants";
import { verticalFor, vocabularyFor } from "@/verticals";
import { Badge, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { Reveal } from "@/components/reveal";
import { SegmentedLinks } from "@/components/segmented-links";
import { JOB_STATUS_TONE, JOB_STATUS_ORDER } from "@/lib/jobs-ui";
import { getGoogleCalendarStatus } from "@/lib/google-calendar-view";
import { calendarBlurbFor, calendarSettingsHref } from "@/lib/calendar-sync-ui";
import { CalendarSyncPrompt } from "@/components/calendar-sync-prompt";

export const metadata = { title: "Jobs" };

/** Every job, newest first, filterable by status. The schedule shows the diary; this shows the list. */
export default async function JobsPage({ searchParams }: { searchParams: Promise<{ status?: string; google?: string; message?: string }> }) {
  const { account } = await requireAccount();
  const { status, google: googleStatus, message: googleMessage } = await searchParams;
  const words = vocabularyFor(account);
  const now = nowUtc();
  // A dispatch-only account has no /schedule page to make the offer on, but its dispatches still
  // reach the calendar (jobEventWindow gives them a response-time window), so this list is its
  // diary. Accounts that DO schedule are offered it on /schedule instead — never in both places.
  const offerCalendarHere = account.takesScheduledWork === false;

  const active = JOB_STATUS_ORDER.includes(status as JobStatus) ? (status as JobStatus) : null;
  const jobs = await prisma.job.findMany({
    where: { accountId: account.id, ...(active ? { status: active } : {}) },
    orderBy: [{ scheduledStart: "desc" }, { createdAt: "desc" }],
    take: 100,
  });

  const [counts, calendar] = await Promise.all([
    prisma.job.groupBy({ by: ["status"], where: { accountId: account.id }, _count: { _all: true } }),
    offerCalendarHere ? getGoogleCalendarStatus(account.id) : null,
  ]);
  const countFor = (s: JobStatus) => counts.find((c) => c.status === s)?._count._all ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title={words.booking.Many}
        action={
          <LinkButton href="/jobs/new" size="sm">
            + New
          </LinkButton>
        }
      />

      <SegmentedLinks
        role="group"
        aria-label="Filters"
        className="flex flex-wrap gap-2"
        itemClass="rounded-full border px-3 py-1.5 text-sm font-semibold"
        activeClass="border-brand-600 bg-brand-600 text-white"
        inactiveClass="border-gray-300 bg-surface text-gray-700"
        items={[
          { key: "all", href: "/jobs", label: "All", active: !active },
          ...JOB_STATUS_ORDER.map((s) => ({
            key: s,
            href: `/jobs?status=${s}`,
            label: (
              <>
                {humanize(s)} <span className="text-xs opacity-70">{countFor(s)}</span>
              </>
            ),
            active: active === s,
          })),
        ]}
      />

      {jobs.length === 0 ? (
        <EmptyState title={`No ${words.booking.many}${active ? ` with status ${humanize(active)}` : ""}`} action={<LinkButton href="/jobs/new">Add one</LinkButton>} />
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2">
          {jobs.map((j, i) => (
            <Reveal as="li" index={i} key={j.id} className="lift min-w-0 rounded-2xl border border-gray-200 bg-surface p-4">
              <Link href={`/jobs/${j.id}`} className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">
                    {j.isEmergency ? <span className="mr-1 text-red-600">EMERGENCY</span> : null}
                    {j.customerName}
                    {j.customerPhone ? <span className="font-normal text-gray-500"> · {formatUsPhone(j.customerPhone)}</span> : null}
                  </span>
                  {j.address ? <span className="block truncate text-sm text-gray-600">{j.address}</span> : null}
                  {j.description ? <span className="line-clamp-1 block text-sm text-gray-500">{j.description}</span> : null}
                  <span className="text-xs text-gray-500">
                    {j.scheduledStart ? formatDateTime(j.scheduledStart, account.timeZone) : `Requested ${timeAgo(j.createdAt, now)}`}
                    {j.assignedTo ? ` · ${j.assignedTo}` : ""}
                  </span>
                </span>
                <Badge tone={JOB_STATUS_TONE[j.status]} className="shrink-0">
                  {humanize(j.status)}
                </Badge>
              </Link>
            </Reveal>
          ))}
        </ul>
      )}

      {calendar ? (
        <CalendarSyncPrompt
          status={calendar}
          returnTo="/jobs"
          manageHref={calendarSettingsHref(verticalFor(account).archetype)}
          blurb={calendarBlurbFor(verticalFor(account).archetype)}
          itemsLabel={words.booking.many}
          googleStatus={googleStatus}
          googleMessage={googleMessage}
        />
      ) : null}
    </div>
  );
}
