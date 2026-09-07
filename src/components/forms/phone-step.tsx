import type { AccountView } from "@/lib/serialize";
import { formatDateTime } from "@/lib/time";
import { appUrl, appUrlIsPublic, canConnectNumber, retellConfigured, twilioConfigured } from "@/lib/env";
import { currentUserVerification } from "@/lib/email-verification";
import type { FormMode } from "@/components/form-footer";
import { PhonePanel } from "@/components/forms/phone-panel";

/**
 * The phone step / Settings → Phone. Server wrapper that passes integration status to the panel.
 * `paymentHref` is the onboarding step's way back to payment for the one case where it did not go
 * through; in Settings the panel links to Billing instead.
 */
export async function PhoneStep({ account, mode, backHref, paymentHref }: { account: AccountView; mode: FormMode; backHref?: string; paymentHref?: string }) {
  const verification = await currentUserVerification();
  return (
    <PhonePanel
      account={account}
      mode={mode}
      backHref={backHref}
      paymentHref={paymentHref}
      status={{
        twilio: twilioConfigured(),
        retell: retellConfigured(),
        publicUrl: appUrlIsPublic(),
        subscribed: canConnectNumber(account),
        // The phone number is verification's one hard gate; the button says so rather than failing.
        unverifiedEmail: verification && !verification.verified ? verification.email : null,
        appUrl: appUrl(),
        lastSynced: account.agentSyncedAt ? formatDateTime(new Date(account.agentSyncedAt), account.timeZone) : null,
      }}
    />
  );
}
