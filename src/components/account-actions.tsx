"use client";

import { useActionState, useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { deleteAccount } from "@/actions/account";
import { Alert, Button, Input } from "@/components/ui";
import { SignOutButton } from "@/components/sign-out-button";

/** Log out + Delete account, side by side. Delete opens an inline confirmation that requires typing DELETE. */
export function AccountActions({ businessName }: { businessName: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(deleteAccount, null);

  useEffect(() => {
    // The rows are gone; drop the session and land on sign-up so the same email can start over.
    if (state?.ok) void signOut({ callbackUrl: "/signup?deleted=1" });
  }, [state]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <SignOutButton className="font-semibold text-gray-700 hover:text-ink" />
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="font-semibold text-red-600 hover:text-red-700">
          Delete account
        </button>
      </div>

      {open ? (
        <form action={action} className="rounded-xl border border-red-200 bg-red-50/60 p-4 dark:bg-red-950/20">
          <p className="font-semibold text-red-800 dark:text-red-300">This permanently deletes {businessName}.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-800/90 dark:text-red-200/90">
            <li>Your subscription ends immediately — the rest of any paid month is not refunded — and your phone number is released.</li>
            <li>Every booking, order, call, recording link, message, and setting is erased.</li>
            <li>Your login is removed — to use FrontDesk AI again you&apos;ll need to sign up from scratch.</li>
          </ul>
          <label htmlFor="delete-confirm" className="mt-4 block text-sm font-semibold">
            Type <span className="font-mono">DELETE</span> to confirm
          </label>
          <Input id="delete-confirm" name="confirm" autoComplete="off" autoCapitalize="characters" placeholder="DELETE" className="mt-1 max-w-xs border-red-300 focus:border-red-500 focus:ring-red-200" required />
          {state && !state.ok && state.error ? (
            <div className="mt-3">
              <Alert>{state.error}</Alert>
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button type="submit" variant="danger" disabled={pending || state?.ok === true}>
              {pending ? "Deleting…" : state?.ok ? "Deleted — signing out…" : "Delete my account permanently"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Keep my account
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
