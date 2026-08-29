import { prisma } from "./prisma";
import { appUrl, retellConfigured } from "./env";
import { createAgent, createLlm, listVoices, updateAgent, updateLlm, RetellError } from "./retell";
import { buildAgentConfig, buildLlmConfig } from "./agent-config";
import { VOICES } from "./constants";

export type SyncResult = { ok: true; agentId: string; voiceId: string } | { ok: false; error: string };

/** Pick a voice Retell actually has. Falls back gracefully so a renamed voice never breaks provisioning. */
export async function resolveVoiceId(preferred: string): Promise<string> {
  let voices: { voice_id: string; provider: string }[] = [];
  try {
    voices = await listVoices();
  } catch {
    return preferred; // can't check — let Retell validate
  }
  if (voices.length === 0) return preferred;
  if (voices.some((v) => v.voice_id === preferred)) return preferred;
  for (const v of VOICES) if (voices.some((x) => x.voice_id === v.id)) return v.id;
  return voices.find((v) => v.provider === "elevenlabs")?.voice_id ?? voices[0].voice_id;
}

/**
 * Create or update the Retell LLM + agent for an account from its current settings.
 * Safe to call repeatedly; stores the resulting IDs and sync status on the account.
 */
export async function syncRetellAgent(accountId: string): Promise<SyncResult> {
  if (!retellConfigured()) return { ok: false, error: "Retell is not configured (RETELL_API_KEY)." };

  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) return { ok: false, error: "Account not found." };

  const [hours, managerHours, menu] = await Promise.all([
    prisma.businessHours.findMany({ where: { accountId }, orderBy: [{ dayOfWeek: "asc" }, { sortOrder: "asc" }] }),
    prisma.managerAvailability.findMany({ where: { accountId } }),
    prisma.menuItem.findMany({ where: { accountId }, orderBy: { sortOrder: "asc" } }),
  ]);

  const src = { account, hours, managerHours, menu, appUrl: appUrl() };

  try {
    const llmConfig = buildLlmConfig(src);
    let llmId = account.retellLlmId;
    if (llmId) {
      try {
        await updateLlm(llmId, llmConfig);
      } catch (e) {
        if (e instanceof RetellError && e.status === 404) llmId = null;
        else throw e;
      }
    }
    if (!llmId) llmId = (await createLlm(llmConfig)).llm_id;

    const voiceId = await resolveVoiceId(account.voiceId);
    const agentConfig = buildAgentConfig(src, llmId, voiceId);
    let agentId = account.retellAgentId;
    if (agentId) {
      try {
        await updateAgent(agentId, agentConfig);
      } catch (e) {
        if (e instanceof RetellError && e.status === 404) agentId = null;
        else throw e;
      }
    }
    if (!agentId) agentId = (await createAgent(agentConfig)).agent_id;

    await prisma.account.update({
      where: { id: accountId },
      data: { retellLlmId: llmId, retellAgentId: agentId, agentSyncedAt: new Date(), agentSyncError: null },
    });
    return { ok: true, agentId, voiceId };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await prisma.account.update({ where: { id: accountId }, data: { agentSyncError: error.slice(0, 500) } }).catch(() => {});
    return { ok: false, error };
  }
}

/** Fire-and-forget sync used after settings changes. Errors are recorded on the account, never thrown. */
export async function syncRetellAgentQuietly(accountId: string): Promise<void> {
  try {
    const a = await prisma.account.findUnique({ where: { id: accountId }, select: { retellAgentId: true } });
    if (!a?.retellAgentId || !retellConfigured()) return;
    await syncRetellAgent(accountId);
  } catch (e) {
    console.error("[agent-sync] failed", e);
  }
}
