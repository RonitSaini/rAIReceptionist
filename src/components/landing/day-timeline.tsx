"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { DrawIcon } from "@/components/draw-icon";
import type { IconName } from "@/components/icon-paths";

/**
 * "What it does all day" as one day: five moments, each a shipped behavior, on a rail that draws
 * down the day as the reader scrolls — the page's one orchestrated motion moment (timeline shape
 * from 21st.dev aceternity "Timeline" #857, retrieved 2026-09-01; its framer-motion scroll scrub
 * ported to the house system as settled 550ms segment fills, scaleY on --day-progress).
 *
 * Each moment lights once, the first time it crosses the lower third of the viewport, and stays
 * lit: the fill advances to its node and the node's icon draws (an activation, rule 8; 18px). No
 * hover states, no per-moment reveals — the text is simply there; only the rail moves.
 *
 * The track's geometry (first node center to last node center) is measured and laid out once per
 * resize, not animated. Without JavaScript the track stays hidden and the content reads complete;
 * under reduced motion everything renders lit and fully drawn from the start.
 *
 * Times and the cancelled booking are illustrative; every behavior is shipped code, and the
 * CANCEL reply is the roofing vertical's real cancellationReply template with the business-name
 * slot left visible (see voice-data.ts for why roofing).
 */

type Moment = {
  time: string;
  icon: IconName;
  title: string;
  body: string;
};

const MOMENTS: Moment[] = [
  {
    time: "5:57 AM",
    icon: "siren",
    title: "A burst pipe, before opening",
    body: "The plumbing line hears an emergency and skips the calendar: an urgent alert in the app, and a call to your cell with the details read out, inside the hours you marked reachable. If nobody acknowledges in time, the caller is texted the truth.",
  },
  {
    time: "10:15 AM",
    icon: "calendar",
    title: "A checkup, straight onto the calendar",
    body: "A client books their dog in, and the appointment lands on the clinic's Google Calendar. Busy events already on it were never offered as slots, and the built-in schedule stays the source of truth.",
  },
  {
    time: "1:20 PM",
    icon: "message",
    title: "CANCEL does what it says",
    body: "Confirmations for a booked time carry “Reply CANCEL if your plans change.” When one comes back, the booking is cancelled and the mirrored calendar event goes with it. No app, no hold music.",
  },
  {
    time: "4:40 PM",
    icon: "key",
    title: "A lockout joins the queue",
    body: "A lockout isn't a booking. The request enters a live dispatch queue, oldest first, with one-tap status changes, and a red flag on the row if the customer couldn't be texted an update.",
  },
  {
    time: "11:05 PM",
    icon: "audio-lines",
    title: "The whole day, on the record",
    body: "Every call since 5:57 this morning has a recording, a transcript and an AI summary with the caller's sentiment, each on its own page in the dashboard.",
  },
];

function subscribeMotionPrefs(onChange: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
/* Latched: once the timeline has rendered static (reduced motion, or no IntersectionObserver) it
   stays static, so a preference switched off mid-visit can never rewind a fully drawn rail. */
let seenStatic = false;
function motionPrefsSnapshot() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof IntersectionObserver === "undefined") seenStatic = true;
  return seenStatic;
}

export function DayTimeline({ cancelReply, className = "" }: { cancelReply: { before: string; after: string }; className?: string }) {
  const listRef = useRef<HTMLOListElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [litRaw, setLit] = useState(-1);
  const staticAll = useSyncExternalStore(subscribeMotionPrefs, motionPrefsSnapshot, () => false);
  const lit = staticAll ? MOMENTS.length - 1 : litRaw;

  /* Lay the track from the first node's center to the last node's center, and advance the fill to
     the lit node. Geometry is set outside React (inline styles / a CSS var) so scrolling never
     re-renders anything. */
  useEffect(() => {
    const list = listRef.current;
    const track = trackRef.current;
    if (!list || !track) return;

    const measure = () => {
      const nodes = Array.from(list.querySelectorAll<HTMLElement>("[data-day-node]"));
      if (nodes.length < 2) return;
      const listTop = list.getBoundingClientRect().top;
      const first = nodes[0].getBoundingClientRect();
      const centers = nodes.map((n) => {
        const r = n.getBoundingClientRect();
        return r.top - listTop + r.height / 2;
      });
      track.style.top = `${centers[0]}px`;
      track.style.left = `${first.left - list.getBoundingClientRect().left + first.width / 2 - 1}px`;
      track.style.height = `${centers[centers.length - 1] - centers[0]}px`;
      const progress = lit <= 0 ? 0 : (centers[lit] - centers[0]) / (centers[centers.length - 1] - centers[0]);
      track.style.setProperty("--day-progress", `${staticAll ? 1 : progress}`);
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [lit, staticAll]);

  /* Each moment lights once, the first time it crosses the lower third of the viewport. */
  useEffect(() => {
    if (staticAll) return;
    const list = listRef.current;
    if (!list) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = Number((entry.target as HTMLElement).dataset.dayMoment);
          setLit((current) => Math.max(current, index));
          io.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -30% 0px" },
    );
    list.querySelectorAll("[data-day-moment]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [staticAll]);

  return (
    <div className={`relative ${className}`.trim()}>
      <div ref={trackRef} className="day-track" aria-hidden="true">
        <div className="day-fill" />
      </div>
      <ol ref={listRef} aria-label="One day, answered">
        {MOMENTS.map((moment, i) => {
        const isLit = i <= lit;
        return (
          <li key={moment.time} data-day-moment={i} className="grid grid-cols-[2.25rem_1fr] gap-x-4 pb-10 last:pb-0 sm:grid-cols-[4.5rem_2.25rem_1fr]">
            <p className="hidden pt-2 text-right text-xs font-semibold text-gray-500 sm:block">{moment.time}</p>
            <span
              data-day-node
              className={`relative z-10 flex h-9 w-9 items-center justify-center rounded-full border bg-surface transition-colors ${
                isLit ? "border-brand-300 text-brand-600" : "border-gray-300 text-gray-400"
              }`}
            >
              {/* Draws once when the rail reaches it — an activation (rule 8), 18px. */}
              <DrawIcon name={moment.icon} size={18} draw={!staticAll && isLit} />
            </span>
            <div className="pt-1">
              <p className="text-xs font-semibold text-gray-500 sm:hidden">{moment.time}</p>
              <h3 className="mt-1 font-semibold sm:mt-0">{moment.title}</h3>
              <p className="mt-1 max-w-xl text-sm text-gray-500">{moment.body}</p>

              {i === 0 && (
                <p className="mt-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-800">
                    <DrawIcon name="phone" size={14} draw={false} />
                    Your cell: press 1 to acknowledge
                  </span>
                </p>
              )}

              {i === 2 && (
                <div className="mt-3 max-w-md space-y-2" aria-label="Example cancellation text exchange">
                  <p className="flex justify-end">
                    <span className="rounded-2xl rounded-br-md bg-gray-100 px-3.5 py-2 text-sm text-gray-800">CANCEL</span>
                  </p>
                  <p className="flex justify-start">
                    <span className="max-w-[90%] rounded-2xl rounded-bl-md bg-brand-600 px-3.5 py-2 text-sm text-white">
                      {cancelReply.before}
                      <span className="rounded bg-white/15 px-1.5 py-0.5 font-semibold">Your business</span>
                      {cancelReply.after}
                    </span>
                  </p>
                </div>
              )}
            </div>
          </li>
          );
        })}
      </ol>
    </div>
  );
}
