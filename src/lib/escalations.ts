import { prisma } from "./prisma";
import { escalationTimeoutMinutes, followUpUnacknowledgedEscalation } from "./outcomes";

/**
 * Sweep unacknowledged escalations older than the acknowledge window and text the guest.
 * Runs from the cron route and after each Retell webhook (so it's frequent during service).
 * Idempotent: a notification is followed up at most once (followUpSentAt).
 */
export async function sweepEscalations(opts: { timeoutMinutes?: number; limit?: number } = {}): Promise<{ checked: number; sent: number; failed: number }> {
  const timeout = opts.timeoutMinutes ?? escalationTimeoutMinutes();
  const cutoff = new Date(Date.now() - timeout * 60_000);
  const due = await prisma.notification.findMany({
    where: { type: "escalation", priority: "urgent", acknowledgedAt: null, followUpSentAt: null, createdAt: { lt: cutoff } },
    include: { call: true, account: true },
    orderBy: { createdAt: "asc" },
    take: opts.limit ?? 25,
  });
  let sent = 0;
  let failed = 0;
  for (const n of due) {
    try {
      const r = await followUpUnacknowledgedEscalation(n);
      if (r.sent) sent++;
      else failed++;
    } catch (e) {
      failed++;
      console.error("[escalations] follow-up failed", n.id, e);
    }
  }
  return { checked: due.length, sent, failed };
}
