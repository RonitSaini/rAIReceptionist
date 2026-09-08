import { dismissSmsPauseBanner } from "@/actions/sms-pause";
import { SMS_PAUSE_TITLE } from "@/lib/sms-pause";
import { Alert } from "@/components/ui";

/**
 * One non-urgent line on Home while texts to US numbers are paused (src/lib/sms-pause.ts). A plain
 * form so Dismiss works before hydration; the page decides whether to render it at all.
 */
export function SmsPauseBanner() {
  return (
    <form action={dismissSmsPauseBanner} className="mb-4" data-sms-pause-banner>
      <Alert kind="info">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <span>{SMS_PAUSE_TITLE}. Bookings still land here as usual; call to confirm where it matters.</span>
          <button type="submit" className="font-semibold underline underline-offset-2">
            Dismiss
          </button>
        </div>
      </Alert>
    </form>
  );
}
