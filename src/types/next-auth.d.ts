import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      accountId: string | null;
    };
    /** ISO timestamp of the account's previous sign-in (drives "since you last signed in"). */
    previousSeenAt: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    accountId?: string | null;
    previousSeenAt?: string | null;
  }
}
