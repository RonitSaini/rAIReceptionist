import type { Account } from "@prisma/client";
import { prisma } from "./prisma";
import { verticalFor } from "@/verticals";
import { subjectLabel } from "./shop-handlers";

/**
 * What we already know about whoever is ringing.
 *
 * Passed to Retell as dynamic variables at the moment the call is registered, which is the only
 * point where the caller's number is known — the prompt itself is synced once and shared by every
 * call. So the prompt says "{{caller_name}}" and this fills it in.
 *
 * Both values always have a sentence in them. A model handed an empty string will sometimes read
 * the empty string out loud, or invent something to fill it; "an unrecognised number" is a fact it
 * can act on.
 */
export type CallerContext = { caller_name: string; caller_context: string };

export const UNKNOWN_CALLER: CallerContext = { caller_name: "an unrecognised number", caller_context: "nothing" };

export async function callerContextFor(account: Account, callerPhone: string | null | undefined): Promise<CallerContext> {
  // Only the shop archetype greets by name today; everyone else gets the neutral pair and their
  // prompt never mentions it.
  if (!callerPhone || verticalFor(account).archetype !== "shop_appointment") return UNKNOWN_CALLER;

  const customer = await prisma.customer
    .findUnique({ where: { accountId_phone: { accountId: account.id, phone: callerPhone } } })
    .catch(() => null);
  if (!customer) return UNKNOWN_CALLER;

  const jobs = await prisma.job.findMany({
    where: { accountId: account.id, customerId: customer.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { details: true },
  });

  // De-duplicated, most recent first: two visits for the same dog is one dog.
  const subjects: string[] = [];
  for (const j of jobs) {
    const label = subjectLabel(j.details as Record<string, unknown> | null);
    if (label && !subjects.includes(label)) subjects.push(label);
  }

  const words = verticalFor(account).vocabulary;
  const noun = words.subject?.one ?? "record";
  const context =
    subjects.length === 0
      ? `no ${words.subject?.many ?? "records"} yet`
      : subjects.length === 1
        ? `one ${noun}: ${subjects[0]}`
        : `${subjects.length} ${words.subject?.many ?? "records"}: ${subjects.join(", ")}`;

  return { caller_name: customer.name, caller_context: context };
}
