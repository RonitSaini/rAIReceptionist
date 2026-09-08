import type { Account } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";
import { formatDateTime } from "./time";
import { addNumberToMessagingService, messagingServiceSid, sendSms, TwilioError } from "./twilio";
import { appUrl, twilioConfigured } from "./env";
import { createNotification } from "./notifications";
import { formatUsPhone } from "./form";
import { friendlyProviderError } from "./provider-errors";
import { isOptedOut } from "./sms-opt-out";
import { verticalFor } from "@/verticals";
import type { CancellationKind } from "@/verticals/types";

/**
 * Where Twilio reports what the carrier did with a message.
 *
 * Undefined when there is no public URL to call back to (a bare `next dev` with nothing tunnelling
 * in), because a StatusCallback pointing at localhost is a delivery receipt sent into a void.
 */
function smsStatusCallbackUrl(): string | undefined {
  const base = appUrl();
  return /^https:\/\//.test(base) ? `${base}/api/twilio/sms/status` : undefined;
}

/**
 * Guest-facing SMS (the restaurant itself is never texted — it gets in-app notifications).
 * Every send is best-effort: a Twilio failure (trial limits, unregistered 10DLC, bad number) is
 * logged and reported back, never thrown into the call flow.
 */

/**
 * Why a text did not go out.
 *
 * The distinction that matters is whether anyone should be told. `opted_out` and `provider` are
 * things that happened to a message somebody was expecting; `no_number` and `not_configured` mean
 * there was never going to be a message at all, and an owner mid-setup does not need a notification
 * per booking explaining that they have not finished setting up.
 */
export type SmsFailureReason = "no_number" | "not_configured" | "opted_out" | "provider";

export type SmsResult = { ok: true; sid: string } | { ok: false; error: string; reason: SmsFailureReason; skipped?: boolean };

/**
 * Always the business's own number (spec section 7). The Messaging Service rides alongside it on
 * the request and makes the traffic registered; it never chooses the sender. A message from
 * Ridgeway Plumbing must come from Ridgeway Plumbing's number, whatever else is in the pool.
 */
function sender(account: Pick<Account, "twilioNumber">): string | undefined {
  return account.twilioNumber ?? undefined;
}

/** What a guest message was for. Stored so cost reporting can break SMS spend down by cause. */
export type SmsPurpose = "reservation_confirmation" | "takeout_confirmation" | "job_confirmation" | "escalation_followup" | "cancellation_reply" | "inbound_reply" | "unacknowledged" | "running_late";

export async function sendGuestSms(
  account: Pick<Account, "id" | "twilioNumber" | "businessName">,
  to: string | null | undefined,
  body: string,
  meta?: { purpose?: SmsPurpose; callId?: string | null; reservationId?: string | null; jobId?: string | null },
): Promise<SmsResult> {
  if (!to) return { ok: false, error: "no phone number", reason: "no_number", skipped: true };
  if (!twilioConfigured()) return { ok: false, error: "Twilio not configured", reason: "not_configured", skipped: true };
  const from = sender(account);
  if (!from) return { ok: false, error: "no sending number yet", reason: "not_configured", skipped: true };
  // The fallback the spec allows and nothing else: with no service the text goes out from the raw
  // number, which US carriers filter as unregistered traffic. Loud on purpose - this line in a
  // production log is the whole diagnosis.
  if (!messagingServiceSid()) console.warn(`[sms] TWILIO_MESSAGING_SERVICE_SID is not set; sending from the raw number ${from}, which US carriers filter as unregistered A2P traffic`);

  // They asked us to stop. Twilio would refuse this anyway; refusing it here means the refusal is
  // ours, carries the real reason, and cannot be mistaken for a message that went out. The row is
  // still written, at zero segments, because a text the business could not send is a fact about
  // the account — the same reason a hard failure is recorded below.
  if (await isOptedOut(account.id, to)) {
    const error = "Recipient has opted out of messages from this number (replied STOP).";
    await recordSms({
      accountId: account.id,
      messageSid: `optedout:${randomUUID()}`,
      direction: "outbound",
      toNumber: to,
      fromNumber: from ?? null,
      numSegments: 0,
      status: "failed",
      error,
      purpose: meta?.purpose ?? null,
      callId: meta?.callId ?? null,
      reservationId: meta?.reservationId ?? null,
      jobId: meta?.jobId ?? null,
    });
    return { ok: false, error, reason: "opted_out", skipped: true };
  }

  try {
    const sent = await sendSms({ to, body, from, statusCallback: smsStatusCallbackUrl() });
    await recordSms({
      accountId: account.id,
      messageSid: sent.sid,
      direction: "outbound",
      toNumber: to,
      fromNumber: sent.from ?? from ?? null,
      numSegments: sent.numSegments,
      encoding: sent.encoding ?? null,
      status: sent.status ?? null,
      purpose: meta?.purpose ?? null,
      callId: meta?.callId ?? null,
      reservationId: meta?.reservationId ?? null,
      jobId: meta?.jobId ?? null,
    });
    return { ok: true, sid: sent.sid };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.warn(`[sms] to ${to} failed: ${error}`);
    // Record the failure rather than only logging it. A text we could not send is a fact about the
    // account - especially this one, where the caller is waiting on a roadside for a reply that
    // never arrived - and the Dispatch queue reads these rows to say so out loud.
    await recordSms({
      accountId: account.id,
      messageSid: `failed:${randomUUID()}`,
      direction: "outbound",
      toNumber: to,
      fromNumber: from ?? null,
      numSegments: 0,
      status: "failed",
      error,
      purpose: meta?.purpose ?? null,
      callId: meta?.callId ?? null,
      reservationId: meta?.reservationId ?? null,
      jobId: meta?.jobId ?? null,
    });
    return { ok: false, error, reason: "provider" };
  }
}

