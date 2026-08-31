import { prisma } from "./prisma";
import { ackMinutesFor, followUpUnacknowledgedEscalation } from "./outcomes";

/**
 * Sweep unacknowledged escalations older than the acknowledge window and text the guest.
 * Runs from the cron route and after each Retell webhook (so it's frequent during service).
 * Idempotent: a notification is followed up at most once (followUpSentAt).
 */
export async function sweepEscalations(opts: { timeoutMinutes?: number; limit?: number } = {}): Promise<{ checked: number; sent: number; failed: number }> {
  // The window is per account now - five minutes for a dispatch-first trade, ten for the rest -
  // so the query widens to the shortest any account could have and each row is judged on its own.
  // Sweeping on the longest window would leave a stranded caller waiting twice as long as promised.
  const shortest = opts.timeoutMinutes ?? 1;
  const cutoff = new Date(Date.now() - shortest * 60_000);
  const candidates = await prisma.notification.findMany({
    where: { type: "escalation", priority: "urgent", acknowledgedAt: null, followUpSentAt: null, createdAt: { lt: cutoff } },
    include: { call: true, account: true },
    orderBy: { createdAt: "asc" },
    take: (opts.limit ?? 25) * 4,
  });
  const now = Date.now();
  const due = candidates
    .filter((n) => now - n.createdAt.getTime() >= (opts.timeoutMinutes ?? ackMinutesFor(n.account)) * 60_000)
    .slice(0, opts.limit ?? 25);
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
