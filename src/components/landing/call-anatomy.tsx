"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { DrawIcon } from "@/components/draw-icon";

/**
 * "How it works" as the anatomy of ONE call: a plumbing line, nine at night, set as a transcript
 * with the margin saying what the system did at each beat. Where the profession switcher shows
 * variation across ten professions, this shows the depth of a single call.
 *
 * Two voices, without chat bubbles: the receptionist's lines sit flush in ink under a brand-colored
 * name, the caller's lines step in and read a shade lighter under a gray name. Each margin note
 * carries its beat's numeral, so the gutter numeral, the dialogue and the note read as one artifact
 * (below lg the note tucks under its beat). The confirmation text at the end is the one bubble on
 * the page, because it is an SMS.
 *
 * The section's one motion moment is user-triggered: "Play the call" hides the exchange and lets it
 * arrive line by line, the way a call unfolds, each note lighting as its beat lands. Everything is
 * laid out in its final position from the server render and only ever animates opacity/transform
 * (.ca-* in globals.css), so playing shifts nothing. Reduced motion renders the complete document
 * and no control; without JavaScript the control is hidden by CSS and the document simply reads.
 *
 * Honesty: the exchange is a composite of shipped behavior in the shipped order. The field-service
 * prompt triages for an emergency first, requires check_service_area before any time is offered,
 * requires get_available_slots before any time is spoken, reads the address and time back for a
 * yes before book_service_call, and the booking handler re-checks the area and the window at that
 * moment (src/verticals/archetypes/field-service/prompt.ts, src/lib/field-service-handlers.ts).
 * The greeting, the confirmation text and the notification title are the real templates rendered
 * in voice-data.ts. "Dana Whitfield" and "14 Larkspur Crescent" are fictional.
 */

type Speaker = "ai" | "caller";
type Line = { who: Speaker; text: ReactNode };
type Beat = { lead: string; note: ReactNode; lines: Line[] };

const NAMES: Record<Speaker, string> = { ai: "Alex", caller: "Dana" };
const LINE_MS = 1150;

