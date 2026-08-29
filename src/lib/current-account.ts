import { redirect } from "next/navigation";
import type { Account } from "@prisma/client";
import { auth } from "./auth";
import { prisma } from "./prisma";

export type CurrentContext = {
  userId: string;
  account: Account;
  previousSeenAt: Date | null;
};

/** Require a signed-in user. Redirects to /login otherwise. */
export async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session;
}

/**
 * Require a signed-in user who belongs to an Account.
 * Users without an account (e.g. fresh Google sign-in) are sent to onboarding step 1.
 */
export async function requireAccount(): Promise<CurrentContext> {
  const session = await requireSession();
  let accountId = session.user.accountId;

  if (!accountId) {
    // The JWT may be stale right after account creation; check the DB before redirecting.
    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { accountId: true } });
    accountId = user?.accountId ?? null;
    if (!accountId) redirect("/onboarding/1");
  }

  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) redirect("/onboarding/1");

  return {
    userId: session.user.id,
    account,
    previousSeenAt: session.previousSeenAt ? new Date(session.previousSeenAt) : null,
  };
}