/**
 * Tell the owner a customer was not reached.
 *
 * Bookings taken by the AI used to fail silently in exactly the place it matters most: the guest
 * confirmation. `markConfirmationSent` returns early when the send failed, `smsConfirmedAt` stays
 * null, and nothing anywhere renders that column — so a confirmation that never arrived looked
 * identical to one that did. Only the Dispatch queue (jobs) and the escalation follow-up said
 * anything out loud.
 *
 * Quiet when nothing was ever going to be sent (no number on the booking, Twilio not connected
 * yet): those are setup facts, not delivery failures, and one notification per booking would bury
 * the feed during the first hour of an account's life.
 */
export async function notifyUndeliveredSms(
  account: Pick<Account, "id">,
  result: SmsResult,
  about: { name: string; phone: string | null | undefined; what: string; reservationId?: string | null; takeoutOrderId?: string | null; jobId?: string | null; callId?: string | null },
): Promise<void> {
  if (result.ok) return;
  if (result.reason === "no_number" || result.reason === "not_configured") return;

  const who = about.name?.trim() || (about.phone ? formatUsPhone(about.phone) : "your customer");
  // The raw provider text stays on the SmsMessage row; the owner gets one plain clause.
  const why = friendlyProviderError("sms", result.error);
  const next = result.reason === "opted_out" ? "Call them if the details need confirming - texting this number will keep failing until they text START." : "Call them to confirm.";

  await createNotification({
    accountId: account.id,
    type: "system",
    priority: "urgent",
    title: `Couldn't text ${who}`,
    body: `${about.what} - ${why}. ${next}`,
    reservationId: about.reservationId ?? null,
    takeoutOrderId: about.takeoutOrderId ?? null,
    jobId: about.jobId ?? null,
    callId: about.callId ?? null,
  }).catch((e) => console.warn("[sms] could not notify about an undelivered text", e));
}

/** What the message was, in the owner's words. Mirrors SmsPurpose. */
export const PURPOSE_LABEL: Record<SmsPurpose, string> = {
  reservation_confirmation: "Their booking confirmation never reached them",
  takeout_confirmation: "Their order confirmation never reached them",
  // Service calls, estimates, shop visits and work orders. Logged as reservation_confirmation
  // until 2026-09-08, which read as a restaurant booking on every trade's SMS log.
  job_confirmation: "Their visit confirmation never reached them",
  escalation_followup: "The follow-up promising a call back never reached them",
  cancellation_reply: "The confirmation of their cancellation never reached them",
  inbound_reply: "Our reply never reached them",
  unacknowledged: "The message telling them nobody had picked up never reached them",
  running_late: "The running-late notice never reached them",
};

/**
 * Say out loud that a recorded message did not arrive (spec rule 4), from its row.
 *
 * Shared by the delivery receipt (the carrier said no) and the stale sweep (the carrier said
 * nothing for half an hour), so the two failures read the same to the owner.
 */
export async function reportUndeliveredSms(row: { accountId: string; toNumber: string; purpose: string | null; reservationId: string | null; jobId: string | null; callId: string | null }, error: string, reason: "opted_out" | "provider"): Promise<void> {
  const customer = await prisma.customer.findUnique({
    where: { accountId_phone: { accountId: row.accountId, phone: row.toNumber } },
    select: { name: true },
  });
  await notifyUndeliveredSms(
    { id: row.accountId },
    { ok: false, error, reason },
    {
      name: customer?.name && customer.name !== "Unknown caller" ? customer.name : formatUsPhone(row.toNumber),
      phone: row.toNumber,
      what: PURPOSE_LABEL[row.purpose as SmsPurpose] ?? "A text to them never arrived",
      reservationId: row.reservationId,
      takeoutOrderId: null,
      jobId: row.jobId,
      callId: row.callId,
    },
  );
}

