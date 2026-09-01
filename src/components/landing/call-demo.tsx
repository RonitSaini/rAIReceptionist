"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { DrawIcon } from "@/components/draw-icon";
import type { IconName } from "@/components/icon-paths";

/**
 * The hero centerpiece: one call, answered → qualified → booked → confirmed, inside a phone frame.
 * Shape adapted from 21st.dev "Chat Messages" (solaceui #20130, message-by-message reveal in a
 * device frame) and the auto-advancing step sync of "Feature Section" (ayushmxxn #1368); all motion
 * is the house CSS (.cd-* in globals.css).
 *
 * Honesty: every beat is a shipped behavior — qualify-then-book (field-service handlers), the SMS
 * confirmation, and the owner's in-app notification. No fake customer, no fake stats.
 *
 * Everything is laid out in its final position from the server render and only animates
 * opacity/transform/blur into place, so nothing ever shifts (zero CLS) and the full conversation is
 * simply visible without JavaScript. Under prefers-reduced-motion the demo renders complete and
 * runs no timers. Timers only run while the demo is on screen.
 */

const LINES: { who: "caller" | "ai"; text: string; step: number }[] = [
  { who: "ai", text: "Thanks for calling — how can I help?", step: 0 },
  { who: "caller", text: "My water heater's leaking. Can someone come out today?", step: 1 },
  { who: "ai", text: "I can help with that. Is it flooding, or a steady drip?", step: 1 },
  { who: "caller", text: "Just a drip so far.", step: 1 },
  { who: "ai", text: "Okay — today between 2 and 4 is open. Does that work?", step: 2 },
  { who: "caller", text: "2 to 4 works.", step: 2 },
  { who: "ai", text: "You're booked for today, 2–4 PM. A text confirmation is on its way.", step: 3 },
];

const STEPS: { icon: IconName; label: string }[] = [
  { icon: "phone", label: "Answered" },
  { icon: "clipboard", label: "Qualified" },
  { icon: "calendar", label: "Booked" },
  { icon: "bell", label: "You know" },
];

const CHIPS: { icon: IconName; label: string }[] = [
  { icon: "check", label: "Booked — today, 2–4 PM" },
  { icon: "message", label: "Confirmation text sent" },
  { icon: "bell", label: "Owner notified" },
];

const LINE_MS = 1500;
const CHIP_MS = 900;
const HOLD_MS = 4500;
const TOTAL_BEATS = LINES.length + CHIPS.length;

/* Reduced motion as an external store (the AnimatedThemeToggle idiom): SSR says "animate", and the
   snapshot also parks the demo in its complete state where IntersectionObserver doesn't exist. */
function subscribeMotionPrefs(onChange: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
function motionPrefsSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof IntersectionObserver === "undefined";
}

