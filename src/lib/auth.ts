import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "./prisma";
import { verifyPassword } from "./password";

export const googleEnabled = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

const providers: NextAuthOptions["providers"] = [
  CredentialsProvider({
    name: "Email and password",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const email = credentials?.email?.trim().toLowerCase();
      const password = credentials?.password ?? "";
      if (!email || !password) return null;
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !(await verifyPassword(password, user.passwordHash))) return null;
      return { id: user.id, email: user.email, name: user.name };
    },
  }),
];

if (googleEnabled) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  );
}

export const authOptions: NextAuthOptions = {
  providers,
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async signIn({ user, account, profile }) {
      // Google: find-or-create the user by email. No adapter tables needed.
      if (account?.provider === "google") {
        const email = user.email?.toLowerCase();
        if (!email) return false;
        const googleId = account.providerAccountId;
        const emailVerified = (profile as { email_verified?: boolean } | undefined)?.email_verified ? new Date() : null;
        await prisma.user.upsert({
          where: { email },
          update: { googleId, name: user.name ?? undefined, image: user.image ?? undefined, ...(emailVerified ? { emailVerified } : {}) },
          create: { email, googleId, name: user.name ?? null, image: user.image ?? null, emailVerified },
        });
      }
      return true;
    },
    async jwt({ token, user, trigger }) {
      const email = (user?.email ?? token.email)?.toLowerCase();
      const isSignIn = !!user;

      // On sign-in, or when the account link is missing/stale, refresh from the DB.
      if (email && (isSignIn || !token.accountId || trigger === "update")) {
        const dbUser = await prisma.user.findUnique({
          where: { email },
          select: { id: true, accountId: true, name: true, account: { select: { lastSeenAt: true } } },
        });
        if (dbUser) {
          token.userId = dbUser.id;
          token.accountId = dbUser.accountId;
          token.name = dbUser.name ?? token.name;

          if (isSignIn && dbUser.accountId) {
            // Remember when this account was last seen *before* this sign-in, then stamp the new sign-in.
            token.previousSeenAt = dbUser.account?.lastSeenAt?.toISOString() ?? null;
            await prisma.account.update({ where: { id: dbUser.accountId }, data: { lastSeenAt: new Date() } });
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        ...session.user,
        id: (token.userId as string | undefined) ?? "",
        accountId: (token.accountId as string | null | undefined) ?? null,
      };
      session.previousSeenAt = (token.previousSeenAt as string | null | undefined) ?? null;
      return session;
    },
  },
};

export function auth() {
  return getServerSession(authOptions);
}
