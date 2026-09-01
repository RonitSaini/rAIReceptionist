"use client";

import { useState, useTransition } from "react";
import { notifyRunningLate } from "@/actions/field-service";
import { Button } from "@/components/ui";

/**
 * The "day is slipping" button on the schedule.
 *
 * One press asks, a second confirms — a stray tap must not text every customer of the day. The
 * action itself is idempotent per booking per day, so even a double confirm tells nobody twice.
 */
export function RunningLateButton() {
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    setConfirming(false);
    startTransition(async () => {
      const r = await notifyRunningLate();
      setResult(r ? { ok: r.ok, text: r.ok ? (r.message ?? "Done.") : (r.error ?? "Something went wrong.") } : null);
    });
  }

  return (
    <div className="flex items-center gap-2">
      {result ? <span className={`max-w-56 text-xs font-semibold ${result.ok ? "text-brand-700" : "text-red-600"}`}>{result.text}</span> : null}
      {confirming ? (
        <>
          <Button type="button" variant="danger" size="sm" onClick={send} disabled={pending}>
            Text today&apos;s bookings
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
            Cancel
          </Button>
        </>
      ) : (
        <Button type="button" variant="secondary" size="sm" onClick={() => { setResult(null); setConfirming(true); }} disabled={pending} title="Text everyone still booked today that you may need to reschedule">
          {pending ? "Texting…" : "Running late?"}
        </Button>
      )}
    </div>
  );
}
