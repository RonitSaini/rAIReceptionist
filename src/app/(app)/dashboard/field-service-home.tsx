import Link from "next/link";
import type { Account } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatDateLong, formatTime, nowUtc } from "@/lib/time";
import { formatUsPhone } from "@/lib/form";
import { humanize } from "@/lib/constants";
import { loadDashboard } from "@/lib/dashboard";
import { loadJobDashboard } from "@/lib/job-dashboard";
import { vocabularyFor } from "@/verticals";
import { setJobStatus } from "@/actions/field-service";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { StatusButtons } from "@/components/status-buttons";
import { JOB_STATUS_TONE, JOB_TRANSITIONS } from "@/lib/jobs-ui";
import { Reveal } from "@/components/reveal";
import { CountUp } from "@/components/count-up";
import { StatTile } from "@/components/stat-tile";
import { Columns } from "@/components/charts";
import { CallsThisWeek, CardLink, NeedsYou, Quiet } from "./shared";

/**
 * The home page for a trade: today's visits, anything the agent took but could not slot, and how
 * the week ahead is filling up.
 *
 * The second card is the one that earns its place. A restaurant's equivalent is takeout orders,
 * but a trade's real risk is the job that came in when the diary was full — booked to nobody, on no
 * day, quietly ageing. It is on the home page so it cannot be missed.
 */
export async function FieldServiceHome({ account, previousSeenAt, changed }: { account: Account; previousSeenAt: Date | null; changed?: string }) {
  const tz = account.timeZone;
  const now = nowUtc();
  const words = vocabularyFor(account);

  const [sinceItems, unacknowledged, dash, jobs] = await Promise.all([
    prisma.notification.findMany({
      where: { accountId: account.id, ...(previousSeenAt ? { createdAt: { gt: previousSeenAt } } : { readAt: null }) },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.notification.findMany({ where: { accountId: account.id, priority: "urgent", acknowledgedAt: null }, orderBy: { createdAt: "desc" } }),
    loadDashboard(account),
    loadJobDashboard(account),
  ]);

  const t = dash.tiles;
  const j = jobs.tiles;
  const urgentIds = new Set(unacknowledged.map((n) => n.id));
  const fresh = sinceItems.filter((n) => !urgentIds.has(n.id));
  const weekCalls = dash.callsByDay.reduce((sum, d) => sum + Object.values(d.values as Record<string, number>).reduce((a, b) => a + b, 0), 0);
  const bookedAhead = jobs.jobsAhead.reduce((sum, d) => sum + d.value, 0);
  const showWeek = weekCalls > 0 || bookedAhead > 0;

  return (
    <div className="space-y-5">
      <PageHeader title="Home" subtitle={formatDateLong(now, tz)} action={<LinkButton href="/jobs/new" size="sm">+ {words.booking.One}</LinkButton>} />

      {/* KPI row */}
      <Reveal index={0} className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Calls today" value={t.callsToday} icon="phone" live href="/calls" delta={{ value: t.callsDelta, label: "vs yesterday" }} note={t.liveCalls > 0 ? `${t.liveCalls} live now` : undefined} />
        <StatTile label={`${words.booking.Many} today`} value={j.jobsToday} icon="wrench" href="/schedule" delta={{ value: j.jobsDelta, label: "vs yesterday" }} />
        <StatTile label="Emergencies" value={j.openEmergencies} icon="siren" href="/jobs?status=emergency" note={j.openEmergencies === 0 ? "None open" : undefined} />
        <StatTile label="Unread" value={t.unread} icon="bell" live href="/notifications" note={t.unread === 0 ? "All caught up" : undefined} />
      </Reveal>

      {/* What needs you — only rendered when there is something to act on */}
      <NeedsYou unacknowledged={unacknowledged} fresh={fresh} callbacks={dash.callbacks} previousSeenAt={previousSeenAt} now={now} tz={tz} account={account} />

      {/* Today */}
      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <Reveal index={2}>
          <Card
            title={
              <>
                Today&apos;s {words.booking.many} · <CountUp to={j.jobsToday} />
              </>
            }
            action={<CardLink href="/schedule">Schedule</CardLink>}
          >
            {jobs.todaysJobs.length === 0 ? (
              <Quiet>
                No {words.booking.many} today.{" "}
                <Link href="/jobs/new" className="font-semibold text-brand-700">
                  Add one
                </Link>
              </Quiet>
            ) : (
              <ul className="divide-y divide-gray-100">
                {jobs.todaysJobs.map((job, i) => (
                  <Reveal as="li" index={i + 1} key={job.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <Link href={`/jobs/${job.id}`} className="block font-semibold">
                        {job.scheduledStart ? `${formatTime(job.scheduledStart, tz)} · ` : ""}
                        {job.customerName}
                      </Link>
                      <p className="line-clamp-1 text-sm text-gray-500">
                        {job.address ?? "No address"}
                        {job.assignedTo ? ` · ${job.assignedTo}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone={job.isEmergency ? "red" : JOB_STATUS_TONE[job.status]} className={changed === job.id ? "badge-pop" : undefined}>
                        {job.isEmergency ? "Emergency" : humanize(job.status)}
                      </Badge>
                      <StatusButtons id={job.id} current={job.status} transitions={JOB_TRANSITIONS[job.status].slice(0, 1)} action={setJobStatus} returnTo="/dashboard" size="sm" />
                    </div>
                  </Reveal>
                ))}
              </ul>
            )}
          </Card>
        </Reveal>

        <Reveal index={3}>
          <Card
            title={
              <>
                Waiting for a time · <CountUp to={j.unscheduled} />
              </>
            }
            action={<CardLink href="/jobs">All {words.booking.many}</CardLink>}
          >
            {jobs.unscheduled.length === 0 ? (
              <Quiet>Everything has a time booked.</Quiet>
            ) : (
              <ul className="divide-y divide-gray-100">
                {jobs.unscheduled.map((job, i) => (
                  <Reveal as="li" index={i + 1} key={job.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <Link href={`/jobs/${job.id}`} className="block font-semibold">
                        {job.customerName}
                        {job.customerPhone ? <span className="font-normal text-gray-500"> · {formatUsPhone(job.customerPhone)}</span> : null}
                      </Link>
                      <p className="line-clamp-1 text-sm text-gray-500">{job.description ?? job.address ?? "No details"}</p>
                    </div>
                    <Badge tone={job.isEmergency ? "red" : "amber"} className="shrink-0">
                      {job.isEmergency ? "Emergency" : "Needs a slot"}
                    </Badge>
                  </Reveal>
                ))}
              </ul>
            )}
          </Card>
        </Reveal>
      </div>

      {/* The week — hidden until there is something to chart */}
      {showWeek ? (
        <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
          <Reveal index={4}>
            <CallsThisWeek account={account} dash={dash} />
          </Reveal>
          <Reveal index={5}>
            <Card
              title={`${words.booking.Many} ahead`}
              action={
                <span className="text-xs text-gray-500">
                  Next 7 days{j.aiBookedAhead > 0 ? ` · ${j.aiBookedAhead} booked by ${account.hostName}` : ""}
                </span>
              }
            >
              <Columns items={jobs.jobsAhead} title={`${words.booking.Many} booked per day, next 7 days`} unit={` ${words.booking.many}`} />
            </Card>
          </Reveal>
        </div>
      ) : null}
    </div>
  );
}
