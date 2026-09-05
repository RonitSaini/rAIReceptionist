"use client";

import { useState, useTransition } from "react";
import type { NotificationType } from "@prisma/client";
import { clearReadNotifications } from "@/actions/notifications";
import { announceNotificationsChanged } from "@/components/notification-dismiss";
import { Button } from "@/components/ui";

/**
 * "Clear read" — the answer to fifty rows and a one-at-a-time dismiss.
 *
 * One press asks, a second confirms, in the house pattern (`<RunningLateButton>`): a dialog for a
 * bulk delete would be heavier than the thing deserves, and this works the same at 390px as it does
 * on a desktop. It is deliberately NOT undoable — restoring fifty rows one snapshot at a time is a
 * promise this cannot keep — which is exactly why it asks first while a single dismiss does not.
 *
 * The count in the question is the real one, computed by the page from the same `where` the action
 * uses, so the number the owner agrees to is the number that goes.
 */
export function ClearReadNotifications({ count, heldBack, typeFilter, typeLabel }: { count: number; heldBack: number; typeFilter: NotificationType | null; typeLabel: string | null }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (count === 0) return null;
  const what = typeLabel ? `read ${typeLabel.toLowerCase()} ${count === 1 ? "notification" : "notifications"}` : `read ${count === 1 ? "notification" : "notifications"}`;

  const run = () => {
    setConfirming(false);
    startTransition(async () => {
      await clearReadNotifications(typeFilter);
      announceNotificationsChanged();
    });
  };

  if (!confirming) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setConfirming(true)} disabled={pending} title="Clears read notifications from this list. The bookings, calls and messages they refer to are not affected.">
        {pending ? "Clearing…" : `Clear read · ${count}`}
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <p className="max-w-64 text-right text-xs text-gray-600">
        Clear {count} {what}? This empties the list only — the {typeLabel ? typeLabel.toLowerCase() : "bookings, calls and messages"} themselves are not affected.
        {heldBack > 0 ? ` ${heldBack} unacknowledged urgent ${heldBack === 1 ? "notification stays" : "notifications stay"}.` : ""}
      </p>
      <div className="flex gap-2">
        <Button type="button" variant="danger" size="sm" onClick={run} disabled={pending}>
          Clear {count}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