/** Twilio accepted it and has not said what the carrier did. Anything else is an answer. */
const IN_FLIGHT_STATUSES = ["queued", "accepted", "sending", "scheduled"];
export const SMS_RECEIPT_TIMEOUT_MINUTES = 30;

/**
 * The 30-minute rule (spec section 7): a message still in flight half an hour after it was sent is
 * failed and said out loud, not left pending forever.
 *
 * Before this, a text the carrier silently dropped - the exact shape of unregistered A2P traffic -
 * sat at "queued" on its row indefinitely and read as sent. Twilio's own "sent" is deliberately not
 * in the list: that is the carrier accepting the message, and plenty of carriers never follow it
 * with a delivered receipt.
 *
 * Idempotent: the claim is an updateMany on the in-flight statuses, so two sweeps cannot both
 * notify, and a receipt arriving a second later finds a terminal row and does nothing.
 */
export async function sweepStaleSms(opts: { limit?: number; now?: Date } = {}): Promise<{ failed: number }> {
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - SMS_RECEIPT_TIMEOUT_MINUTES * 60_000);
  const stale = await prisma.smsMessage.findMany({
    where: { direction: "outbound", status: { in: IN_FLIGHT_STATUSES }, createdAt: { lt: cutoff } },
    orderBy: { createdAt: "asc" },
    take: opts.limit ?? 50,
  });
  let failed = 0;
  for (const row of stale) {
    const error = `No delivery receipt within ${SMS_RECEIPT_TIMEOUT_MINUTES} minutes of sending (last status: ${row.status})`;
    const claimed = await prisma.smsMessage.updateMany({ where: { id: row.id, status: { in: IN_FLIGHT_STATUSES } }, data: { status: "failed", error } });
    if (claimed.count === 0) continue;
    failed++;
    await reportUndeliveredSms(row, error, "provider").catch((e) => console.warn("[sms] could not report a stale message", row.id, e));
  }
  return { failed };
}

/**
 * Put a number in the A2P sender pool and remember that it is there (spec section 7). Called at
 * provisioning, and by the daily sweep for any number a provisioning-time failure left out.
 * Nothing without a service configured: there is no pool to join.
 */
export async function attachNumberToSmsPool(accountId: string, numberSid: string): Promise<boolean> {
  const service = messagingServiceSid();
  if (!service) return false;
  try {
    await addNumberToMessagingService(service, numberSid);
    await prisma.account.update({ where: { id: accountId }, data: { smsPoolAttachedAt: new Date() } });
    return true;
  } catch (e) {
    console.error(`[sms] could not add number to the messaging service for account ${accountId}: ${e instanceof TwilioError ? e.message : String(e)}`);
    return false;
  }
}

/** Every number that should be in the pool and is not yet recorded as such. */
export async function sweepSmsPool(): Promise<{ attached: number; failed: number }> {
  if (!messagingServiceSid() || !twilioConfigured()) return { attached: 0, failed: 0 };
  const owed = await prisma.account.findMany({ where: { twilioNumberSid: { not: null }, smsPoolAttachedAt: null }, select: { id: true, twilioNumberSid: true } });
  let attached = 0;
  let failed = 0;
  for (const a of owed) {
    if ((await attachNumberToSmsPool(a.id, a.twilioNumberSid as string))) attached++;
    else failed++;
  }
  return { attached, failed };
}

/**
 * Persist what Twilio billed for one message.
 *
 * Best-effort and never thrown from: a costing write must never break a call flow or a
 * guest confirmation. Idempotent on messageSid so a webhook retry cannot double-count.
 */
export async function recordSms(row: {
  accountId: string;
  messageSid: string;
  direction: "outbound" | "inbound";
  toNumber: string;
  fromNumber?: string | null;
  numSegments: number;
  encoding?: string | null;
  status?: string | null;
  error?: string | null;
  purpose?: SmsPurpose | null;
  callId?: string | null;
  reservationId?: string | null;
  jobId?: string | null;
}): Promise<void> {
  try {
    await prisma.smsMessage.upsert({
      where: { messageSid: row.messageSid },
      update: { numSegments: row.numSegments, status: row.status ?? undefined, encoding: row.encoding ?? undefined },
      create: {
        accountId: row.accountId,
        messageSid: row.messageSid,
        direction: row.direction,
        toNumber: row.toNumber,
        fromNumber: row.fromNumber ?? null,
        numSegments: row.numSegments,
        encoding: row.encoding ?? null,
        status: row.status ?? null,
        error: row.error ?? null,
        purpose: row.purpose ?? null,
        callId: row.callId ?? null,
        reservationId: row.reservationId ?? null,
        jobId: row.jobId ?? null,
      },
    });
  } catch (e) {
    console.warn("[sms] could not record message for costing", e);
  }
}

