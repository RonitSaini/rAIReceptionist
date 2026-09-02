"use client";

import { signOut } from "next-auth/react";

export function SignOutButton({ className }: { className?: string }) {
  return (
    <button type="button" onClick={() => signOut({ callbackUrl: "/login" })} className={className ?? "press-soft text-sm font-semibold text-gray-600 hover:text-ink"}>
      Log out
    </button>
  );
}
