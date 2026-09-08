"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { cookies, headers } from "next/headers";
import { appUrl } from "@/lib/env";
import { postCredentials, safeCallbackPath } from "@/lib/login-post";
import { prisma } from "@/lib/prisma";
import { sendReferralEmail, sendWelcomeEmail } from "@/lib/email";
import { hashPassword, verifyPassword } from "@/lib/password";
import { auth } from "@/lib/auth";
import { generateGreeting } from "@/lib/greeting";
import { isEmail, str, type ActionState } from "@/lib/form";
import { checkEmailDomain } from "@/lib/email-address";
import { isVerticalAvailable, vocabularyFor } from "@/verticals";
import type { Vertical } from "@prisma/client";
import { DEFAULT_CLOSE, DEFAULT_OPEN } from "@/lib/availability";
import { hasAcceptedCurrentTerms, recordTermsAcceptance, requestIp } from "@/lib/terms-acceptance";
import { checkReferralCodeAvailable, claimReferralCodeQuietly, issueReferralCode } from "@/lib/referrals";
import { confirmVerification, sendVerification } from "@/lib/email-verification";

/** Server-side gate, not UI decoration: a hand-crafted POST without the checkbox lands here too. */
const TERMS_ERROR = "Please accept the Terms of Service and Privacy Policy to create your account.";
const acceptedTerms = (formData: FormData) => formData.get("acceptTerms") === "on";

/** Default weekly hours created with every new account (editable in step 3 / Settings). */
function defaultHours(accountId: string) {
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    accountId,
    dayOfWeek,
    periodName: "Service Hours",
    open: DEFAULT_OPEN,
    close: DEFAULT_CLOSE,
    isClosed: false,
    sortOrder: 0,
  }));
}

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * The profession picked at sign-up. Only professions with a working definition are accepted —
 * the picker disables the rest, and a forged value must not create an account the app cannot serve.
 */
function readVertical(formData: FormData): Vertical | null {
  const slug = str(formData, "vertical");
  return isVerticalAvailable(slug) ? slug : null;
}

/** "Enter your restaurant name." for a restaurant, "Enter your business name." for a plumber. */
function businessNameError(vertical: Vertical): string {
  return `Enter your ${vocabularyFor(vertical).business.one} name.`;
}

async function createAccountWithDefaults(businessName: string, vertical: Vertical, tx: TxClient) {
  const account = await tx.account.create({
    // The referral code is issued here and nowhere else: reads never write (AGENTS.md), so no page
    // render can mint one lazily, and an account without a code would have nothing to share.
    data: { businessName, vertical, greeting: generateGreeting(businessName, "Alex"), hostName: "Alex", onboardingStepId: "business-basics", referralCode: await issueReferralCode(tx) },
  });
  await tx.businessHours.createMany({ data: defaultHours(account.id) });
  await tx.notification.create({
    data: {
      accountId: account.id,
      type: "system",
      title: `Welcome to FrontDesk AI, ${businessName}!`,
      body: "Finish setup to get your phone number and start taking calls. You can change any setting later.",
    },
  });
  return account;
}

/**
 * Raised when a concurrent request already linked an account to this user. Thrown inside the
 * transaction so the account we just created is rolled back rather than left orphaned.
 */
class AccountAlreadyLinked extends Error {}

/**
 * Attach a freshly created account to a user, but only if they still have none.
 *
 * This is the guard against double-submits and action retries. The naive version — read
 * `user.accountId`, then create, then update — is check-then-act: two concurrent requests both
 * see null, both create a restaurant, and the second update wins. The first account is then
 * orphaned: no user can reach it, and it silently accrues number and campaign charges forever.
 *
 * `updateMany` with `accountId: null` in the WHERE makes the check and the write one atomic
 * statement. A loser matches zero rows and throws, rolling back its own account.
 */
async function linkAccountToUser(tx: TxClient, userId: string, accountId: string, extra: { passwordHash?: string } = {}) {
  const linked = await tx.user.updateMany({
    where: { id: userId, accountId: null },
    data: { accountId, ...extra },
  });
  if (linked.count === 0) throw new AccountAlreadyLinked();
}

