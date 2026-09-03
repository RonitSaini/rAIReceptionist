"use client";

import { signOut } from "next-auth/react";

/**
 * The one Log out control, rendered in three places (the desktop rail's footer, the onboarding
 * header, and Settings → Account, which is how a phone reaches it since the rail is hidden below md).
 * One component means the destination cannot drift between them.
 *
 * Logging out lands on the LANDING PAGE, not /login. Choosing to leave is not the same event as being
 * turned away: someone who signs out is done, and the marketing page is the right place to be left —
 * it offers Log in and Get started rather than presenting an empty form as if they had failed at
 * something. Being *sent* to a login screen still means /login, and deliberately so:
 *
 *   - `pages.signIn` / `pages.error` in src/lib/auth.ts — where NextAuth sends an unauthenticated visitor
 *   - `requireSession()` / `requireAccount()` in src/lib/current-account.ts — route protection and an
 *     expired session, which redirect to /login so the visitor can get back to where they were going
 *
 * Neither is touched by this. Account DELETION is a third case again and keeps its own destination
 * (/signup?deleted=1, in account-actions.tsx): the rows are gone, so there is nothing to log back into.
 */
export function SignOutButton({ className }: { className?: string }) {
  return (
    <button type="button" onClick={() => signOut({ callbackUrl: "/" })} className={className ?? "press-soft text-sm font-semibold text-gray-600 hover:text-ink"}>
      Log out
    </button>
  );
}
