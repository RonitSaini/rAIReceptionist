"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui";

export function GoogleButton({
  callbackUrl,
  label,
  disabled = false,
  beforeSignIn,
}: {
  callbackUrl: string;
  label: string;
  disabled?: boolean;
  /** Runs before the browser leaves for Google — the signup page captures terms consent here. */
  beforeSignIn?: () => Promise<unknown>;
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="lg"
      full
      disabled={disabled}
      onClick={async () => {
        if (beforeSignIn) await beforeSignIn();
        await signIn("google", { callbackUrl });
      }}
    >
      <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.5l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z" />
        <path fill="#FBBC05" d="M10.5 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.9-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.7l7.9-6.1z" />
        <path fill="#34A853" d="M24 48c6.3 0 11.7-2.1 15.6-5.7l-7.7-6c-2.1 1.4-4.8 2.3-7.9 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
      </svg>
      {label}
    </Button>
  );
}
