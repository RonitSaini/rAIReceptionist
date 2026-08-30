import type { Account, BusinessHours, Call, ManagerAvailability, Notification, Reservation, TakeoutOrder } from "@prisma/client";
import { prisma } from "./prisma";
import { createNotification } from "./notifications";
import { createCall } from "./twilio";
import { appUrl, twilioConfigured } from "./env";
import { formatUsPhone } from "./form";
import { addDays, dayOfWeekOf, formatClock, formatDateString, formatDateTime, getParts, timeToMinutes, toDateString } from "./time";
import { periodsForDay } from "./availability";
import { ESCALATION_TYPES } from "./constants";
import { escalationFollowUpText, markConfirmationSent, reservationConfirmationText, sendGuestSms, takeoutConfirmationText } from "./sms";

/**
 * Phase 3: what happens after the AI does something on a call.
 * Every outcome → an in-app Notification (the restaurant is never texted);
 * bookings → a guest confirmation SMS; escalations → urgent notification + a call to the manager.
 */

const REASON_LABEL: Record<string, string> = Object.fromEntries(ESCALATION_TYPES.map((t) => [t.key, t.label]));
REASON_LABEL.general_question = "Question the AI couldn't answer";
REASON_LABEL.callback_request = "Caller asked for a call back";
REASON_LABEL.other = "Needs a call back";

export function reasonLabel(reason: string | null | undefined): string {
  return (reason && REASON_LABEL[reason]) || "Needs a call back";
}

// ---------- Bookings ----------

export async function afterReservationBooked(account: Account, r: Reservation, call: Call | null): Promise<void> {
  const when = formatDateTime(r.startTime, account.timeZone);
  await createNotification({
    accountId: account.id,
    type: r.isWaitlist ? "waitlist" : "reservation",
    title: r.isWaitlist ? `Waitlist: ${r.guestName}, party of ${r.partySize}` : `New reservation: ${r.guestName}, party of ${r.partySize}`,
    body: `${when}${r.guestPhone ? ` · ${formatUsPhone(r.guestPhone)}` : ""}${r.seatingPreference ? ` · ${r.seatingPreference}` : ""}${r.specialRequests ? ` · "${r.specialRequests}"` : ""} · booked by ${account.hostName}`,
    reservationId: r.id,
    callId: call?.id ?? null,
  });
  const sms = await sendGuestSms(account, r.guestPhone, reservationConfirmationText(account, r));
  await markConfirmationSent("reservation", r.id, sms);
}

export async function afterTakeoutOrdered(account: Account, o: TakeoutOrder, call: Call | null): Promise<void> {
  const when = formatDateTime(o.pickupTime, account.timeZone);
  await createNotification({
    accountId: account.id,
    type: "takeout",
    title: `New ${o.isDelivery ? "delivery" : "takeout"} order: ${o.guestName}`,
    body: `${o.isDelivery ? "Deliver" : "Pickup"} ${when}${o.guestPhone ? ` · ${formatUsPhone(o.guestPhone)}` : ""} · ${o.items.replace(/\s*\n+\s*/g, ", ").slice(0, 140)} · taken by ${account.hostName}`,
    takeoutOrderId: o.id,
    callId: call?.id ?? null,
  });
  const sms = await sendGuestSms(account, o.guestPhone, takeoutConfirmationText(account, o));
  await markConfirmationSent("order", o.id, sms);
}

// ---------- Messages + escalations ----------

export async function afterMessageTaken(account: Account, call: Call | null, input: { callerName: string; callerPhone: string | null; message: string; reason: string }): Promise<Notification> {
  return createNotification({
    accountId: account.id,
    type: "message",
    title: `Message from ${input.callerName}${input.callerPhone ? ` · ${formatUsPhone(input.callerPhone)}` : ""}`,
    body: `${reasonLabel(input.reason)}: ${input.message}`,
    callId: call?.id ?? null,
  });
}

/** Is a manager reachable right now per the configured hours? (No hours configured = always.) */
export function managerReachableNow(rows: ManagerAvailability[], timeZone: string, now = new Date()): boolean {
  if (rows.length === 0) return true;
  const p = getParts(now, timeZone);
  const min = p.hour * 60 + p.minute;
  return rows.some((r) => r.dayOfWeek === p.weekday && min >= timeToMinutes(r.start) && min < timeToMinutes(r.end));
}

