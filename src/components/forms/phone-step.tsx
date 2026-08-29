import type { AccountView } from "@/lib/serialize";
import { appUrl, appUrlIsPublic, retellConfigured, twilioConfigured } from "@/lib/env";
import type { FormMode } from "@/components/form-footer";
import { PhonePanel } from "@/components/forms/phone-panel";

/** Step 7 / Settings → Phone. Server wrapper that passes integration status to the interactive panel. */
export function PhoneStep({ account, mode }: { account: AccountView; mode: FormMode }) {
  return (
    <PhonePanel
      account={account}
      mode={mode}
      status={{
        twilio: twilioConfigured(),
        retell: retellConfigured(),
        publicUrl: appUrlIsPublic(),
        appUrl: appUrl(),
      }}
    />
  );
}