/** Step 1 (email/password): create User + Account. The client then signs in with the same credentials. */
export async function signUp(_prev: ActionState, formData: FormData): Promise<ActionState> {
  // First gate, before anything is looked up or created: no acceptance, no account.
  if (!acceptedTerms(formData)) return { ok: false, error: TERMS_ERROR };

  const email = str(formData, "email").toLowerCase();
  const password = formData.get("password");
  const businessName = str(formData, "businessName");
  const vertical = readVertical(formData);

  if (!isEmail(email)) return { ok: false, error: "Enter a valid email address." };
  if (typeof password !== "string" || password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
  if (!vertical) return { ok: false, error: "Choose what kind of business this is." };
  if (businessName.length < 2) return { ok: false, error: businessNameError(vertical) };

  // Any existing user — password OR Google — makes the email taken. The Google case is the one
  // that matters: sign-up does no email verification, so quietly setting the submitted password
  // on an existing Google user (what this once did) would let anyone who knows the address log
  // in to that account. A Google user signs in with Google; the form must never touch their row.
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return { ok: false, error: "An account with that email already exists. Try logging in." };

  // Only now that the address is well-formed and unclaimed: does its domain take mail at all? This
  // is the one check on the path that costs a DNS round trip, so it sits behind the two that can
  // answer without one — and in front of everything that creates something.
  const deliverable = await checkEmailDomain(email);
  if (!deliverable.ok) return { ok: false, error: deliverable.error };

  // Checked before anything is created: see checkReferralCodeAvailable for why it cannot wait.
  const referral = await checkReferralCodeAvailable(str(formData, "ref"));
  if (!referral.ok) return { ok: false, error: referral.error };

  const passwordHash = await hashPassword(password);
  const ip = await requestIp();

  let accountId: string;
  let userId: string;
  try {
    ({ accountId, userId } = await prisma.$transaction(async (tx) => {
      const account = await createAccountWithDefaults(businessName, vertical, tx);
      // The unique index on email is what makes this safe under concurrency: a second
      // request with the same address fails here and rolls its account back.
      const user = await tx.user.create({ data: { email, passwordHash, accountId: account.id } });
      await recordTermsAcceptance(user.id, ip, tx);
      return { accountId: account.id, userId: user.id };
    }));
  } catch (e) {
    if (typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002") {
      return { ok: false, error: "An account with that email already exists. Try logging in." };
    }
    throw e;
  }

  // Before the response, not after it: the discount has to be on the plan card by the time they
  // reach the payment step, and this is two queries against a row we just wrote.
  if (referral.code) await claimReferralCodeQuietly(accountId, referral.code);

  // After the response, so a slow email API never stretches the sign-up; a failure only logs.
  // The verification link goes first: it is the one of the three the owner has to act on.
  after(async () => {
    await sendVerification(userId, { force: true }).catch((e) => console.error("[email] verification failed", e));
    await sendWelcomeEmail(email, businessName, vertical).catch((e) => console.error("[email] welcome failed", e));
    await sendReferralFollowUp(accountId, email, businessName);
  });
  return { ok: true };
}

/** The Resend button on the verify-your-email banner. Respects the one-minute cooldown. */
export async function resendVerificationEmail(): Promise<ActionState> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Please log in again." };
  const outcome = await sendVerification(session.user.id);
  if (outcome === "sent") return { ok: true, message: "Sent - check your inbox." };
  if (outcome === "cooldown") return { ok: false, error: "We sent one less than a minute ago - give it a moment, and check spam." };
  if (outcome === "verified") return { ok: true, message: "Your email is already verified." };
  return { ok: false, error: "Please log in again." };
}

/**
 * The confirm button on /verify-email. Plain form action: the page reads the token and this is
 * the write. Redirects back to the page with the outcome, then the owner continues from there.
 */
export async function confirmEmailVerification(formData: FormData): Promise<void> {
  const outcome = await confirmVerification(str(formData, "token"));
  redirect(`/verify-email?result=${outcome}`);
}

/** This request's own origin, so the login loopback reaches the deployment that is serving it (dev port included). */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : appUrl();
}

/**
 * The password login, as a POST that works before React has attached (src/lib/login-post.ts for
 * why). NextAuth's credentials callback does the checking and issues the session cookie; this
 * relays that cookie onto the response and sends the owner where they were going. A refusal comes
 * back as the form's error line, never as a page with the credentials in its URL.
 */
export async function logIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = str(formData, "email").toLowerCase();
  const password = formData.get("password");
  const redirectTo = safeCallbackPath(str(formData, "callbackUrl"));
  if (!isEmail(email) || typeof password !== "string" || !password) return { ok: false, error: "Wrong email or password." };

  const result = await postCredentials(await requestOrigin(), { email, password, callbackUrl: redirectTo });
  if (!result.ok) return { ok: false, error: result.status === 401 ? "Wrong email or password." : "Something went wrong signing in. Please try again." };

  const { session } = result;
  (await cookies()).set(session.name, session.value, {
    path: session.path ?? "/",
    httpOnly: session.httpOnly,
    secure: session.secure,
    sameSite: session.sameSite ?? "lax",
    ...(session.expires ? { expires: session.expires } : {}),
    ...(session.maxAge !== undefined ? { maxAge: session.maxAge } : {}),
  });
  redirect(redirectTo);
}

/**
 * Schedule the referral follow-up 20 minutes behind the welcome. The code was issued inside the
 * sign-up transaction, so reading it back here always finds one; scheduling happens on Resend's
 * side, so no process of ours needs to be alive in 20 minutes. Resend's id for the scheduled send
 * is kept on the account, so deleting the account inside those 20 minutes cancels it (2026-09-08).
 */
async function sendReferralFollowUp(accountId: string, email: string, businessName: string): Promise<void> {
  try {
    const account = await prisma.account.findUnique({ where: { id: accountId }, select: { referralCode: true } });
    if (!account?.referralCode) return;
    const referralEmailId = await sendReferralEmail(email, businessName, account.referralCode);
    if (referralEmailId) await prisma.account.update({ where: { id: accountId }, data: { referralEmailId } });
  } catch (e) {
    console.error("[email] referral follow-up failed", e);
  }
}