/** Human "when we next open" for the guest follow-up text, e.g. "tomorrow at 11:30 AM". */
export function nextOpeningLabel(hours: BusinessHours[], timeZone: string, now = new Date()): string | null {
  const today = toDateString(now, timeZone);
  const nowMin = timeToMinutes(`${String(getParts(now, timeZone).hour).padStart(2, "0")}:${String(getParts(now, timeZone).minute).padStart(2, "0")}`);
  for (let i = 0; i < 8; i++) {
    const d = addDays(today, i);
    const periods = periodsForDay(hours, dayOfWeekOf(d));
    for (const p of periods) {
      if (i === 0 && timeToMinutes(p.open) <= nowMin) continue;
      const dayLabel = i === 0 ? "today" : i === 1 ? "tomorrow" : formatDateString(d, { weekday: "long" });
      return `${dayLabel} at ${formatClock(p.open)}`;
    }
  }
  return null;
}

export async function afterEscalation(account: Account, call: Call | null, input: { callerName: string; callerPhone: string | null; message: string; reason: string }): Promise<Notification> {
  const [managerHours] = await Promise.all([prisma.managerAvailability.findMany({ where: { accountId: account.id } })]);
  const reachable = managerReachableNow(managerHours, account.timeZone);

  const notification = await createNotification({
    accountId: account.id,
    type: "escalation",
    priority: "urgent",
    title: `Manager needed: ${reasonLabel(input.reason)}`,
    body: `${input.callerName}${input.callerPhone ? ` · ${formatUsPhone(input.callerPhone)}` : ""} — ${input.message} · ${account.hostName} promised a call back within 15 minutes.${reachable ? "" : " (Outside manager hours — not phoned.)"}`,
    callId: call?.id ?? null,
  });

  // Ring the manager's cell so they know to open the app. Best-effort; the notification is the source of truth.
  if (reachable && call && account.cellPhone && account.twilioNumber && twilioConfigured()) {
    try {
      const base = appUrl();
      const { sid } = await createCall({
        to: account.cellPhone,
        from: account.twilioNumber,
        url: `${base}/api/twilio/manager-alert?n=${encodeURIComponent(notification.id)}`,
        statusCallback: `${base}/api/twilio/status`,
        timeoutSeconds: 25,
      });
      await prisma.call.update({ where: { id: call.id }, data: { managerCallSid: sid, managerCalledAt: new Date() } }).catch(() => {});
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      console.warn("[escalation] manager call failed:", err);
      await prisma.notification.update({ where: { id: notification.id }, data: { body: `${notification.body} (Couldn't ring the manager: ${err})` } }).catch(() => {});
    }
  }
  return notification;
}

// ---------- Missed calls ----------

export async function afterMissedCall(account: Account, call: Call): Promise<void> {
  if (call.notifiedAt) return;
  await prisma.call.update({ where: { id: call.id }, data: { notifiedAt: new Date() } });
  await createNotification({
    accountId: account.id,
    type: "missed_call",
    title: `Missed call${call.callerPhone ? ` from ${formatUsPhone(call.callerPhone)}` : ""}`,
    body: call.disconnectionReason ? `The call ended before ${account.hostName} could help (${call.disconnectionReason.replace(/_/g, " ")}).` : `The call ended before ${account.hostName} could help.`,
    callId: call.id,
  });
}

// ---------- Escalation follow-up (10-minute window lapsed) ----------

export function escalationTimeoutMinutes(): number {
  const n = Number.parseInt(process.env.ESCALATION_ACK_TIMEOUT_MINUTES ?? "10", 10);
  return Number.isFinite(n) && n > 0 ? n : 10;
}

/** Text the guest that the manager will call when the restaurant next opens. Returns what was sent. */
export async function followUpUnacknowledgedEscalation(n: Notification & { call: Call | null; account: Account }): Promise<{ sent: boolean; reason: string }> {
  const hours = await prisma.businessHours.findMany({ where: { accountId: n.accountId } });
  const nextOpen = nextOpeningLabel(hours, n.account.timeZone);
  const to = n.call?.callerPhone ?? null;
  const sms = await sendGuestSms(n.account, to, escalationFollowUpText(n.account, nextOpen));
  await prisma.notification.update({
    where: { id: n.id },
    data: {
      followUpSentAt: new Date(),
      body: sms.ok ? `${n.body} · Guest texted: manager will call back ${nextOpen ?? "when we open"}.` : `${n.body} · Follow-up text not sent (${sms.error}).`,
    },
  });
  return { sent: sms.ok, reason: sms.ok ? "sent" : sms.error };
}
