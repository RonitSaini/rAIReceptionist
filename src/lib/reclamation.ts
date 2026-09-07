import { prisma } from "./prisma";
import { billingRequired } from "./env";
import { billingState, reclamationDueAt, reclamationWarnAt, RECLAIM_DAYS, RECLAIM_WARN_DAYS } from "./billing-state";
import { createNotification } from "./notifications";
import { messagingServiceSid, releaseNumber, removeNumberFromMessagingService, TwilioError } from "./twilio";
import { deleteAgent, deleteLlm, RetellError } from "./retell";
import { syncRetellAgentQuietly } from "./agent-sync";
import { sendNumberReleasedEmail } from "./email";
import { formatUsPhone } from "./form";

/**
 * The daily billing sweep (docs/frontdesk-billing-spec.md §3-4).
 *
 * Two jobs, both idempotent, both driven by clocks that applySubscription set:
 *
 *   1. A grace that ran out. The state machine already answers "paused" the moment the tenth day
 *      passes; what has to happen ONCE is telling the owner and re-syncing the agent so its prompt
 *      carries the billing-paused section. `billingPausedAt` is that once.
 *   2. Reclamation. Day 20 warns, day 30 releases the number and deletes the agent. A number rents
 *      real money every month for as long as it exists, and without this a customer who left in
 *      March is still costing the business in December.
 *
 * Reactivation clears every clock in applySubscription, so an account that comes back inside the
 * window is simply never seen here again.
 */
export async function sweepBilling(now: Date = new Date()): Promise<{ paused: number; warned: number; released: number }> {
  const result = { paused: 0, warned: 0, released: 0 };
  if (!billingRequired()) return result;

  // Only accounts with something to lose or something to be told: the ones that finished setup
  // far enough to hold a number or an agent. A row still in onboarding is paused by definition
  // and has nothing for this sweep to do.
  const candidates = await prisma.account.findMany({
    where: {
      isInternal: false,
      subscriptionStatus: { notIn: ["active", "trialing"] },
      OR: [{ twilioNumber: { not: null } }, { retellAgentId: { not: null } }],
    },
  });

  for (const a of candidates) {
    if (billingState(a, now) !== "paused") continue;

    if (!a.billingPausedAt) {
      await prisma.account.update({ where: { id: a.id }, data: { billingPausedAt: now } });
      await createNotification({
        accountId: a.id,
        type: "system",
        priority: "urgent",
        title: "Billing paused: the AI is taking messages only",
        body: `Your subscription is not active, so ${a.hostName} still answers every call and takes the caller's details, but cannot book anything. Reactivate under Settings → Billing to book again.${a.twilioNumber ? ` Your number is released ${RECLAIM_DAYS} days after the subscription ended.` : ""}`,
      });
      // The prompt gains its BILLING PAUSED section; runs after this request in the cron, and is
      // recorded on the account if Retell is unreachable.
      await syncRetellAgentQuietly(a.id);
      result.paused++;
    }

    if (!a.twilioNumber) continue;
    const warnAt = reclamationWarnAt(a);
    const dueAt = reclamationDueAt(a);
    if (!warnAt || !dueAt) continue;

    if (now >= dueAt) {
      await releaseAccountNumber(a.id, now);
      result.released++;
    } else if (now >= warnAt && !a.reclamationWarnedAt) {
      await prisma.account.update({ where: { id: a.id }, data: { reclamationWarnedAt: now } });
      const daysLeft = Math.max(1, Math.ceil((dueAt.getTime() - now.getTime()) / 86_400_000));
      await createNotification({
        accountId: a.id,
        type: "system",
        priority: "urgent",
        title: `Your number ${formatUsPhone(a.twilioNumber)} is released in ${daysLeft} days`,
        body: `It has been ${RECLAIM_WARN_DAYS} days since your subscription ended. Reactivate under Settings → Billing before then to keep it - a released number cannot be reclaimed.`,
      });
      result.warned++;
    }
  }
  return result;
}

/**
 * Day 30. Pool membership first, then the number, then the agent - each best-effort past the first,
 * because a Twilio hiccup on the pool must not leave a number renting for another month, and a
 * Retell hiccup on the agent must not leave a number we already released still on the account.
 */
async function releaseAccountNumber(accountId: string, now: Date): Promise<void> {
  const a = await prisma.account.findUnique({ where: { id: accountId } });
  if (!a?.twilioNumber) return;
  const number = a.twilioNumber;

  const service = messagingServiceSid();
  if (service && a.twilioNumberSid) {
    await removeNumberFromMessagingService(service, a.twilioNumberSid).catch((e) => console.warn("[reclamation] pool removal failed", accountId, e instanceof TwilioError ? e.message : e));
  }
  if (a.twilioNumberSid) {
    try {
      await releaseNumber(a.twilioNumberSid);
    } catch (e) {
      // Already gone is the outcome we wanted. Anything else keeps the row as it is: the sweep will
      // try again tomorrow, and nothing below runs against a number that is still renting.
      if (!(e instanceof TwilioError && e.status === 404)) {
        console.error("[reclamation] release failed", accountId, e instanceof TwilioError ? e.message : e);
        return;
      }
    }
  }
  if (a.retellAgentId) await deleteAgent(a.retellAgentId).catch((e) => console.warn("[reclamation] agent delete failed", accountId, e instanceof RetellError ? e.message : e));
  if (a.retellLlmId) await deleteLlm(a.retellLlmId).catch((e) => console.warn("[reclamation] llm delete failed", accountId, e instanceof RetellError ? e.message : e));

  await prisma.account.update({
    where: { id: accountId },
    data: { twilioNumber: null, twilioNumberSid: null, retellAgentId: null, retellLlmId: null, smsPoolAttachedAt: null, numberReleasedAt: now },
  });
  await createNotification({
    accountId,
    type: "system",
    priority: "urgent",
    title: `Your number ${formatUsPhone(number)} has been released`,
    body: "Your subscription ended more than 30 days ago. Calls to that number are no longer answered. Re-subscribe under Settings → Billing and we will issue a new number right away.",
  });
  const owner = await prisma.user.findFirst({ where: { accountId }, select: { email: true }, orderBy: { createdAt: "asc" } });
  if (owner) await sendNumberReleasedEmail(owner.email, a.businessName, formatUsPhone(number)).catch((e) => console.error("[reclamation] release email failed", accountId, e));
}
