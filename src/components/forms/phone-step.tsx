import type { AccountView } from "@/lib/serialize";
import { formatDateTime } from "@/lib/time";
import { appUrl, appUrlIsPublic, phoneRequiresSubscription, retellConfigured, stripeConfigured, twilioConfigured } from "@/lib/env";
import { subscriptionActive } from "@/lib/billing-ui";
import type { FormMode } from "@/components/form-footer";
import { PhonePanel } from "@/components/forms/phone-panel";

/** The phone step / Settings → Phone. Server wrapper that passes integration status to the panel. */
export function PhoneStep({ account, mode, backHref, nextHref }: { account: AccountView; mode: FormMode; backHref?: string; nextHref?: string }) {
  return (
    <PhonePanel
      account={account}
      mode={mode}
      backHref={backHref}
      nextHref={nextHref}
      status={{
        twilio: twilioConfigured(),
        retell: retellConfigured(),
        publicUrl: appUrlIsPublic(),
        subscribed: !phoneRequiresSubscription() || !stripeConfigured() || subscriptionActive(account),
        appUrl: appUrl(),
        lastSynced: account.agentSyncedAt ? formatDateTime(new Date(account.agentSyncedAt), account.timeZone) : null,
      }}
    />
  );
}
