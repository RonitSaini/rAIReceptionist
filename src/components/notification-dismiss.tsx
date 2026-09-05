"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { dismissNotification, restoreNotification, type DismissedNotification } from "@/actions/notifications";
import { INTERACTION } from "@/lib/motion";
import { DrawIcon } from "@/components/draw-icon";
import { Toast } from "@/components/toast";

/**
 * Dismissing a notification, and taking it back.
 *
 * Shared by the inbox list and the bell popover: the sequence is the same in both — delete, offer an
 * undo for a few seconds, tell the rest of the app the unread count moved — while the two surfaces
 * present it differently (see `<UndoBar>` for why the popover cannot use a toast).
 */

/**
 * The unread badge lives in the app shell, not in either surface, and holds its count in client
 * state — so `revalidatePath` alone leaves it reading one too many after a dismiss. This is the
 * nudge: whoever changed the feed says so, and the bell refetches.
 */
export const NOTIFICATIONS_CHANGED = "frontdesk:notifications-changed";

export function announceNotificationsChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED));
}

/** Run `onChange` whenever anything in the app dismisses, restores or clears a notification. */
export function useNotificationsChanged(onChange: () => void) {
  const latest = useRef(onChange);
  // Kept current in an effect, not during render: the listener below is registered once, so it has
  // to reach the latest callback through the ref rather than through a re-subscription.
  useEffect(() => {
    latest.current = onChange;
  });
  useEffect(() => {
    const handler = () => latest.current();
    window.addEventListener(NOTIFICATIONS_CHANGED, handler);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED, handler);
  }, []);
}

export type UndoState = { snapshot: DismissedNotification; seq: number };

/**
 * `onSettled` runs after a dismiss or restore has landed, for a surface holding its own copy of the
 * list (the popover) that needs to refetch. The inbox list gets its rows back from the server
 * render, so it passes nothing.
 */
export function useDismiss(onSettled?: () => void | Promise<void>) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [undo, setUndo] = useState<UndoState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const dismiss = useCallback(
    async (id: string) => {
      setBusyId(id);
      setError(null);
      try {
        const result = await dismissNotification(id);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        seq.current += 1;
        setUndo({ snapshot: result.snapshot, seq: seq.current });
        announceNotificationsChanged();
        await onSettled?.();
      } finally {
        setBusyId(null);
      }
    },
    [onSettled],
  );

  const undoDismiss = useCallback(async () => {
    if (!undo) return;
    setUndo(null);
    await restoreNotification(undo.snapshot);
    announceNotificationsChanged();
    await onSettled?.();
  }, [undo, onSettled]);

  return { busyId, undo, error, dismiss, undoDismiss, clearUndo: useCallback(() => setUndo(null), []), clearError: useCallback(() => setError(null), []) };
}

/**
 * The row control.
 *
 * "Dismiss", never "Delete": beside a title reading "New service call" a delete button invites
 * exactly the wrong reading, and being mistaken for deleting the service call is the one thing this
 * must not do. The visible label, the accessible name and the tooltip all say so.
 */
export function DismissButton({ title, busy, onDismiss, className = "" }: { title: string; busy: boolean; onDismiss: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onDismiss}
      disabled={busy}
      aria-label={`Dismiss notification: ${title}. Removes it from this list only — the record it refers to is not affected.`}
      title="Dismiss — removes this from the list only. The booking, call or message it refers to is not affected."
      className={`press-soft inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-50 ${className}`}
    >
      <DrawIcon name="x" size={16} draw={false} />
    </button>
  );
}

/** The undo button, wherever it is shown. Takes focus, because the control that was clicked is gone. */
function UndoAction({ onUndo }: { onUndo: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);

  // The dismiss button has just been removed from the DOM, so focus has fallen to <body> and a
  // keyboard user has nothing to act on. The undo is time-limited, so it is where focus belongs;
  // a mouse user loses nothing, since focus was going to <body> either way.
  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <button ref={ref} type="button" onClick={onUndo} className="press-soft ml-auto shrink-0 rounded-md px-1 font-bold underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600">
      Undo
    </button>
  );
}

/**
 * The undo affordance, in the one of two forms the surface needs.
 *
 * `inline` exists because the bell's panel is a native popover and therefore in the browser's top
 * layer: a fixed-position toast is painted underneath it, which on a phone — where the panel is a
 * full-width bottom sheet — would put the undo behind the very thing that triggered it. Inside the
 * panel it is simply visible. Same words, same beat: `.toast` carries its own entrance and is
 * already in the reduced-motion block, so the inline form inherits both.
 */
export function UndoBar({ seq, onUndo, onExpire, inline = false }: { seq: number; onUndo: () => void; onExpire: () => void; inline?: boolean }) {
  if (!inline) {
    return (
      <Toast key={seq} hold={INTERACTION.undoHold} onDone={onExpire}>
        <span className="flex w-full items-center gap-3">
          Notification dismissed.
          <UndoAction onUndo={onUndo} />
        </span>
      </Toast>
    );
  }
  return <InlineUndoBar key={seq} onUndo={onUndo} onExpire={onExpire} />;
}

function InlineUndoBar({ onUndo, onExpire }: { onUndo: () => void; onExpire: () => void }) {
  useEffect(() => {
    const t = setTimeout(onExpire, INTERACTION.undoHold);
    return () => clearTimeout(t);
  }, [onExpire]);

  return (
    <div role="status" className="toast w-full">
      <DrawIcon name="check" size={18} className="draw-fast shrink-0 text-green-700" />
      <span>Notification dismissed.</span>
      <UndoAction onUndo={onUndo} />
    </div>
  );
}
