import Link from "next/link";
import { requireAccount } from "@/lib/current-account";
import { prisma } from "@/lib/prisma";
import { nowUtc, timeAgo } from "@/lib/time";
import { formatUsPhone } from "@/lib/form";
import { humanize } from "@/lib/constants";
import { vocabularyFor } from "@/verticals";
import { setJobStatus } from "@/actions/field-service";
import { Badge, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { StatusButtons } from "@/components/status-buttons";
import { Reveal } from "@/components/reveal";
import { JOB_STATUS_TONE, JOB_TRANSITIONS } from "@/lib/jobs-ui";

export const metadata = { title: "Dispatch" };

/** Anything still moving. Once it is completed or cancelled it drops off the queue. */
const LIVE = ["requested", "dispatched", "en_route", "in_progress"] as const;

/**
 * The live queue.
 *
 * Deliberately not a calendar. A tow request has no day and no slot; it has a moment it came in and
 * a state it is in, and the only question anyone is asking is "who is still waiting, and for how
 * long". So: oldest first, because the person who has waited longest is the one at risk of being
 * forgotten, with the wait time in minutes shown plainly rather than as a timestamp somebody has to
 * subtract from.
 */
export default async function DispatchPage() {
  const { account } = await requireAccount();
  const words = vocabularyFor(account);
  const now = nowUtc();

  const jobs = await prisma.job.findMany({
    where: { accountId: account.id, status: { in: [...LIVE] } },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  /**
   * Which of these callers we tried to text and could not reach.
   *
   * This is the worst state the system can be in and it used to be invisible: the caller was
   * promised a call back, nobody acknowledged, the honest "try another provider" text was sent -
   * and it bounced. From the office's side everything looked handled. Now it says so, on the row,
   * in red.
   */
  const failedSms = jobs.length
    ? await prisma.smsMessage.findMany({
        where: { accountId: account.id, jobId: { in: jobs.map((j) => j.id) }, status: "failed" },
        select: { jobId: true, error: true },
      })
    : [];
  const notNotified = new Map(failedSms.map((m) => [m.jobId, m.error]));

  const waited = (createdAt: Date) => Math.max(0, Math.round((now.getTime() - createdAt.getTime()) / 60_000));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Dispatch"
        subtitle={jobs.length === 0 ? "Nothing waiting" : `${jobs.length} waiting · longest ${waited(jobs[0].createdAt)} min`}
        action={
          <LinkButton href="/jobs/new" size="sm">
            + {words.booking.One}
          </LinkButton>
        }
      />

      {jobs.length === 0 ? (
        <EmptyState title="Nothing in the queue" body={`New ${words.booking.many} arrive here the moment ${account.hostName} takes them, oldest first.`} />
      ) : (
        <ul className="space-y-3">
          {jobs.map((job, i) => {
            const mins = waited(job.createdAt);
            // Over the acknowledgement window and still nobody has touched it: say so loudly.
            const stale = job.status === "requested" && mins >= 5;
            const unreachable = notNotified.get(job.id);
            return (
              <Reveal as="li" index={i} key={job.id} className={`rounded-2xl border bg-surface p-4 ${unreachable !== undefined ? "border-red-500 bg-red-50/40" : stale ? "border-red-300" : "border-gray-200"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/jobs/${job.id}`} className="block font-semibold">
                      {job.customerName}
                      {job.customerPhone ? <span className="font-normal text-gray-500"> · {formatUsPhone(job.customerPhone)}</span> : null}
                    </Link>
                    <p className="text-sm text-gray-700">{job.address ?? "No location given"}</p>
                    {job.description ? <p className="line-clamp-2 text-sm text-gray-500">{job.description}</p> : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone={job.isEmergency ? "red" : JOB_STATUS_TONE[job.status]}>{job.isEmergency ? "Emergency" : humanize(job.status)}</Badge>
                    <span className={`text-xs font-semibold tabular-nums ${stale ? "text-red-600" : "text-gray-500"}`}>
                      waiting {mins} min
                    </span>
                    <span className="text-[11px] text-gray-400">{timeAgo(job.createdAt, now)}</span>
                  </div>
                </div>

                {unreachable !== undefined ? (
                  <p className="mt-2 rounded-lg bg-red-100 px-3 py-2 text-sm font-semibold text-red-800">
                    Caller not notified - our text to them failed{unreachable ? ` (${unreachable})` : ""}. They are still waiting and do not know. Call them.
                  </p>
                ) : null}

                <div className="mt-3 border-t border-gray-100 pt-3">
                  <StatusButtons id={job.id} current={job.status} transitions={JOB_TRANSITIONS[job.status]} action={setJobStatus} returnTo="/dispatch" size="sm" />
                </div>
              </Reveal>
            );
          })}
        </ul>
      )}
    </div>
  );
}
