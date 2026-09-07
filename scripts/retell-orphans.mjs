/**
 * Retell agents and LLM engines nothing references any more.
 *
 *   npm run retell:orphans                                  # dry run against the branch in .env
 *   npm run retell:orphans -- --production                  # dry run against production accounts
 *   npm run retell:orphans -- --production --delete-agents  # remove orphaned agents
 *   npm run retell:orphans -- --production --delete-llms    # remove orphaned LLM engines
 *
 * An agent or LLM is in use if any Account row points at it; everything else is an orphan. The
 * reclamation sweep deletes an account's agent when its number is released, and deleteAccount does
 * the same, but a failed Retell call in either leaves one behind - and Retell bills per agent
 * nothing, but a stale agent with a live webhook is a call answered by a business that no longer
 * exists. Deletion needs --production on purpose: the only ledger that decides what is real is the
 * production database, and comparing Retell against a dev branch would flag every real agent.
 *
 * Reads Retell through the app's own client (POST /v2/list-agents, paginated; the v1 GET is
 * deprecated), so run it with the TypeScript hooks: the npm script does.
 */
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { REPO_ROOT, loadProductionEnv, readEnvFile } from "./db-env.mjs";

const args = process.argv.slice(2);
const PROD = args.includes("--production");
const DELETE_AGENTS = args.includes("--delete-agents");
const DELETE_LLMS = args.includes("--delete-llms");
if ((DELETE_AGENTS || DELETE_LLMS) && !PROD) {
  console.error("Deleting needs --production: only the production database decides what is in use.");
  process.exit(2);
}

// Retell credentials come from .env (one Retell account in every environment); only the database
// switches with --production, the same way migrate-prod.mjs does it.
const env = readEnvFile(resolve(REPO_ROOT, ".env"));
process.env.RETELL_API_KEY ||= env.RETELL_API_KEY;
if (!process.env.RETELL_API_KEY) throw new Error("RETELL_API_KEY missing from .env");

let prismaOptions;
if (PROD) {
  const { host } = loadProductionEnv();
  prismaOptions = { datasources: { db: { url: process.env.DATABASE_URL } } };
  console.log(`database: PRODUCTION (${host})`);
} else {
  console.log(`database: ${env.NEON_BRANCH ?? "the branch in .env"}`);
}

const { PrismaClient } = createRequire(resolve(REPO_ROOT, "package.json"))("@prisma/client");
const prisma = new PrismaClient(prismaOptions);
const { deleteAgent, deleteLlm, listAgents, listRetellLlms } = await import("../src/lib/retell.ts");

const accounts = await prisma.account.findMany({ select: { businessName: true, retellAgentId: true, retellLlmId: true } });
const agentOwner = new Map(accounts.filter((a) => a.retellAgentId).map((a) => [a.retellAgentId, a.businessName]));
const llmOwner = new Map(accounts.filter((a) => a.retellLlmId).map((a) => [a.retellLlmId, a.businessName]));

const agents = await listAgents();
const llms = await listRetellLlms();
const orphanAgents = agents.filter((a) => !agentOwner.has(a.agent_id));
const orphanLlms = llms.filter((l) => !llmOwner.has(l.llm_id));

console.log(`\nagents in Retell: ${agents.length}   in use: ${agents.length - orphanAgents.length}   orphaned: ${orphanAgents.length}`);
for (const a of agents) console.log(`  ${agentOwner.has(a.agent_id) ? "IN USE " : "orphan "} ${a.agent_id}  "${a.agent_name ?? ""}"${agentOwner.has(a.agent_id) ? `  <- ${agentOwner.get(a.agent_id)}` : ""}`);
console.log(`llms in Retell: ${llms.length}   in use: ${llms.length - orphanLlms.length}   orphaned: ${orphanLlms.length}`);
for (const l of llms) console.log(`  ${llmOwner.has(l.llm_id) ? "IN USE " : "orphan "} ${l.llm_id}${llmOwner.has(l.llm_id) ? `  <- ${llmOwner.get(l.llm_id)}` : ""}`);

if (!DELETE_AGENTS && !DELETE_LLMS) {
  console.log("\ndry run - nothing deleted (--production --delete-agents / --delete-llms to remove orphans)");
} else {
  for (const a of DELETE_AGENTS ? orphanAgents : []) {
    await deleteAgent(a.agent_id);
    console.log(`deleted agent ${a.agent_id} "${a.agent_name ?? ""}"`);
  }
  for (const l of DELETE_LLMS ? orphanLlms : []) {
    await deleteLlm(l.llm_id);
    console.log(`deleted llm ${l.llm_id}`);
  }
  console.log(`\nagents now: ${(await listAgents()).length}   llms now: ${(await listRetellLlms()).length}`);
}
await prisma.$disconnect();
