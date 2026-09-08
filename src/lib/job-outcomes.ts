import type { Account, Call, Job } from "@prisma/client";
import { after } from "next/server";
import { createNotification } from "./notifications";
import { formatUsPhone } from "./form";
import { formatDateTime } from "./time";
import { verticalFor, vocabularyFor } from "@/verticals";
import { markConfirmationSent, notifyUndeliveredSms, sendGuestSms } from "./sms";
import { afterEscalation } from "./outcomes";
import { syncJobToGoogle } from "./google-calendar";

/**
 * What happens after the AI books or dispatches work.
 *
 * The restaurant equivalents live in outcomes.ts; this is the same shape for Job rows. Emergencies
 * deliberately get no escalation machinery of their own — they hand straight to `afterEscalation`,
 * which already does the urgent in-app notification, the outbound call to the owner's cell and the
 * ten-minute acknowledgement sweep with its follow-up text. One escalation path, exercised by
 * every vertical, so a fix to it fixes all of them.
 */

/**
 * Confirmation notification + customer text for a booked or requested job.
 *
 * `rebook` marks a booking the same call corrected before hanging up — the notification says so
 * instead of announcing a second new job, and the customer gets a fresh text with the fixed
 * details, because the first one may already have landed with the wrong address on it.
 */
export async function afterJobBooked(account: Account, job: Job, call: Call | null, opts?: { rebook?: boolean }): Promise<void> {
  // Mirror onto Google after the response is sent: the caller is on the phone, and a slow or down
  // Google must never stretch the pause after "you're booked". Failures land on Job.googleSyncError.
  after(() => syncJobToGoogle(job.id));

  const words = vocabularyFor(account);
  const when = job.scheduledStart ? formatDateTime(job.scheduledStart, account.timeZone) : "time to be confirmed";

  await createNotification({
    accountId: account.id,
    type: "job",
    priority: job.isEmergency ? "urgent" : "normal",
    // An emergency is never the vertical's booking noun: a roofer books estimates, but "EMERGENCY
    // estimate" is not what water coming through a ceiling is. Same reason its Job.kind is dispatch.
    title: job.isEmergency ? `EMERGENCY: ${job.customerName}` : `${opts?.rebook ? "Updated" : "New"} ${words.booking.one}: ${job.customerName}`,
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

  // jobId so a failed confirmation shows up on the Dispatch queue beside the person waiting for it.
  const sms = await sendGuestSms(account, job.customerPhone, body, { purpose: "job_confirmation", jobId: job.id });
  await markConfirmationSent("job", job.id, sms);
  // The Dispatch queue already flags this while the job is live; the notification is what reaches
  // an owner who is not looking at that queue, and what survives the job leaving it.
  await notifyUndeliveredSms(account, sms, { name: job.customerName, phone: job.customerPhone, what: `Their ${words.booking.one} is booked here, but the confirmation text did not arrive`, jobId: job.id, callId: call?.id ?? null });
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
