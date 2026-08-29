"use server";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { auth } from "@/lib/auth";
import { generateGreeting } from "@/lib/greeting";
import { isEmail, str, type ActionState } from "@/lib/form";
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

async function createAccountWithDefaults(restaurantName: string, tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) {
  const account = await tx.account.create({
    data: { restaurantName, greeting: generateGreeting(restaurantName, "Alex"), hostName: "Alex", onboardingStep: 2 },
  });
  await tx.businessHours.createMany({ data: defaultHours(account.id) });
  await tx.notification.create({
    data: {
      accountId: account.id,
      type: "system",
      title: `Welcome to CallCover, ${restaurantName}!`,
      body: "Finish setup to get your phone number and start taking calls. You can change any setting later.",
    },
  });
  return account;
}

/** Step 1 (email/password): create User + Account. The client then signs in with the same credentials. */
export async function signUp(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = str(formData, "email").toLowerCase();
  const password = formData.get("password");
  const restaurantName = str(formData, "restaurantName");

  if (!isEmail(email)) return { ok: false, error: "Enter a valid email address." };
  if (typeof password !== "string" || password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
  if (restaurantName.length < 2) return { ok: false, error: "Enter your restaurant name." };

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing?.passwordHash) return { ok: false, error: "An account with that email already exists. Try logging in." };

  const passwordHash = await hashPassword(password);

  await prisma.$transaction(async (tx) => {
    if (existing) {
      // Google-only user setting a password; attach an account if they have none.
      const accountId = existing.accountId ?? (await createAccountWithDefaults(restaurantName, tx)).id;
      await tx.user.update({ where: { id: existing.id }, data: { passwordHash, accountId } });
    } else {
      const account = await createAccountWithDefaults(restaurantName, tx);
      await tx.user.create({ data: { email, passwordHash, accountId: account.id } });
    }
  });

  return { ok: true };
}

/** Step 1 for signed-in users without an account (e.g. first Google sign-in). */
export async function createAccountForCurrentUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Please log in again." };
  const restaurantName = str(formData, "restaurantName");
  if (restaurantName.length < 2) return { ok: false, error: "Enter your restaurant name." };

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return { ok: false, error: "Please log in again." };
  if (user.accountId) return { ok: true };

  await prisma.$transaction(async (tx) => {
    const account = await createAccountWithDefaults(restaurantName, tx);
    await tx.user.update({ where: { id: user.id }, data: { accountId: account.id } });
  });
  return { ok: true };
}
