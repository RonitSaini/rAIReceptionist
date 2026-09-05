import { prisma } from "./prisma";
import type { CarrierKeywordKind } from "./sms-keywords";

/**
 * Who has left, and who has come back.
 *
 * The carrier is the authority: it blocks an opted-out number whatever this app believes. What this
 * mirror buys is the difference between a send that fails and a send that never happens. Before it,
 * a booking confirmation to a number that had texted STOP was handed to Twilio, rejected with 21610,
 * recorded on a row nobody looks at, and the owner went on believing the customer had been told.
 *
 * Every write here is best-effort. Opt-out bookkeeping must never break the inbound webhook that
 * carries it — the carrier has already done the part that legally matters by the time we run.
 */

/** Has this number told this account to stop texting? Unknown numbers are reachable. */
export async function isOptedOut(accountId: string, phone: string | null | undefined): Promise<boolean> {
  if (!phone) return false;
  try {
    const customer = await prisma.customer.findUnique({
      where: { accountId_phone: { accountId, phone } },
      select: { smsOptedOutAt: true },
    });
    return customer?.smsOptedOutAt != null;
  } catch {
    // A lookup that fails must not silently stop a business texting its customers: the safe
    // default is to attempt the send and let the carrier be the one to refuse it.
    return false;
  }
}

/**
 * Record what a carrier keyword did to this number's subscription.
 *
 * A row is created when none exists, because someone can text STOP without ever having booked
 * anything — a wrong number, or a customer whose call never reached the point of taking a name.
 * "Unknown caller" is the same placeholder upsertCustomer() has always used for exactly that case.
 *
 * HELP changes nothing, and is passed through so callers can hand this the keyword kind without
 * having to know which of the three matter.
 */
export async function applyCarrierKeyword(accountId: string, phone: string, kind: CarrierKeywordKind): Promise<void> {
  if (kind === "help") return;
  const smsOptedOutAt = kind === "opt_out" ? new Date() : null;
  try {
    await prisma.customer.upsert({
      where: { accountId_phone: { accountId, phone } },
      update: { smsOptedOutAt },
      create: { accountId, phone, name: "Unknown caller", smsOptedOutAt },
    });
  } catch (e) {
    console.warn("[sms] could not record opt-out state", e);
  }
}

/**
 * Mark a number opted out because the carrier said so on a delivery receipt, not because we saw
 * the keyword.
 *
 * A STOP sent while our webhook was down, or typed to the carrier rather than to us, never reaches
 * applyCarrierKeyword — the first the app hears of it is a 21610 on the next message. Recording it
 * here is what stops the second, third and fourth message from being attempted too.
 *
 * Unlike the keyword path this never creates a customer: the number has already been written to a
 * booking or a call by whatever produced the message being reported on.
 */
export async function markOptedOutFromDeliveryFailure(accountId: string, phone: string): Promise<void> {
  try {
    await prisma.customer.updateMany({
      where: { accountId, phone, smsOptedOutAt: null },
      data: { smsOptedOutAt: new Date() },
    });
  } catch (e) {
    console.warn("[sms] could not record opt-out from delivery receipt", e);
  }
}
