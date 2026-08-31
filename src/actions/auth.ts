"use server";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { auth } from "@/lib/auth";
import { generateGreeting } from "@/lib/greeting";
import { isEmail, str, type ActionState } from "@/lib/form";
import { isVerticalAvailable, vocabularyFor } from "@/verticals";
import type { Vertical } from "@prisma/client";
import { DEFAULT_CLOSE, DEFAULT_OPEN } from "@/lib/availability";

/** Default weekly hours created with every new account (editable in step 3 / Settings). */
function defaultHours(accountId: string) {
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    accountId,
    dayOfWeek,
    periodName: "All day",
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

async function createAccountWithDefaults(restaurantName: string, vertical: Vertical, tx: TxClient) {
  const account = await tx.account.create({
    data: { restaurantName, vertical, greeting: generateGreeting(restaurantName, "Alex"), hostName: "Alex", onboardingStep: 2 },
  });
  await tx.businessHours.createMany({ data: defaultHours(account.id) });
  await tx.notification.create({
    data: {
      accountId: account.id,
      type: "system",
      title: `Welcome to FrontDesk AI, ${restaurantName}!`,
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
  const email = str(formData, "email").toLowerCase();
  const password = formData.get("password");
  const restaurantName = str(formData, "restaurantName");
  const vertical = readVertical(formData);

  if (!isEmail(email)) return { ok: false, error: "Enter a valid email address." };
  if (typeof password !== "string" || password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
  if (!vertical) return { ok: false, error: "Choose what kind of business this is." };
  if (restaurantName.length < 2) return { ok: false, error: businessNameError(vertical) };

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing?.passwordHash) return { ok: false, error: "An account with that email already exists. Try logging in." };

  const passwordHash = await hashPassword(password);

  try {
    await prisma.$transaction(async (tx) => {
      if (existing) {
        // Google-only user setting a password.
        if (existing.accountId) {
          await tx.user.update({ where: { id: existing.id }, data: { passwordHash } });
        } else {
          // Attach an account only if they still have none — see linkAccountToUser.
          const account = await createAccountWithDefaults(restaurantName, vertical, tx);
          await linkAccountToUser(tx, existing.id, account.id, { passwordHash });
        }
      } else {
        const account = await createAccountWithDefaults(restaurantName, vertical, tx);
        // The unique index on email is what makes this safe under concurrency: a second
        // request with the same address fails here and rolls its account back.
        await tx.user.create({ data: { email, passwordHash, accountId: account.id } });
      }
    });
  } catch (e) {
    // Both races end the same way: someone else got there first, and this request's account
    // was rolled back. The user already has what they asked for, so report success.
    if (e instanceof AccountAlreadyLinked) return { ok: true };
    if (typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002") {
      return { ok: false, error: "An account with that email already exists. Try logging in." };
    }
    throw e;
  }

  return { ok: true };
}

/** Step 1 for signed-in users without an account (e.g. first Google sign-in). */
export async function createAccountForCurrentUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Please log in again." };
  const restaurantName = str(formData, "restaurantName");
  const vertical = readVertical(formData);
  if (!vertical) return { ok: false, error: "Choose what kind of business this is." };
  if (restaurantName.length < 2) return { ok: false, error: businessNameError(vertical) };

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return { ok: false, error: "Please log in again." };
  if (user.accountId) return { ok: true };

  try {
    await prisma.$transaction(async (tx) => {
      const account = await createAccountWithDefaults(restaurantName, vertical, tx);
      await linkAccountToUser(tx, user.id, account.id);
    });
  } catch (e) {
    // A concurrent submit already created and linked one. Its account stands; ours rolled
    // back. Nothing to report — the user has an account either way.
    if (!(e instanceof AccountAlreadyLinked)) throw e;
  }
  return { ok: true };
}
