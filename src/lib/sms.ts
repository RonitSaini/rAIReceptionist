import type { Account } from "@prisma/client";
import { prisma } from "./prisma";
import { sendSms } from "./twilio";
import { twilioConfigured } from "./env";
import { verticalFor } from "@/verticals";
import type { CancellationKind } from "@/verticals/types";

/**
 * Guest-facing SMS (the restaurant itself is never texted — it gets in-app notifications).
 * Every send is best-effort: a Twilio failure (trial limits, unregistered 10DLC, bad number) is
 * logged and reported back, never thrown into the call flow.
 */

export type SmsResult = { ok: true; sid: string } | { ok: false; error: string; skipped?: boolean };

function sender(account: Pick<Account, "twilioNumber">): string | undefined {
  return process.env.TWILIO_MESSAGING_SERVICE_SID ? undefined : (account.twilioNumber ?? undefined);
}

/** What a guest message was for. Stored so cost reporting can break SMS spend down by cause. */
export type SmsPurpose = "reservation_confirmation" | "takeout_confirmation" | "escalation_followup" | "cancellation_reply" | "inbound_reply";

export async function sendGuestSms(
  account: Pick<Account, "id" | "twilioNumber" | "restaurantName">,
  to: string | null | undefined,
  body: string,
  meta?: { purpose?: SmsPurpose; callId?: string | null; reservationId?: string | null },
): Promise<SmsResult> {
  if (!to) return { ok: false, error: "no phone number", skipped: true };
  if (!twilioConfigured()) return { ok: false, error: "Twilio not configured", skipped: true };
  const from = sender(account);
  if (!from && !process.env.TWILIO_MESSAGING_SERVICE_SID) return { ok: false, error: "no sending number yet", skipped: true };
  try {
    const sent = await sendSms({ to, body, from });
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
    });
    return { ok: true, sid: sent.sid };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.warn(`[sms] to ${to} failed: ${error}`);
    return { ok: false, error };
  }
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
  purpose?: SmsPurpose | null;
  callId?: string | null;
  reservationId?: string | null;
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
        purpose: row.purpose ?? null,
        callId: row.callId ?? null,
        reservationId: row.reservationId ?? null,
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
type TemplateAccount = Pick<Account, "vertical" | "restaurantName" | "timeZone" | "twilioNumber">;

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

export function cancellationReplyText(account: TemplateAccount, kind: CancellationKind, when: Date): string {
  return verticalFor(account).smsTemplates.cancellationReply(account, kind, when);
}

/** Record that a guest confirmation went out (or why it didn't) on the booking. */
export async function markConfirmationSent(kind: "reservation" | "order", id: string, result: SmsResult): Promise<void> {
  if (!result.ok) return;
  if (kind === "reservation") await prisma.reservation.update({ where: { id }, data: { smsConfirmedAt: new Date() } }).catch(() => {});
  else await prisma.takeoutOrder.update({ where: { id }, data: { smsConfirmedAt: new Date() } }).catch(() => {});
}
