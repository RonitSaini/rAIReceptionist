"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type ToggleEvent } from "react";
import { NOTIFICATION_POLL_MS } from "@/lib/constants";
import { NOTIFICATION_TYPE_ICON, type BellNotification } from "@/lib/notification-ui";
import { timeAgo } from "@/lib/time";
import { acknowledgeNotification, markAllNotificationsRead, markNotificationRead, openNotification } from "@/actions/notifications";
import { DrawIcon } from "@/components/draw-icon";
import { StatusDot } from "@/components/ui";
import { Tick } from "@/components/tick";
import { MotionList } from "@/components/motion-list";
import { DismissButton, UndoBar, useDismiss, useNotificationsChanged } from "@/components/notification-dismiss";

/**
 * Bell + unread badge + popover. Polls on an interval and refreshes on navigation — no realtime/push
 * dependency. The bell rings (outline redraws, swings) when something new arrives; see .bell-icon.
 *
 * The popover is the native Popover API (`popover="auto"`): light-dismiss, Escape and top-layer
 * stacking come from the browser, no library. Non-modal, so no focus trap is owed. Anchored under
 * the bell on ≥ md (the bell sits at a fixed spot in a fixed header, so this is a top-right panel,
 * not general floating UI); a bottom sheet under md via the stylesheet (.notif-panel).
 * Shape after patrick-xin's "Vercel Notification Popover" (21st.dev #10479): All · Unread tabs, row
 * hover action, View-all footer.
 */
