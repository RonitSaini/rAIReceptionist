"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { DrawIcon } from "@/components/draw-icon";
import type { VoicePanel } from "@/components/landing/voice-data";

/**
 * The professions section's one live surface: a tab rail of the ten professions and a stage that
 * shows what the receptionist says and does for the selected one, rendered from the registry data
 * built in voice-data.ts.
 *
 * Motion is user-triggered only (no timers, no autoplay): the rail indicator glides to the picked
 * item (translate-only — the vertical pill rides uniform-height items like the app sidebar's
 * .nav-bar; under lg the rail scrolls horizontally and the indicator is the 2px underline from
 * motion spec rule 5, translateX + scaleX, because a line has no corners to distort), and the
 * stage crossfades (opacity + blur, .pv-panel in globals.css).
 *
 * All ten panels are server-rendered into one grid cell under `.js` — the tallest sets the stage
 * height, so switching never shifts layout — and stack in normal flow without JavaScript, where
 * the whole section reads as ten titled summaries. Reduced motion swaps instantly.
 */

const FADE_MS = 350;

function subscribeMotionPrefs(onChange: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
function motionPrefsSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function ProfessionSwitcher({ professions, className = "" }: { professions: VoicePanel[]; className?: string }) {
  const railRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [leaving, setLeaving] = useState<number | null>(null);
  /* Rail icons draw only when a selection LANDS (rule 8: an active-state change, never mount), so
     the server-rendered default tab's icon is drawn already and only redraws once the user picks. */
  const [touched, setTouched] = useState(false);
  const fadeTimer = useRef<number>(undefined);
  const reduced = useSyncExternalStore(subscribeMotionPrefs, motionPrefsSnapshot, () => false);

  /* Indicator geometry lives in CSS vars on the rail; both indicators read the same measurement. */
  const placeIndicator = useCallback(() => {
    const rail = railRef.current;
    const item = rail?.querySelector<HTMLElement>('[data-active="true"]');
    if (!rail || !item) return;
    rail.style.setProperty("--pv-y", `${item.offsetTop}px`);
    rail.style.setProperty("--pv-x", `${item.offsetLeft}px`);
    rail.style.setProperty("--pv-sx", `${item.offsetWidth / 100}`);
  }, []);

  useEffect(() => {
    placeIndicator();
    window.addEventListener("resize", placeIndicator);
    return () => window.removeEventListener("resize", placeIndicator);
  }, [placeIndicator, active]);

  useEffect(() => () => window.clearTimeout(fadeTimer.current), []);

  const select = (index: number) => {
    if (index === active) return;
    window.clearTimeout(fadeTimer.current);
    setLeaving(reduced ? null : active);
    setActive(index);
    setTouched(true);
    if (!reduced) fadeTimer.current = window.setTimeout(() => setLeaving(null), FADE_MS);
    railRef.current
      ?.querySelectorAll<HTMLElement>("[role='tab']")
      [index]?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduced ? "auto" : "smooth" });
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const last = professions.length - 1;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = active === last ? 0 : active + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = active === 0 ? last : active - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    if (next === null) return;
    event.preventDefault();
    select(next);
    railRef.current?.querySelectorAll<HTMLElement>("[role='tab']")[next]?.focus();
  };

  return (
    <div className={`lg:grid lg:grid-cols-[230px_1fr] lg:items-start lg:gap-8 ${className}`.trim()}>
      <div className="-mx-5 overflow-x-auto px-5 lg:mx-0 lg:overflow-visible lg:px-0">
        <div
          ref={railRef}
          role="tablist"
          aria-label="Professions"
          onKeyDown={onKeyDown}
          className="pv-rail flex min-w-max gap-1 border-b border-gray-200 pb-px lg:min-w-0 lg:flex-col lg:border-b-0 lg:pb-0"
        >
          <span className="pv-pill hidden lg:block" aria-hidden="true" />
          <span className="pv-underline lg:hidden" aria-hidden="true" />
          {professions.map((p, i) => {
            const isActive = i === active;
            return (
              <button
                key={p.slug}
                type="button"
                role="tab"
                id={`pv-tab-${p.slug}`}
                aria-selected={isActive}
                aria-controls={`pv-panel-${p.slug}`}
                tabIndex={isActive ? 0 : -1}
                data-active={isActive || undefined}
                onClick={() => select(i)}
                className={`relative z-10 flex h-11 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-full px-3.5 text-sm font-semibold transition-colors lg:w-full ${
                  isActive ? "text-green-800" : "text-gray-600 hover:text-green-700"
                }`}
              >
                {/* Redraws when a selection lands on it — an active-state change (rule 8), 18px. */}
                <DrawIcon name={p.icon} size={18} draw={isActive && touched} className={isActive ? "text-green-700" : "text-gray-400"} />
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="pv-stage mt-5 lg:mt-0">
        {professions.map((p, i) => {
          const state = i === active ? "is-in" : i === leaving ? "is-out" : "";
          return (
            <section
              key={p.slug}
              role="tabpanel"
              id={`pv-panel-${p.slug}`}
              aria-labelledby={`pv-tab-${p.slug}`}
              className={`pv-panel rounded-3xl border border-gray-200 bg-surface p-5 sm:p-7 ${state}`.trim()}
            >
              <h3 className="text-lg font-bold tracking-tight">{p.label}</h3>

              <p className="mt-4 text-xs font-semibold text-gray-500">How it answers, out of the box</p>
              {/* A spoken line, shown the way the dashboard's call transcript shows one (speaker label,
                  tinted line) — not as a text message. "Alex" is the shipped default host name. */}
              <p className="mt-1.5 max-w-xl rounded-2xl bg-brand-50 px-4 py-3 text-sm leading-relaxed text-brand-900">
                <span className="block text-[11px] font-semibold text-brand-700">Alex</span>
                {p.greeting.before}
                <span className="rounded bg-brand-100 px-1.5 py-0.5 font-semibold">{p.greeting.slot}</span>
                {p.greeting.after}
              </p>

              <p className="mt-5 text-sm text-gray-600">
                {p.booking.before}
                <span className="rounded-md bg-brand-50 px-1.5 py-0.5 font-semibold text-brand-800">{p.booking.noun}</span>
                {p.booking.after}
              </p>

              <p className="mt-5 text-sm text-gray-600">
                {p.asks.before}
                <span className="rounded-md bg-brand-50 px-1.5 py-0.5 font-semibold text-brand-800">{p.asks.noun}</span>
                {p.asks.after}
              </p>
              <ul className="mt-2.5 flex flex-wrap gap-2">
                {p.fields.map((field) => (
                  <li key={field} className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-600">
                    {field}
                  </li>
                ))}
              </ul>

              <div className="mt-5">
                <p className="text-xs font-semibold text-gray-500">{p.urgent.heading}</p>
                <p className="mt-1.5 text-sm text-gray-600">
                  <span
                    className={`mr-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      p.urgent.tone === "red" ? "bg-red-50 text-red-800" : "bg-amber-100 text-amber-900"
                    }`}
                  >
                    {p.urgent.label}
                  </span>
                  {p.urgent.clause}
                </p>
              </div>

              <div className="mt-5 rounded-2xl bg-gray-50 px-4 py-3.5">
                <p className="text-xs font-bold text-gray-500">{p.rule.heading}</p>
                <p className="mt-1 text-sm text-gray-600">{p.rule.body}</p>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
