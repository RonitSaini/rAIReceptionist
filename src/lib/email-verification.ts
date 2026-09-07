import { prisma } from "./prisma";
import { auth } from "./auth";
import { signState, verifyState } from "./crypto";
import { appUrl } from "./env";
import { sendVerificationEmail } from "./email";

/**
 * Proof that somebody reads the inbox.
 *
 * Sign-up already checks that an address is well-formed and that its domain takes mail; this is the
 * last question - is anyone there - and only a click from the inbox can answer it. A soft gate: the
 * app keeps working behind a banner, because a plumber mid-setup should not be locked out by a slow
 * mail server. The one hard gate is the phone number, which rents money every month and must not
 * be issued to an address nobody reads.
 *
 * Google sign-ins arrive with `emailVerified` already set from Google's own claim and never see any
 * of this. A changed address starts over (changeEmail resets the column and re-sends).
 *
 * The token is a signed, expiring claim - user id plus the address it was sent to - not a row. It
 * is consumed only if the address on it is still the user's address, so a link sent to an old
 * address cannot verify a new one.
 */

export const VERIFICATION_TTL_MS = 48 * 60 * 60_000;
export const RESEND_COOLDOWN_MS = 60_000;

type Claim = { kind: "verify-email"; userId: string; email: string; expiresAt: number };

export function mintVerificationToken(userId: string, email: string, now: number = Date.now()): string {
  return signState({ kind: "verify-email", userId, email: email.toLowerCase(), expiresAt: now + VERIFICATION_TTL_MS } satisfies Claim, VERIFICATION_TTL_MS);
}

/** The claim inside a token, or null for anything tampered, malformed, or past its 48 hours. Pure. */
export function readVerificationToken(token: string | null | undefined, now: number = Date.now()): { userId: string; email: string } | null {
  const claim = verifyState<Partial<Claim>>(token);
  if (!claim || claim.kind !== "verify-email") return null;
  if (typeof claim.userId !== "string" || typeof claim.email !== "string" || typeof claim.expiresAt !== "number") return null;
  if (claim.expiresAt <= now) return null;
  return { userId: claim.userId, email: claim.email };
}

export function verificationUrl(token: string): string {
  return `${appUrl()}/verify-email?token=${encodeURIComponent(token)}`;
}

export type SendOutcome = "sent" | "cooldown" | "verified" | "missing";

/**
 * Send the link. `force` skips the cooldown for the sends the app makes on its own (sign-up, a
 * changed address); the owner's Resend button respects it, so a double click is one email.
 */
export async function sendVerification(userId: string, opts: { force?: boolean } = {}): Promise<SendOutcome> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, emailVerified: true, emailVerificationSentAt: true, account: { select: { businessName: true } } },
  });
  if (!user) return "missing";
  if (user.emailVerified) return "verified";
  if (!opts.force && user.emailVerificationSentAt && Date.now() - user.emailVerificationSentAt.getTime() < RESEND_COOLDOWN_MS) return "cooldown";
  await prisma.user.update({ where: { id: userId }, data: { emailVerificationSentAt: new Date() } });
  await sendVerificationEmail(user.email, user.account?.businessName ?? "", verificationUrl(mintVerificationToken(userId, user.email)));
  return "sent";
}

export type ConfirmOutcome = "verified" | "already" | "invalid" | "stale";

/** Consume a token. The write happens here and only here, from the confirm button, never from a GET. */
export async function confirmVerification(token: string | null | undefined): Promise<ConfirmOutcome> {
  const claim = readVerificationToken(token);
  if (!claim) return "invalid";
  const user = await prisma.user.findUnique({ where: { id: claim.userId }, select: { email: true, emailVerified: true } });
  if (!user) return "invalid";
  // The address changed after this link was sent: the link proves the OLD inbox, not the new one.
  if (user.email.toLowerCase() !== claim.email) return "stale";
  if (user.emailVerified) return "already";
  await prisma.user.update({ where: { id: claim.userId }, data: { emailVerified: new Date() } });
  return "verified";
}

export type VerificationView = { email: string; verified: boolean; sentAt: Date | null };

/** The signed-in user's standing, for the banner and the phone gate. A read. */
export async function currentUserVerification(): Promise<VerificationView | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const u = await prisma.user.findUnique({ where: { id: session.user.id }, select: { email: true, emailVerified: true, emailVerificationSentAt: true } });
  return u ? { email: u.email, verified: !!u.emailVerified, sentAt: u.emailVerificationSentAt } : null;
}
