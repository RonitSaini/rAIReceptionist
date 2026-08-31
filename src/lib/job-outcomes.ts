import type { Account, Call, Job } from "@prisma/client";
import { createNotification } from "./notifications";
import { formatUsPhone } from "./form";
import { formatDateTime } from "./time";
import { verticalFor, vocabularyFor } from "@/verticals";
import { markConfirmationSent, sendGuestSms } from "./sms";
import { afterEscalation } from "./outcomes";

/**
 * What happens after the AI books or dispatches work.
 *
 * The restaurant equivalents live in outcomes.ts; this is the same shape for Job rows. Emergencies
 * deliberately get no escalation machinery of their own — they hand straight to `afterEscalation`,
 * which already does the urgent in-app notification, the outbound call to the owner's cell and the
 * ten-minute acknowledgement sweep with its follow-up text. One escalation path, exercised by
 * every vertical, so a fix to it fixes all of them.
 */

/** Confirmation notification + customer text for a booked or requested job. */
export async function afterJobBooked(account: Account, job: Job, call: Call | null): Promise<void> {
  const words = vocabularyFor(account);
  const when = job.scheduledStart ? formatDateTime(job.scheduledStart, account.timeZone) : "time to be confirmed";

  await createNotification({
    accountId: account.id,
    // The NotificationType enum is shared and predates Job; `jobId` is what identifies the record,
    // and notificationHref sends the reader to /jobs/<id>.
    type: "reservation",
    priority: job.isEmergency ? "urgent" : "normal",
    title: `${job.isEmergency ? "EMERGENCY " : "New "}${words.booking.one}: ${job.customerName}`,
    body: [when, job.customerPhone ? formatUsPhone(job.customerPhone) : null, job.address, job.description, job.assignedTo ? `assigned to ${job.assignedTo}` : null, `booked by ${account.hostName}`]
      .filter(Boolean)
      .join(" · "),
    jobId: job.id,
    callId: call?.id ?? null,
  });

  const body = verticalFor(account).smsTemplates.bookingConfirmation(account, {
    kind: "job",
    customerName: job.customerName,
    when: job.scheduledStart,
    address: job.address,
    technician: job.assignedTo,
    isEmergency: job.isEmergency,
  });

  const sms = await sendGuestSms(account, job.customerPhone, body, { purpose: "reservation_confirmation" });
  await markConfirmationSent("job", job.id, sms);
}

/**
 * An emergency. The caller has already been told the technician will call within 15 minutes, which
 * is exactly the promise `afterEscalation` makes and then chases.
 */
export async function afterEmergencyDispatched(
  account: Account,
  call: Call | null,
  input: { customerName: string; customerPhone: string | null; address: string | null; emergencyType: string; description: string },
): Promise<void> {
  const detail = [input.emergencyType.replace(/_/g, " "), input.address, input.description].filter(Boolean).join(" · ");
  await afterEscalation(account, call, {
    callerName: input.customerName,
    callerPhone: input.customerPhone,
    message: detail,
    reason: "emergency",
  });
}
