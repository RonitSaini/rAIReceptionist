import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * A throwaway user + account on the dev database, for the server-backed tests. Each test creates
 * its own and removes it again, so the suite depends on no seeded fixture: on 2026-09-08 every
 * account on vertical-dev other than the owner's was deleted, which is when the two tests that
 * had leaned on demo@callcover.app and plumbing-test@frontdesk.test moved here.
 *
 * Reads DATABASE_URL from .env.local / .env itself and opens its own PrismaClient, so a fake
 * DATABASE_URL another test file sets for the shared singleton cannot point this at nowhere.
 */

const here = dirname(fileURLToPath(import.meta.url));
export const env = {};
for (const f of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(resolve(here, "..", f), "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?\s*$/);
      if (m && !(m[1] in env)) env[m[1]] = m[2].trim();
    }
  } catch {}
}

export const FIXTURE_PASSWORD = "fixture-password-2026";

/** Creates the rows; returns them with a `remove()` that deletes the user, then the account (which cascades). */
export async function createFixture({ vertical = "plumbing", businessName = "Fixture Plumbing", unreadNotifications = 0, twilioNumber = null } = {}) {
  const { PrismaClient } = await import("@prisma/client");
  const { hashPassword } = await import("@/lib/password");
  const { recordTermsAcceptance } = await import("@/lib/terms-acceptance");
  const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  const email = `fixture-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@frontdesk.test`;
  const account = await prisma.account.create({ data: { businessName, vertical, onboardingStepId: "done", ownerName: "Fixture Owner", twilioNumber } });
  const user = await prisma.user.create({ data: { email, name: "Fixture Owner", passwordHash: await hashPassword(FIXTURE_PASSWORD), emailVerified: new Date(), accountId: account.id } });
  await recordTermsAcceptance(user.id, null, prisma);
  for (let i = 0; i < unreadNotifications; i++) {
    await prisma.notification.create({ data: { accountId: account.id, type: "system", priority: "normal", title: `Fixture notification ${i + 1}`, body: "Seeded unread by tests/dev-fixture.mjs" } });
  }
  return {
    prisma,
    account,
    user,
    email,
    password: FIXTURE_PASSWORD,
    async remove() {
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
      await prisma.account.delete({ where: { id: account.id } }).catch(() => {});
      await prisma.$disconnect();
    },
  };
}