/** Step 1 for signed-in users without an account (e.g. first Google sign-in). */
export async function createAccountForCurrentUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Please log in again." };

  // Acceptance either already on file (recorded by the Google sign-up callback) or ticked on this
  // form — a Google-only user from before this version reaches here with neither, and is refused.
  const accepted = acceptedTerms(formData) || (await hasAcceptedCurrentTerms(session.user.id));
  if (!accepted) return { ok: false, error: TERMS_ERROR };

  const businessName = str(formData, "businessName");
  const vertical = readVertical(formData);
  if (!vertical) return { ok: false, error: "Choose what kind of business this is." };
  if (businessName.length < 2) return { ok: false, error: businessNameError(vertical) };

  const referral = await checkReferralCodeAvailable(str(formData, "ref"));
  if (!referral.ok) return { ok: false, error: referral.error };

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return { ok: false, error: "Please log in again." };
  await recordTermsAcceptance(user.id, await requestIp());
  if (user.accountId) return { ok: true };

  let accountId: string;
  try {
    accountId = await prisma.$transaction(async (tx) => {
      const account = await createAccountWithDefaults(businessName, vertical, tx);
      await linkAccountToUser(tx, user.id, account.id);
      return account.id;
    });
  } catch (e) {
    // A concurrent submit already created and linked one. Its account stands; ours rolled
    // back. Nothing to report — the user has an account either way (and its welcome email).
    if (!(e instanceof AccountAlreadyLinked)) throw e;
    return { ok: true };
  }

  if (referral.code) await claimReferralCodeQuietly(accountId, referral.code);

  after(async () => {
    await sendWelcomeEmail(user.email, businessName, vertical).catch((e) => console.error("[email] welcome failed", e));
    await sendReferralFollowUp(accountId, user.email, businessName);
  });
  return { ok: true };
}

/**
 * The re-consent interstitial for accounts that predate the current terms version. Plain form
 * action: the checkbox is required client-side, and an unticked hand-crafted POST just re-renders
 * the interstitial — which is already the blocked state.
 */
export async function acceptCurrentTerms(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!acceptedTerms(formData)) redirect("/accept-terms?error=1");
  await recordTermsAcceptance(session.user.id, await requestIp());
  redirect("/dashboard");
}

// ---------- Account credentials (Settings -> Account) ----------

/**
 * The signed-in user, provided their login is credential-based. Google-only users manage their
 * email and password with Google; these actions must never touch their row (see signUp for the
 * takeover shape that guards against).
 */
async function credentialUser(): Promise<{ ok: true; user: { id: string; email: string; passwordHash: string } } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Please log in again." };
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, email: true, passwordHash: true } });
  if (!user) return { ok: false, error: "Please log in again." };
  if (!user.passwordHash) return { ok: false, error: "You sign in with Google, so your email and password are managed there." };
  return { ok: true, user: { id: user.id, email: user.email, passwordHash: user.passwordHash } };
}

export async function changeEmail(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const r = await credentialUser();
  if (!r.ok) return { ok: false, error: r.error };

  const email = str(formData, "email").toLowerCase();
  const current = formData.get("currentPassword");
  if (!isEmail(email)) return { ok: false, error: "Enter a valid email address." };
  if (typeof current !== "string" || !(await verifyPassword(current, r.user.passwordHash))) {
    return { ok: false, error: "Current password is incorrect." };
  }
  if (email === r.user.email) return { ok: true, message: "That is already your email." };

  // Same bar as sign-up: an account is not allowed to move itself to an address we cannot reach.
  // Behind the password check by design, so this action is never an open DNS lookup for a stranger.
  const deliverable = await checkEmailDomain(email);
  if (!deliverable.ok) return { ok: false, error: deliverable.error };

  try {
    // Verification starts over for the new address: the old inbox's click proves nothing about this one.
    await prisma.user.update({ where: { id: r.user.id }, data: { email, emailVerified: null } });
  } catch (e) {
    if (typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002") {
      return { ok: false, error: "Another account already uses that email." };
    }
    throw e;
  }
  after(() => sendVerification(r.user.id, { force: true }).catch((e) => console.error("[email] verification failed", e)));
  return { ok: true, message: "Email updated. We sent a verification link to the new address - use it the next time you log in." };
}

export async function changePassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const r = await credentialUser();
  if (!r.ok) return { ok: false, error: r.error };

  const current = formData.get("currentPassword");
  const next = formData.get("newPassword");
  const confirm = formData.get("confirmPassword");
  if (typeof current !== "string" || !(await verifyPassword(current, r.user.passwordHash))) {
    return { ok: false, error: "Current password is incorrect." };
  }
  if (typeof next !== "string" || next.length < 8) return { ok: false, error: "The new password must be at least 8 characters." };
  if (next !== confirm) return { ok: false, error: "The new passwords don't match." };

  await prisma.user.update({ where: { id: r.user.id }, data: { passwordHash: await hashPassword(next) } });
  return { ok: true, message: "Password updated." };
}