export function CallDemo() {
  const rootRef = useRef<HTMLElement>(null);
  const [beat, setBeat] = useState(-1);
  const [resetting, setResetting] = useState(false);
  const staticAll = useSyncExternalStore(subscribeMotionPrefs, motionPrefsSnapshot, () => false);

  useEffect(() => {
    if (staticAll) return;
    const el = rootRef.current;
    if (!el) return;

    let timer: number | undefined;
    let beatNow = -1;
    let stopped = true;

    const schedule = (ms: number, fn: () => void) => {
      timer = window.setTimeout(fn, ms);
    };

    const advance = () => {
      if (stopped) return;
      if (beatNow < TOTAL_BEATS - 1) {
        beatNow += 1;
        setBeat(beatNow);
        schedule(beatNow >= LINES.length - 1 ? CHIP_MS : LINE_MS, advance);
      } else {
        schedule(HOLD_MS, () => {
          setResetting(true);
          schedule(400, () => {
            beatNow = -1;
            setBeat(-1);
            setResetting(false);
            schedule(500, advance);
          });
        });
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting);
        if (visible && stopped) {
          stopped = false;
          schedule(400, advance);
        } else if (!visible && !stopped) {
          stopped = true;
          window.clearTimeout(timer);
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => {
      window.clearTimeout(timer);
      io.disconnect();
    };
  }, [staticAll]);

  const activeStep = staticAll ? STEPS.length - 1 : beat < 0 ? -1 : beat >= LINES.length ? STEPS.length - 1 : LINES[beat].step;
  const lineShown = (i: number) => staticAll || beat >= i;
  const chipShown = (i: number) => staticAll || beat >= LINES.length + i;

  return (
    <figure ref={rootRef} className={`cd-fade mx-auto w-full max-w-sm ${resetting ? "is-resetting" : ""}`.trim()}>
      <figcaption className="sr-only">
        Example call: FrontDesk AI answers, asks the qualifying question, books the visit, and the customer and owner are both told.
      </figcaption>

      {/* Phone frame */}
      <div className="rounded-[2.5rem] border border-gray-300 bg-gray-100 p-2 shadow-lg shadow-black/5">
        <div className="overflow-hidden rounded-[2rem] border border-gray-200 bg-surface">
          <div className="flex justify-center pt-2.5" aria-hidden="true">
            <span className="h-1.5 w-16 rounded-full bg-gray-300" />
          </div>
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2.5">
            <p className="text-sm font-semibold">(555) 210-4477</p>
            {/* brand-700 flips with the theme (brand-600 does not) — 12px text needs the contrast */}
            <p className="flex items-center gap-2 text-xs font-semibold text-brand-700">
              <span className="status-dot" aria-hidden="true" />
              Live call
            </p>
          </div>
          <ul className="space-y-2.5 px-3.5 py-4">
            {LINES.map((line, i) => (
              <li key={i} className={`cd-item flex ${line.who === "ai" ? "justify-start" : "justify-end"} ${lineShown(i) ? "is-on" : ""}`.trim()}>
                <p
                  className={
                    line.who === "ai"
                      ? "max-w-[85%] rounded-2xl rounded-bl-md bg-brand-600 px-3.5 py-2 text-sm text-white"
                      : "max-w-[85%] rounded-2xl rounded-br-md bg-gray-100 px-3.5 py-2 text-sm text-gray-800"
                  }
                >
                  {line.text}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Step rail: answer → qualify → book → notify */}
      <ol className="mt-5 flex items-start justify-center" aria-label="What happened on this call">
        {STEPS.map((step, i) => {
          const done = activeStep > i || staticAll;
          const active = !staticAll && activeStep === i;
          return (
            <li key={step.label} className="flex items-start">
              {i > 0 && (
                <span aria-hidden="true" className="relative mx-1 mt-[17px] block h-0.5 w-5 overflow-hidden rounded-full bg-gray-200 sm:w-8">
                  <span className={`cd-seg absolute inset-0 rounded-full bg-brand-400 ${activeStep >= i ? "is-on" : ""}`.trim()} />
                </span>
              )}
              <span className="flex w-16 flex-col items-center gap-1 sm:w-[4.5rem]">
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
                    active ? "border-brand-500 bg-brand-50 text-brand-700" : done ? "border-brand-300 bg-surface text-brand-500" : "border-gray-300 bg-surface text-gray-400"
                  }`}
                >
                  {/* Redraws on activation — an active-state change, the sanctioned trigger (and ≥18px). */}
                  <DrawIcon name={step.icon} size={18} draw={active} />
                </span>
                <span className={`text-[11px] font-semibold transition-colors ${active || done ? "text-brand-700" : "text-gray-500"}`}>{step.label}</span>
              </span>
            </li>
          );
        })}
      </ol>

      {/* Outcomes — each one is a real shipped behavior */}
      <ul className="mt-4 flex flex-wrap justify-center gap-2">
        {CHIPS.map((chip, i) => (
          <li
            key={chip.label}
            className={`cd-chip inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-800 ${chipShown(i) ? "is-on" : ""}`.trim()}
          >
            <DrawIcon name={chip.icon} size={14} draw={false} />
            {chip.label}
          </li>
        ))}
      </ul>
    </figure>
  );
}
