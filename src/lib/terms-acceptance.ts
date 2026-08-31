import type { Prisma, PrismaClient } from "@prisma/client";
import { cookies, headers } from "next/headers";
import { prisma } from "./prisma";
import { signState, verifyState } from "./crypto";
import { TERMS_VERSION } from "@/app/terms/terms-version";

/**
 * Terms-of-service acceptance: the record produced during a dispute.
 *
 * Two shapes of proof live here. The TermsAcceptance row is ours — who, which version, when, from
 * which address — written at signup, and by the re-consent interstitial for accounts that predate
 * a version. The pending cookie exists only for the Google signup path: consent has to be captured
 * BEFORE the browser leaves for Google, so the tick sets a short-lived signed cookie that the
 * NextAuth callback verifies when it creates the user. Every helper that reads request state
 * degrades to "not accepted" when there is no request — absence of proof is never proof.
 */

type Db = PrismaClient | Prisma.TransactionClient;

/** First hop of x-forwarded-for (what Vercel sets), else x-real-ip, else null. Never throws. */
export async function requestIp(): Promise<string | null> {
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    if (fwd) return fwd.split(",")[0].trim().slice(0, 60) || null;
    return h.get("x-real-ip")?.slice(0, 60) ?? null;
  } catch {
    return null;
  }
}

/** Record acceptance of the CURRENT terms version. Idempotent: the first timestamp is the one that
 *  counts in a dispute, so re-accepting the same version changes nothing. */
export async function recordTermsAcceptance(userId: string, ipAddress: string | null, db: Db = prisma): Promise<void> {
  await db.termsAcceptance.upsert({
    where: { userId_termsVersion: { userId, termsVersion: TERMS_VERSION } },
    create: { userId, termsVersion: TERMS_VERSION, ipAddress },
    update: {},
  });
}

export async function hasAcceptedCurrentTerms(userId: string): Promise<boolean> {
  return !!(await prisma.termsAcceptance.findUnique({ where: { userId_termsVersion: { userId, termsVersion: TERMS_VERSION } }, select: { id: true } }));
}

// ---------- The Google signup path: consent captured before the OAuth redirect ----------

const PENDING_COOKIE = "fd_terms_pending";
const PENDING_TTL_MS = 15 * 60_000;

/** Called by the signup form (server action) when the box is ticked, before signIn("google"). */
export async function setPendingTermsCookie(): Promise<void> {
  (await cookies()).set(PENDING_COOKIE, signState({ tv: TERMS_VERSION }, PENDING_TTL_MS), {
    httpOnly: true,
    sameSite: "lax",
    maxAge: PENDING_TTL_MS / 1000,
    path: "/",
  });
}

/** True only when a fresh, validly signed cookie for the CURRENT version is on the request. */
export async function hasPendingTermsCookie(): Promise<boolean> {
  try {
    const raw = (await cookies()).get(PENDING_COOKIE)?.value;
    if (!raw) return false;
    return verifyState<{ tv?: string }>(raw)?.tv === TERMS_VERSION;
  } catch {
    return false; // no request context, no cookie store — never assume consent
  }
}
