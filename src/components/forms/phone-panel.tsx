"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { completePhoneStep } from "@/actions/onboarding";
import { placeTestCall, provisionPhoneNumber, repairNumberWebhooks, syncAgentNow } from "@/actions/phone";
import type { AccountView } from "@/lib/serialize";
import { DrawIcon } from "@/components/draw-icon";
import type { ActionState } from "@/lib/form";
import { formatUsPhone } from "@/lib/form";
import { Alert, Badge, Button, Card, Field, Input } from "@/components/ui";
import type { FormMode } from "@/components/form-footer";
import { vocabularyFor } from "@/verticals";
import { WebTestCall } from "@/components/web-test-call";
import { ActionForm } from "@/components/action-form";

type Status = { twilio: boolean; retell: boolean; publicUrl: boolean; subscribed: boolean; appUrl: string; lastSynced: string | null };

export function PhonePanel({ account, mode, status }: { account: AccountView; mode: FormMode; status: Status }) {
  const [provisionState, provisionAction, provisioning] = useActionState(provisionPhoneNumber, null);
  const [result, setResult] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();
  const ready = status.twilio && status.retell && status.publicUrl;
  const canConnect = ready && status.subscribed;
  const hasNumber = !!account.twilioNumber;
  const areaCodeDefault = account.cellPhone?.replace(/\D/g, "").replace(/^1/, "").slice(0, 3) ?? "";

  const run = (fn: () => Promise<ActionState>) => startTransition(async () => setResult(await fn()));

  return (
    <div className="space-y-4">
      {!ready ? (
        <Alert kind="info">
          <p className="font-semibold">Phone system not connected yet</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {!status.twilio ? <li>Add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN</li> : null}
            {!status.retell ? <li>Add RETELL_API_KEY</li> : null}
            {!status.publicUrl ? (
              <li>
                NEXT_PUBLIC_APP_URL must be a public https URL (currently <span className="font-mono">{status.appUrl}</span>). Use your Vercel URL, or an ngrok tunnel for local testing.
              </li>
            ) : null}
          </ul>
          <p className="mt-1">You can skip this step and come back in Settings → Phone.</p>
        </Alert>
      ) : null}

      <Card title="Your FrontDesk AI number">
        {hasNumber ? (
          <>
            <p className="text-3xl font-black tracking-tight text-brand-700">{formatUsPhone(account.twilioNumber)}</p>
            <p className="mt-1 text-sm text-gray-500">Calls to this number are answered by {account.hostName}.</p>
          </>
        ) : (
          <ActionForm action={provisionAction} className="space-y-3">
            <p className="text-3xl font-black tracking-tight text-gray-300">(___) ___-____</p>
            <Field label="Preferred area code" htmlFor="areaCode" hint="We'll pick a local number here if one's available.">
              <Input id="areaCode" name="areaCode" inputMode="numeric" maxLength={3} defaultValue={areaCodeDefault} placeholder="212" className="max-w-32" />
            </Field>
            {!status.subscribed ? (
              <Alert kind="info">
                <p className="font-semibold">Your number is issued once your subscription is active.</p>
                <p className="mt-1">
                  {mode === "onboarding" ? "Finish the payment step next, then come back to Settings → Phone to connect your number." : "Subscribe under Billing and this button unlocks right away."}
                </p>
                <Link href={mode === "onboarding" ? "/onboarding/8" : "/settings?tab=billing"} className="mt-2 inline-block font-semibold text-brand-700">
                  {mode === "onboarding" ? "Go to payment →" : "Open Billing →"}
                </Link>
              </Alert>
            ) : null}
            {provisionState && !provisionState.ok && provisionState.error ? <Alert>{provisionState.error}</Alert> : null}
            {provisionState?.ok && provisionState.message ? <Alert kind="success">{provisionState.message}</Alert> : null}
            <Button type="submit" size="lg" full disabled={!canConnect || provisioning} title={status.subscribed ? undefined : "Requires an active subscription"}>
              {provisioning ? "Setting up your number and AI host…" : status.subscribed ? "Get my number" : "Subscribe to get a number"}
            </Button>
          </ActionForm>
        )}
      </Card>

      <Card title="AI host status">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {account.retellAgentId ? <Badge tone="green">Agent ready</Badge> : <Badge tone="gray">Not created yet</Badge>}
          {/* Formatted on the server in the restaurant's time zone — a client-side toLocaleString() differs from the SSR text and breaks hydration. */}
          {status.lastSynced ? <span className="text-gray-500">Last updated {status.lastSynced}</span> : null}
        </div>
        {account.agentSyncError ? <Alert>Last sync failed: {account.agentSyncError}</Alert> : null}
        <p className="mt-2 text-sm text-gray-500">The AI host is rebuilt automatically whenever you save settings. Rebuild manually if something looks out of date.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" disabled={!status.retell || pending} onClick={() => run(syncAgentNow)}>
            Rebuild AI host
          </Button>
          {hasNumber ? (
            <Button type="button" variant="secondary" size="sm" disabled={!status.twilio || pending} onClick={() => run(repairNumberWebhooks)}>
              Re-link number to this app URL
            </Button>
          ) : null}
        </div>
      </Card>

      <Card title="Forward your existing line">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-gray-700">
          <li>Keep your existing business number. Callers dial it as usual.</li>
          <li>
            Forward it to {hasNumber ? <strong>{formatUsPhone(account.twilioNumber)}</strong> : "your FrontDesk AI number"}. On most carriers: dial <span className="font-mono">*72</span> then the number to turn forwarding on, and <span className="font-mono">*73</span> to turn it off.
          </li>
          <li>Prefer to answer yourself when you can? Ask your carrier for &ldquo;forward when busy / no answer&rdquo; instead of unconditional forwarding.</li>
          <li>Everything the AI does shows up in this app — check the bell.</li>
        </ol>
      </Card>

      <Card title="Test it">
        {status.retell ? (
          <div className="mb-4">
            <WebTestCall hostName={account.hostName} compact />
          </div>
        ) : null}
        <p className="text-sm text-gray-500">
          We&apos;ll call {account.cellPhone ? formatUsPhone(account.cellPhone) : "your cell (add it in Business basics)"} from your FrontDesk AI number so you can hear the greeting and try booking{" "}
          {`${/^[aeiou]/i.test(vocabularyFor(account).booking.one) ? "an" : "a"} ${vocabularyFor(account).booking.one}`}.
        </p>
        <Button type="button" variant="secondary" className="mt-3" disabled={!hasNumber || !account.cellPhone || pending} onClick={() => run(placeTestCall)}>
          <DrawIcon name="phone" size={16} draw={false} /> Call me to test
        </Button>
        {hasNumber ? <p className="mt-2 text-xs text-gray-500">Or just call {formatUsPhone(account.twilioNumber)} from any phone.</p> : null}
      </Card>

      {result && !result.ok && result.error ? <Alert>{result.error}</Alert> : null}
      {result?.ok && result.message ? <Alert kind="success">{result.message}</Alert> : null}

      {mode === "onboarding" ? (
        <form action={completePhoneStep} className="space-y-3 pt-2">
          <Button type="submit" size="lg" full variant={hasNumber ? "primary" : "secondary"}>
            {hasNumber ? "Continue" : "Skip for now"}
          </Button>
          <Link href="/onboarding/6" className="block text-center text-sm font-semibold text-gray-500 hover:text-ink">
            Back
          </Link>
        </form>
      ) : null}
    </div>
  );
}
