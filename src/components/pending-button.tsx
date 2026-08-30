"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps } from "react";

/**
 * Submit button for server-action forms. While the action is pending the label dims (opacity only —
 * the button keeps its width, no spinner, no early checkmark: motion never claims a state the server
 * hasn't confirmed). The success signal is the re-rendered status badge popping (`?changed=` → .badge-pop).
 */
export function PendingButton({ className = "", children, ...props }: ComponentProps<"button">) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending || undefined} className={`transition-opacity ${pending ? "opacity-60" : ""} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}
