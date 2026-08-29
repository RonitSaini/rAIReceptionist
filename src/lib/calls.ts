import type { Call } from "@prisma/client";
import { prisma } from "./prisma";
import type { RetellCall } from "./retell";

/**
 * Find the Call row for a Retell call, creating it if the Twilio voice webhook didn't (e.g. Retell test calls
 * from the dashboard, or a race between Retell and our own insert). Returns null if the account is unknown.
 */
export async function findOrCreateCallFromRetell(rc: RetellCall): Promise<Call | null> {
  const existing = await prisma.call.findUnique({ where: { retellCallId: rc.call_id } });
  if (existing) return existing;

  const metaAccountId = typeof rc.metadata?.accountId === "string" ? rc.metadata.accountId : null;
  let accountId = metaAccountId;
  if (!accountId && rc.agent_id) {
    const byAgent = await prisma.account.findFirst({ where: { retellAgentId: rc.agent_id }, select: { id: true } });
    accountId = byAgent?.id ?? null;
  }
  if (!accountId) return null;

  const isTest = rc.metadata?.test === true;
  const callerPhone = rc.direction === "outbound" ? rc.to_number ?? null : rc.from_number ?? null;
  try {
    return await prisma.call.create({
      data: {
        accountId,
        retellCallId: rc.call_id,
        twilioCallSid: rc.telephony_identifier?.twilio_call_sid ?? null,
        callerPhone,
        direction: rc.direction ?? "inbound",
        callStatus: rc.call_status === "ended" ? "ended" : "ongoing",
        isTest,
        startedAt: rc.start_timestamp ? new Date(rc.start_timestamp) : new Date(),
      },
    });
  } catch {
    // Unique-constraint race: the other writer won.
    return prisma.call.findUnique({ where: { retellCallId: rc.call_id } });
  }
}

/** Map Retell's transcript objects to "Agent: … / Caller: …" lines when the plain transcript is missing. */
export function transcriptText(rc: RetellCall): string | null {
  if (rc.transcript?.trim()) return rc.transcript.trim();
  if (rc.transcript_object?.length) return rc.transcript_object.map((t) => `${t.role === "agent" ? "Agent" : "Caller"}: ${t.content}`).join("\n");
  return null;
}
