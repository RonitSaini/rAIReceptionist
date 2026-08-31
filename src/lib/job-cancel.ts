import type { Account, Job } from "@prisma/client";
import { after } from "next/server";
import { prisma } from "./prisma";
import { syncJobToGoogle } from "./google-calendar";
import { createNotification } from "./notifications";
import { formatDateTime } from "./time";
import { formatUsPhone } from "./form";

/**
 * Reply-CANCEL for jobs. The confirmation texts have said "reply CANCEL" since Phase 2; until now
 * only reservations and takeout orders honored it. The pieces here are deliberately small and
 * pure-ish so the SMS route stays a switchboard.
 */

/** Statuses a customer may cancel by text. Work already in progress is a phone call, not a keyword. */
export const SMS_CANCELLABLE_STATUSES = ["requested", "scheduled", "dispatched", "en_route"] as const;

/** "1", "2.", "cancel 3" → which listed job. Null when the text is not a bare choice. */
export function parseCancelChoice(body: string): number | null {
  const m = body.match(/^\s*(?:cancel\s+)?([1-3])\s*\.?\s*$/i);
  return m ? Number(m[1]) : null;
}

/**
 * The sender's own cancellable jobs, at most three, in the order the choice prompt lists them.
 * Unscheduled work (an active dispatch, a work order waiting for a time) sorts first — it is the
 * most current thing — then by when the visit is booked. The same query answers both the CANCEL
 * text and the numbered reply, which is what keeps the two texts consistent without stored state.
 */
export async function cancellableJobsFor(accountId: string, phone: string, notBefore: Date): Promise<Job[]> {
  return prisma.job.findMany({
    where: {
      accountId,
      customerPhone: phone,
      status: { in: [...SMS_CANCELLABLE_STATUSES] },
      OR: [{ scheduledStart: null }, { scheduledStart: { gte: notBefore } }],
    },
    orderBy: [{ scheduledStart: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
    take: 3,
  });
}

/** Cancel through the normal path: the same row update the dashboard makes, the same calendar removal. */
export async function cancelJobFromSms(account: Account, job: Job, from: string): Promise<void> {
  await prisma.job.update({ where: { id: job.id }, data: { status: "cancelled", cancelledAt: new Date(), cancelledBy: "customer" } });
  after(() => syncJobToGoogle(job.id)); // the mirrored event goes with it

  // Urgent when somebody may already be moving. A dispatch is urgent by KIND, not just status:
  // the row sits at "requested" while the office is being rung, and a tow cancelled in that window
  // still has to be SEEN before a driver rolls to a caller who gave up on them.
  const someoneMoving = job.kind === "dispatch" || job.status === "dispatched" || job.status === "en_route";
  await createNotification({
    accountId: account.id,
    type: "job",
    priority: job.isEmergency || someoneMoving ? "urgent" : "normal",
    title: `Cancelled by customer: ${job.customerName}`,
    body: `${job.scheduledStart ? formatDateTime(job.scheduledStart, account.timeZone) : "No scheduled time"} · replied CANCEL by text from ${formatUsPhone(from)}`,
    jobId: job.id,
  });
}
