import type { Prisma, PrismaClient } from "@prisma/client";
import { headers } from "next/headers";
import { prisma } from "./prisma";
import { TERMS_VERSION } from "@/app/terms/terms-version";

/**
 * Terms-of-service acceptance: the record produced during a dispute.
 *
 * One shape of proof: the TermsAcceptance row — who, which version, when, from which address —
 * written wherever someone actually ticks the box, which is sign-up, onboarding step 1, and the
 * re-consent interstitial for accounts that predate a version. Every helper that reads request
 * state degrades to "not accepted" when there is no request — absence of proof is never proof.
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

/*
 * There is deliberately no "consent captured before the OAuth redirect" cookie any more.
 *
 * It existed so the signup form's checkbox could stand in for the Google path, and it made the
 * Google sign-up ask at the wrong moment (before the person had even chosen an account) while a
 * leftover cookie from an abandoned attempt could silently consent a later one. Consent for that
 * path is now taken where the account is created, on onboarding step 1, from a box the person
 * actually ticks.
 */
