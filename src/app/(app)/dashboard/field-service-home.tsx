import Link from "next/link";
import type { Account } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatDateLong, formatDateTime, formatTime, nowUtc } from "@/lib/time";
import { formatUsPhone } from "@/lib/form";
import { humanize } from "@/lib/constants";
import { loadDashboard } from "@/lib/dashboard";
import { loadJobDashboard } from "@/lib/job-dashboard";
import { verticalFor, vocabularyFor } from "@/verticals";
import { setJobStatus } from "@/actions/field-service";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { StatusButtons } from "@/components/status-buttons";
import { JOB_STATUS_TONE, JOB_TRANSITIONS } from "@/lib/jobs-ui";
import { Reveal } from "@/components/reveal";
import { CountUp } from "@/components/count-up";
import { StatTile } from "@/components/stat-tile";
import { Columns } from "@/components/charts";
import { DashboardMasonry, type DashCard } from "@/components/dashboard-layout";
import { AttentionCard, CallbacksCard, CallsThisWeek, CardLink } from "./shared";

/**
 * The home page for every non-restaurant archetype: trades, dispatch-first operators, shops and
 * property managers. The KPI tiles are the fixed top row; everything else is a DashCard whose
 * declared state places it in the masonry — urgent first, content next, and anything empty
 * collapsed to a compact row so it never holds a card-sized hole open.
 */
export async function FieldServiceHome({ account, previousSeenAt, changed }: { account: Account; previousSeenAt: Date | null; changed?: string }) {
  const tz = account.timeZone;
  const now = nowUtc();
  const words = vocabularyFor(account);
  const definition = verticalFor(account);
  // Where "today's work" lives differs by archetype: a diary for a trade, a live queue for a tow
  // truck, a work-order list for a property manager who schedules nothing from this screen.
  const queueHref =
    definition.archetype === "property_management" ? "/work-orders" : definition.dispatchFirst && !account.takesScheduledWork ? "/dispatch" : "/schedule";
  const queueLabel = queueHref === "/dispatch" ? "Dispatch" : queueHref === "/work-orders" ? words.booking.Many : "Schedule";

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

  // Declaration order is placement order within each state; attention first, so urgent = top-left.
  const cards: DashCard[] = [];

  cards.push(
    unacknowledged.length > 0 || fresh.length > 0
      ? { key: "attention", state: unacknowledged.length > 0 ? "urgent" : "content", node: <AttentionCard unacknowledged={unacknowledged} fresh={fresh} account={account} /> }
      : { key: "attention", state: "empty", empty: { text: <>Nothing new since you last signed in{previousSeenAt ? ` (${formatDateTime(previousSeenAt, tz)})` : ""}.</>, href: "/notifications", cta: "Inbox" } },
  );

  if (dash.callbacks.length > 0) cards.push({ key: "callbacks", state: "content", node: <CallbacksCard callbacks={dash.callbacks} now={now} /> });

  cards.push(
    jobs.todaysJobs.length > 0
      ? {
          key: "today",
          state: "content",
          node: (
            <Card
              title={
                <>
                  Today&apos;s {words.booking.many} · <CountUp to={j.jobsToday} />
                </>
              }
              action={<CardLink href={queueHref}>{queueLabel}</CardLink>}
            >
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
            </Card>
          ),
        }
      : { key: "today", state: "empty", empty: { text: `No ${words.booking.many} today.`, href: "/jobs/new", cta: "Add one" } },
  );

  cards.push(
    jobs.unscheduled.length > 0
      ? {
          key: "waiting",
          state: "content",
          node: (
            <Card
              title={
                <>
                  Waiting for a time · <CountUp to={j.unscheduled} />
                </>
              }
              action={<CardLink href="/jobs">All {words.booking.many}</CardLink>}
            >
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
            </Card>
          ),
        }
      : { key: "waiting", state: "empty", empty: { text: "Everything has a time booked." } },
  );

  cards.push(
    weekCalls > 0
      ? { key: "week", state: "content", node: <CallsThisWeek account={account} dash={dash} /> }
      : { key: "week", state: "empty", empty: { text: "No calls in the last 7 days." } },
  );

  cards.push(
    bookedAhead > 0
      ? {
          key: "ahead",
          state: "content",
          node: (
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
          ),
        }
      : { key: "ahead", state: "empty", empty: { text: `No ${words.booking.many} booked in the next 7 days.`, href: "/jobs/new", cta: "Book" } },
  );

  return (
    <div className="space-y-5">
      <PageHeader title="Home" subtitle={formatDateLong(now, tz)} action={<LinkButton href="/jobs/new" size="sm">+ {words.booking.One}</LinkButton>} />

      {/* KPI row — fixed, always first */}
      <Reveal index={0} className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Calls today" value={t.callsToday} icon="phone" live href="/calls" delta={{ value: t.callsDelta, label: "vs yesterday" }} note={t.liveCalls > 0 ? `${t.liveCalls} live now` : undefined} />
        <StatTile label={`${words.booking.Many} today`} value={j.jobsToday} icon="wrench" href={queueHref} delta={{ value: j.jobsDelta, label: "vs yesterday" }} />
        <StatTile label="Emergencies" value={j.openEmergencies} icon="siren" href="/jobs?status=emergency" note={j.openEmergencies === 0 ? "None open" : undefined} />
        <StatTile label="Unread" value={t.unread} icon="bell" live href="/notifications" note={t.unread === 0 ? "All caught up" : undefined} />
      </Reveal>

      <DashboardMasonry cards={cards} />
    </div>
  );
}
