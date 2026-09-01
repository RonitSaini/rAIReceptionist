"use client";

import { useActionState } from "react";
import { changeEmail, changePassword } from "@/actions/auth";
import { Alert, Button, Field, Input } from "@/components/ui";
import { ActionForm } from "@/components/action-form";

/**
 * Change-email and change-password forms for credential logins (Settings -> Account).
 *
 * Both re-ask for the current password: a settings page left open on a shared machine must not be
 * enough to take the login over. Google-only users never see these — their email and password
 * live with Google, and the server actions refuse them independently of what renders.
 */

export function ChangeEmailForm() {
  const [state, action, pending] = useActionState(changeEmail, null);

  return (
    <ActionForm action={action} className="space-y-3">
      {state ? <Alert kind={state.ok ? "success" : "error"}>{state.ok ? state.message : state.error}</Alert> : null}
      <Field label="New email" htmlFor="account-email">
        <Input id="account-email" name="email" type="email" autoComplete="email" placeholder="New email..." required />
      </Field>
      <Field label="Current password" htmlFor="account-email-password" hint="Needed to confirm it's you.">
        <Input id="account-email-password" name="currentPassword" type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Change email"}
      </Button>
    </ActionForm>
  );
}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePassword, null);

  return (
    <ActionForm action={action} className="space-y-3">
      {state ? <Alert kind={state.ok ? "success" : "error"}>{state.ok ? state.message : state.error}</Alert> : null}
      <Field label="Current password" htmlFor="account-current-password">
        <Input id="account-current-password" name="currentPassword" type="password" autoComplete="current-password" required />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="New password" htmlFor="account-new-password" hint="At least 8 characters.">
          <Input id="account-new-password" name="newPassword" type="password" autoComplete="new-password" minLength={8} required />
        </Field>
        <Field label="Repeat new password" htmlFor="account-confirm-password">
          <Input id="account-confirm-password" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required />
        </Field>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Change password"}
      </Button>
    </ActionForm>
  );
}