/**
 * Guest-facing text is per-vertical: the words a restaurant sends a diner are not the words a
 * plumber sends a homeowner. These wrappers keep the historic names and signatures so no caller
 * changes, and hand the actual wording to the account's definition in src/verticals.
 */
type TemplateAccount = Pick<Account, "vertical" | "businessName" | "timeZone" | "twilioNumber">;

export function reservationConfirmationText(account: TemplateAccount, r: { guestName: string; partySize: number; startTime: Date; isWaitlist: boolean }): string {
  return verticalFor(account).smsTemplates.bookingConfirmation(account, {
    kind: "reservation",
    customerName: r.guestName,
    when: r.startTime,
    partySize: r.partySize,
    isWaitlist: r.isWaitlist,
  });
}

export function takeoutConfirmationText(account: TemplateAccount, o: { guestName: string; items: string; pickupTime: Date; isDelivery: boolean }): string {
  return verticalFor(account).smsTemplates.bookingConfirmation(account, {
    kind: "order",
    customerName: o.guestName,
    when: o.pickupTime,
    items: o.items,
    isDelivery: o.isDelivery,
  });
}

export function escalationFollowUpText(account: TemplateAccount, nextOpen: string | null): string {
  return verticalFor(account).smsTemplates.escalationFollowUp(account, nextOpen);
}

/**
 * What to text a caller nobody got back to in time.
 *
 * Order of preference: whatever the owner wrote in Settings, then the vertical's own honest line,
 * then the ordinary "we will call you when we open". The first two only exist for trades where
 * silence is the harmful answer.
 */
export function unacknowledgedText(account: TemplateAccount & { unacknowledgedMessage?: string | null }, nextOpen: string | null): string {
  if (account.unacknowledgedMessage?.trim()) return `${account.businessName}: ${account.unacknowledgedMessage.trim()}`;
  const own = verticalFor(account).smsTemplates.unacknowledged;
  return own ? own(account) : escalationFollowUpText(account, nextOpen);
}

export function cancellationReplyText(account: TemplateAccount, kind: CancellationKind, when: Date): string {
  return verticalFor(account).smsTemplates.cancellationReply(account, kind, when);
}

/**
 * Confirmation for a job cancelled by text. Scheduled work hands off to the vertical's own
 * template; work with no time on it (an active dispatch, an unscheduled work order) cannot,
 * because every one of those templates names the date.
 */
export function jobCancelledText(account: TemplateAccount, job: { scheduledStart: Date | null }): string {
  if (job.scheduledStart) return cancellationReplyText(account, "job", job.scheduledStart);
  const w = verticalFor(account).vocabulary;
  return `${account.businessName}: Your ${w.booking.one} is cancelled. Call us any time if you still need us.`;
}

/**
 * The sender has more than one thing that could be cancelled: list them, numbered, and ask.
 * Stateless on purpose — the reply "1" re-runs the same ordered query, so there is no
 * conversation state to store or to go stale.
 */
export function jobCancelChoiceText(account: TemplateAccount, jobs: { scheduledStart: Date | null; kind: string }[]): string {
  const w = verticalFor(account).vocabulary;
  const labels = jobs.map((j, i) => {
    const label = j.scheduledStart ? formatDateTime(j.scheduledStart, account.timeZone) : j.kind === "dispatch" ? `the ${w.booking.one} in progress` : `the ${w.booking.one} not yet scheduled`;
    return `${i + 1} for ${label}`;
  });
  return `${account.businessName}: You have ${jobs.length} upcoming ${w.booking.many}. Reply ${labels.join(", ")}.`;
}

/** Record that a guest confirmation went out (or why it didn't) on the booking. */
export async function markConfirmationSent(kind: "reservation" | "order" | "job", id: string, result: SmsResult): Promise<void> {
  if (!result.ok) return;
  const data = { smsConfirmedAt: new Date() };
  if (kind === "reservation") await prisma.reservation.update({ where: { id }, data }).catch(() => {});
  else if (kind === "job") await prisma.job.update({ where: { id }, data }).catch(() => {});
  else await prisma.takeoutOrder.update({ where: { id }, data }).catch(() => {});
}
