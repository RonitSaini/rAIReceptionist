"use client";

import { startTransition, type ComponentProps } from "react";

type SubmitHandlerEvent = Parameters<NonNullable<ComponentProps<"form">["onSubmit"]>>[0];

/**
 * A <form> for server actions that STAYS on the page after saving (Settings tabs).
 *
 * React 19 calls form.reset() after a function action succeeds. That snaps every field back to the
 * DOM's original defaults — and React never updates a <select>'s default selection on re-render — so the
 * page showed the pre-save values until a refresh even though the save went through. Submitting through
 * onSubmit + startTransition runs the same action (pending state and useActionState result included)
 * without the reset. The `action` attribute stays for no-JS submissions.
 */
export function ActionForm({ action, onSubmit, ...props }: Omit<ComponentProps<"form">, "action"> & { action: (formData: FormData) => void | Promise<void> }) {
  function handleSubmit(e: SubmitHandlerEvent) {
    onSubmit?.(e);
    if (e.defaultPrevented) return;
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const fd = new FormData(e.currentTarget, submitter ?? undefined);
    startTransition(() => {
      void action(fd);
    });
  }
  return <form action={action} onSubmit={handleSubmit} {...props} />;
}