function subscribeMotionPrefs(onChange: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
function motionPrefsSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function CallAnatomy({
  greeting,
  sms,
  notificationTitle,
  address,
  className = "",
}: {
  greeting: { before: string; after: string };
  sms: { before: string; after: string };
  notificationTitle: string;
  address: string;
  className?: string;
}) {
  const beats: Beat[] = [
    {
      lead: "Disclosure",
      note: <>Every greeting carries the recorded-line phrase. Setup refuses a greeting without it.</>,
      lines: [
        {
          who: "ai",
          text: (
            <>
              {greeting.before}
              <span className="rounded bg-brand-50 px-1 font-semibold text-brand-800">your business</span>
              {greeting.after}
            </>
          ),
        },
        { who: "caller", text: "Hi, it's Dana Whitfield. My kitchen sink is backed up and the disposal's dead. It's not an emergency, but could someone come this week?" },
      ],
    },
    {
      lead: "Triage",
      note: <>Every plumbing call is triaged before anything is booked. A burst pipe, flooding or a smell of gas would skip the calendar and alert you at once. A blocked sink books.</>,
      lines: [
        { who: "ai", text: "I can help with that. Before I book anything: is water coming up anywhere, or flooding?" },
        { who: "caller", text: "No, it just won't drain." },
      ],
    },
    {
      lead: "Service area",
      note: <>The address is geocoded and checked against your service radius before any time is offered. Outside it, the AI says so, books nothing, and offers to take a message.</>,
      lines: [
        { who: "ai", text: "What's the address, and is this the best number to reach you on?" },
        { who: "caller", text: `It's ${address}, in Whitby. And yes, this number is fine.` },
      ],
    },
    {
      lead: "Calendar read",
      note: <>Windows come from your schedule, minus anything busy on a connected Google Calendar, before one is spoken. A time is never guessed.</>,
      lines: [
        { who: "ai", text: "You're in our area. The earliest is tomorrow, 8 to 10 in the morning, or 1 to 3. Which suits?" },
        { who: "caller", text: "8 to 10, please." },
      ],
    },
    {
      lead: "Booked",
      note: (
        <>
          Read back and confirmed, then booked. The window and the address are re-checked at that moment, and the job lands in your schedule. You get an
          in-app notification: “{notificationTitle}”.
        </>
      ),
      lines: [
        { who: "ai", text: `So that's tomorrow between 8 and 10 at ${address}, for a blocked kitchen sink. Shall I book it?` },
        { who: "caller", text: "Yes, please." },
        { who: "ai", text: "Done. You're booked, and a text is on its way. Anything else I can help with?" },
        { who: "caller", text: "No, that's everything. Thanks." },
        { who: "ai", text: "Thanks for calling. Goodbye." },
      ],
    },
  ];

  /* Flat line index per beat, so the play position maps to beats and their notes. */
  const starts: number[] = [];
  let total = 0;
  for (const beat of beats) {
    starts.push(total);
    total += beat.lines.length;
  }
  const smsIndex = total; // the text arrives last

  const reduced = useSyncExternalStore(subscribeMotionPrefs, motionPrefsSnapshot, () => false);
  const [playing, setPlaying] = useState(false);
  const [played, setPlayed] = useState(false);
  const [pos, setPos] = useState(0);
  const timer = useRef<number>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const stop = () => {
    window.clearTimeout(timer.current);
    setPlaying(false);
  };

  const play = () => {
    window.clearTimeout(timer.current);
    setPos(0);
    setPlaying(true);
    setPlayed(true);
    let at = 0;
    const step = () => {
      at += 1;
      setPos(at);
      if (at <= smsIndex) timer.current = window.setTimeout(step, LINE_MS);
      else timer.current = window.setTimeout(() => setPlaying(false), 900);
    };
    timer.current = window.setTimeout(step, 500);
  };

  const lineOn = (i: number) => !playing || i < pos;
  const beatOn = (b: number) => !playing || pos > starts[b];

  return (
    <figure className={`ca rounded-3xl border border-gray-200 bg-surface ${playing ? "is-playing" : ""} ${className}`.trim()}>
      <figcaption className="sr-only">One example call, from greeting to confirmation text, annotated with what the system does at each beat.</figcaption>

      <div className="flex items-center justify-between gap-4 border-b border-gray-200 px-5 py-3 sm:px-6">
        <p className="text-sm text-gray-500">
          <span className="font-semibold text-ink">Transcript</span>
          <span className="hidden sm:inline">
            <span className="mx-1.5 text-gray-300" aria-hidden="true">
              /
            </span>
            9:04 PM, a plumbing line
          </span>
        </p>
        {!reduced && (
          <button
            type="button"
            onClick={playing ? stop : play}
            className="ca-play press h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-gray-300 bg-surface px-3.5 text-sm font-semibold text-ink transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            <DrawIcon name="phone" size={16} draw={false} className={playing ? "text-brand-600" : "text-gray-500"} />
            {playing ? "Skip to the end" : played ? "Play it again" : "Play the call"}
          </button>
        )}
      </div>

      <ol className="space-y-5 px-5 py-5 sm:px-6" aria-live={playing ? "off" : undefined}>
        {beats.map((beat, b) => (
          <li key={beat.lead} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3 sm:gap-x-4 lg:grid-cols-[1.5rem_minmax(0,1fr)_16rem] lg:gap-x-6">
            <span className={`ca-beat pt-0.5 text-sm font-bold tabular-nums leading-snug text-brand-700 ${beatOn(b) ? "is-on" : ""}`.trim()} aria-hidden="true">
              {b + 1}
            </span>

            <div className="max-w-[64ch] space-y-1.5">
              <span className="sr-only">Beat {b + 1}, {beat.lead}.</span>
              {beat.lines.map((line, j) => {
                const i = starts[b] + j;
                const ai = line.who === "ai";
                return (
                  <p
                    key={j}
                    className={`ca-line grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-2 text-[15px] leading-snug ${ai ? "" : "pl-4 sm:pl-6"} ${lineOn(i) ? "is-on" : ""}`.trim()}
                  >
                    <span className={`pt-px text-[11px] leading-snug ${ai ? "font-bold text-brand-700" : "font-semibold text-gray-400"}`}>{NAMES[line.who]}</span>
                    <span className={ai ? "text-ink" : "text-gray-600"}>{line.text}</span>
                  </p>
                );
              })}
            </div>

            <aside className={`ca-beat col-start-2 mt-2 self-start border-l-2 border-brand-200 pl-3 text-[13px] leading-snug text-gray-500 lg:col-start-3 lg:mt-0 ${beatOn(b) ? "is-on" : ""}`.trim()}>
              <span className="font-bold tabular-nums text-brand-700" aria-hidden="true">
                {b + 1}{" "}
              </span>
              <span className="font-semibold text-ink">{beat.lead}. </span>
              {beat.note}
            </aside>
          </li>
        ))}

        {/* The one message that follows: the caller's confirmation text, the real template. */}
        <li className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3 sm:gap-x-4 lg:grid-cols-[1.5rem_minmax(0,1fr)_16rem] lg:gap-x-6">
          <span className={`ca-beat pt-0.5 text-sm font-bold tabular-nums leading-snug text-brand-700 ${!playing || pos > smsIndex ? "is-on" : ""}`.trim()} aria-hidden="true">
            {beats.length + 1}
          </span>
          <div>
            <span className="sr-only">Beat {beats.length + 1}. The text message Dana receives:</span>
            <p className={`ca-line max-w-md rounded-2xl rounded-bl-md bg-brand-600 px-3.5 py-2 text-sm leading-snug text-white ${lineOn(smsIndex) ? "is-on" : ""}`.trim()}>
              {sms.before}
              <span className="rounded bg-white/15 px-1.5 py-0.5 font-semibold">Your business</span>
              {sms.after}
            </p>
          </div>
          <aside className={`ca-beat col-start-2 mt-2 self-start border-l-2 border-brand-200 pl-3 text-[13px] leading-snug text-gray-500 lg:col-start-3 lg:mt-0 ${!playing || pos > smsIndex ? "is-on" : ""}`.trim()}>
            <span className="font-bold tabular-nums text-brand-700" aria-hidden="true">
              {beats.length + 1}{" "}
            </span>
            <span className="font-semibold text-ink">The text. </span>
            The exact template the code sends, with your name in the slot. Reply CANCEL cancels the booking; STOP is honored. You are never texted: your side
            is the notification.
          </aside>
        </li>
      </ol>
    </figure>
  );
}
