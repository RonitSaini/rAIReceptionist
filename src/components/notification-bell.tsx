"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NOTIFICATION_POLL_MS } from "@/lib/constants";

/**
 * Unread badge. Polls on an interval and refreshes on navigation — no realtime/push dependency.
 * Styled to match the theme toggle; on click (and when new notifications arrive) the bell outline
 * redraws itself and swings (see .bell-icon in globals.css).
 */
export function NotificationBell({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount);
  const [ringKey, setRingKey] = useState(0); // bump to replay the animation
  const prevCount = useRef(initialCount);
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/notifications/unread-count", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { count: number };
        if (!cancelled) setCount(data.count);
      } catch {
        // Ignore transient network errors; the next poll will catch up.
      }
    }
    load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, NOTIFICATION_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
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

  return (
    <Link
      href="/notifications"
      onClick={() => setRingKey((k) => k + 1)}
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-300 bg-surface text-ink transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
      aria-label={`Notifications, ${count} unread`}
      title="Notifications"
    >
      <BellIcon ringKey={ringKey} />
      {count > 0 ? (
        <span key={`badge-${ringKey}`} className={`absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white ${ringKey ? "badge-pop" : ""}`}>
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
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