async function fetchRecent(): Promise<{ count: number; items: BellNotification[] } | null> {
  try {
    const res = await fetch("/api/notifications/recent", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as { count: number; items: BellNotification[] };
  } catch {
    return null; // transient network error; the next poll catches up
  }
}

export function NotificationBell({ initialCount, initialItems }: { initialCount: number; initialItems: BellNotification[] }) {
  const [count, setCount] = useState(initialCount);
  const [items, setItems] = useState(initialItems);
  const [ringKey, setRingKey] = useState(0); // bump to replay the ring animation
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"all" | "unread">("all");
  const prevCount = useRef(initialCount);
  const pathname = usePathname();
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  /** On-demand refresh (popover opened, an item marked read). */
  const load = useCallback(async () => {
    const data = await fetchRecent();
    if (!data) return;
    setCount(data.count);
    setItems(data.items);
  }, []);

  // Dismissing here refetches, because this surface holds its own copy of the list.
  const { busyId, undo, error, dismiss, undoDismiss, clearUndo } = useDismiss(load);

  // ...and dismissing ANYWHERE refetches, because the badge is here and the inbox page is not.
  useNotificationsChanged(load);

  // Poll while visible; refresh on navigation. State is only set from the fetch callback, never synchronously.
  useEffect(() => {
    let cancelled = false;
    const tick = () =>
      fetchRecent().then((data) => {
        if (cancelled || !data) return;
        setCount(data.count);
        setItems(data.items);
      });
    tick();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") tick();
    }, NOTIFICATION_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname]);

  // Ring when something new arrives.
  useEffect(() => {
    if (count > prevCount.current) setRingKey((k) => k + 1);
    prevCount.current = count;
  }, [count]);

  // Close on navigation.
  useEffect(() => {
    panelRef.current?.hidePopover?.();
  }, [pathname]);

  /** Anchor the panel under the bell on ≥ md; under md the stylesheet makes it a bottom sheet. */
  const place = useCallback(() => {
    const panel = panelRef.current;
    const btn = buttonRef.current;
    if (!panel || !btn) return;
    if (window.matchMedia("(min-width: 768px)").matches) {
      const r = btn.getBoundingClientRect();
      panel.style.top = `${r.bottom + 8}px`;
      // clientWidth, not innerWidth: fixed positioning is relative to the viewport minus the scrollbar.
      panel.style.right = `${document.documentElement.clientWidth - r.right}px`;
    } else {
      panel.style.top = "";
      panel.style.right = "";
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, place]);

  const close = () => panelRef.current?.hidePopover?.();
  const onBeforeToggle = (e: ToggleEvent<HTMLDivElement>) => {
    if (e.newState === "open") place(); // before first paint, so it never flashes at the UA's default position
  };
  const onToggle = (e: ToggleEvent<HTMLDivElement>) => {
    const isOpen = e.newState === "open";
    setOpen(isOpen);
    if (isOpen) load();
  };

  const markRead = async (fd: FormData) => {
    await markNotificationRead(fd);
    await load();
  };
  const markAll = async () => {
    await markAllNotificationsRead();
    await load();
  };
  const acknowledge = async (fd: FormData) => {
    await acknowledgeNotification(fd);
    await load();
  };

  const shown = tab === "unread" ? items.filter((n) => !n.readAt) : items;
  const now = new Date();
  const buttonChrome = "relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-300 bg-surface text-ink transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400";

  return (
    <>
      <button ref={buttonRef} type="button" popoverTarget={panelId} aria-expanded={open} aria-controls={panelId} onClick={() => setRingKey((k) => k + 1)} className={buttonChrome} aria-label={`Notifications, ${count} unread`} title="Notifications">
        <BellIcon ringKey={ringKey} />
        {count > 0 ? (
          <span key={`badge-${ringKey}`} className={`absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white ${ringKey ? "badge-pop" : ""}`}>
            {/* The container pops on arrival (as before); the digits themselves tick, never snap. */}
            <Tick value={count > 99 ? "99+" : count} />
          </span>
        ) : null}
      </button>

      <div ref={panelRef} id={panelId} popover="auto" onBeforeToggle={onBeforeToggle} onToggle={onToggle} className="notif-panel" aria-label="Notifications">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-4 pt-3">
          <div className="relative flex">
            {(["all", "unread"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t} className={`press-soft w-24 pb-2.5 text-sm font-semibold ${tab === t ? "text-ink" : "text-gray-500 hover:text-ink"}`}>
                {t === "all" ? (
                  "All"
                ) : (
                  <>
                    Unread · <Tick value={count} />
                  </>
                )}
              </button>
            ))}
            {/* Equal-width tabs, so the indicator only translates. */}
            <span aria-hidden="true" className="nav-bar pointer-events-none absolute bottom-0 left-0 h-0.5 w-24 rounded-t-full bg-brand-500" style={{ transform: `translateX(${tab === "all" ? 0 : 100}%)` }} />
          </div>
          {count > 0 ? (
            <form action={markAll}>
              <button type="submit" className="press-soft pb-2.5 text-xs font-semibold text-brand-700 hover:text-brand-800">
                Mark all read
              </button>
            </form>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {shown.length === 0 ? (
            <p className={`px-4 py-8 text-center text-sm ${tab === "unread" ? "text-green-700" : "text-gray-500"}`}>{tab === "unread" ? "You're all caught up." : "Nothing here yet."}</p>
          ) : (
            <MotionList>
              {shown.map((n) => {
                const unread = !n.readAt;
                const urgent = n.priority === "urgent";
                const needsAck = urgent && !n.acknowledgedAt;
                return (
                  <li key={n.id} data-urgent={urgent ? "true" : undefined} className={`group flex gap-3 border-b border-gray-100 px-4 py-3 transition-colors last:border-0 hover:bg-gray-50 ${unread ? "bg-brand-50/40" : ""}`}>
                    <DrawIcon name={NOTIFICATION_TYPE_ICON[n.type]} size={18} draw={false} className={`mt-0.5 shrink-0 ${urgent ? "text-red-600" : "text-gray-400"}`} />
                    {/* Opening marks it read → POST via server action, never a prefetchable GET. */}
                    <form action={openNotification} onSubmit={close} className="min-w-0 flex-1">
                      <input type="hidden" name="id" value={n.id} />
                      <button type="submit" className="press-soft block w-full text-left">
                      <span className="flex items-center gap-2">
                        <span className={`truncate text-sm ${unread ? "font-bold" : "font-semibold"}`}>{n.title}</span>
                        {unread ? <StatusDot className="text-brand-500" label="Unread" /> : null}
                      </span>
                      {n.body ? <span className="block line-clamp-1 text-xs text-gray-600">{n.body}</span> : null}
                      {/* Relative time differs between server render and hydration by design; patch, don't warn. */}
                      <span className="block text-[11px] text-gray-500" suppressHydrationWarning>
                        {timeAgo(new Date(n.createdAt), now)}
                      </span>
                      </button>
                    </form>
                    <div className="flex shrink-0 items-center gap-1 self-center">
                      {unread ? (
                        <form action={markRead}>
                          <input type="hidden" name="id" value={n.id} />
                          <button type="submit" className="press-soft text-xs font-semibold text-brand-700 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100">
                            Mark read
                          </button>
                        </form>
                      ) : null}
                      {/* An unacknowledged alarm cannot be dismissed in one step anywhere, so the
                          popover offers the button that unlocks it rather than a dead control. */}
                      {needsAck ? (
                        <form action={acknowledge}>
                          <input type="hidden" name="id" value={n.id} />
                          <button type="submit" className="press rounded-lg bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700">
                            Acknowledge
                          </button>
                        </form>
                      ) : (
                        <DismissButton title={n.title} busy={busyId === n.id} onDismiss={() => dismiss(n.id)} className="md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100" />
                      )}
                    </div>
                  </li>
                );
              })}
            </MotionList>
          )}
        </div>

        {error ? (
          <p role="alert" className="shrink-0 border-t border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-800">
            {error}
          </p>
        ) : null}
        {undo ? (
          <div className="shrink-0 border-t border-gray-200 p-2">
            <UndoBar seq={undo.seq} onUndo={undoDismiss} onExpire={clearUndo} inline />
          </div>
        ) : null}

        <Link href="/notifications" onClick={close} className="press-soft block shrink-0 border-t border-gray-200 py-2.5 text-center text-sm font-semibold text-brand-700 hover:bg-gray-50">
          View all notifications
        </Link>
      </div>
    </>
  );
}

function BellIcon({ ringKey, size = 20 }: { ringKey: number; size?: number }) {
  // Re-keying the svg restarts the CSS animations each time ringKey changes.
  return (
    <svg key={ringKey} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={`bell-icon ${ringKey ? "is-ringing" : ""}`} aria-hidden="true">
      <path pathLength={1} d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path pathLength={1} className="clapper" d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
