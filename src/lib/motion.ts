import type { CSSProperties } from "react";

/**
 * Motion constants. The landing hero's choreography is tuned HERE and nowhere else: every beat time
 * and duration below reaches the CSS as a custom property (`--seq` start, `--dur` duration, `--cd-*`
 * for the call demo) and the JS-timed beats (conversation, word rotation) read the same numbers, so
 * the next adjustment is numbers in this file, not archaeology. The timeline is drawn in
 * docs/frontdesk-motion-spec.md (landing pass 8).
 *
 * The principle: one thing moves at a time. Each element (or tight group) begins only once the one
 * before it is at least three-quarters home; starts are spaced 250 ms apart, and every move runs for
 * exactly two gaps (500 ms), so at most two things are ever in motion at once and the eye can follow
 * the sequence element by element. Strict reading order: pill, headline line one, headline line two,
 * subhead, CTAs with the check-row, phone frame, first conversation line, the strip's first node, and
 * last the scroll cue. Every move is the house expo-out (fast arrival, soft landing): 96% home at
 * half its duration, 98% at 60%. The settle window governs CONTENT: everything a visitor reads or
 * clicks has landed when the phone lands; the cue is a coda and follows it on purpose (spec rule 14).
 *
 * Clock: beats are measured on the SEQUENCE CLOCK, the first styled frame, which is when the browser
 * creates the hero's CSS animations (their shared startTime) and what every `--seq` delay counts from.
 * The JS beats read that clock via `sequenceOrigin()` so both sides agree whatever the stylesheet's
 * arrival time; a slow hydration can only start the conversation later, never in a frame still arriving.
 */

/** One timed move: when it starts (ms on the sequence clock) and how long it runs (ms). */
export type Beat = { at: number; ms: number };

export const HERO_TIMING = {
  /* ---- Entrance: CSS-timed (.hero-slide / .hero-seq), `at` is the stillness before the first move ---- */
  pill: { at: 350, ms: 500 }, // stillness beat, then the pill slides in from the clip edge
  lineOne: { at: 600, ms: 500 }, // +250
  lineTwo: { at: 850, ms: 500 }, // +250
  subhead: { at: 1150, ms: 500 }, // +300: only once line two has essentially landed (98% home)
  ctas: { at: 1400, ms: 500 }, // +250, one block with the check-row
  phone: { at: 1650, ms: 500 }, // +250; lands at 2150 — the page is settled, bar the conversation
  cue: { at: 2400, ms: 500 }, // +250 after the strip's first node begins; the coda, deliberately post-settle (lg and up)

  /* ---- Conversation, inside the phone: JS-timed by <CallDemo> on the sequence clock ---- */
  firstLine: 1900, // +250 after the phone starts rising; the greeting bubble
  minStart: 300, // if hydration is later than firstLine, the call starts this long after mount
  line: 1400, // one bubble per beat
  bubble: 350, // a bubble's arrival (the house entrance) — reaches the CSS as --cd-bubble
  stripLag: 250, // a strip node lights this long AFTER the bubble that earns it begins
  segment: 550, // the connector fill toward a lit node — reaches the CSS as --cd-segment
  chip: 900, // the outcome chips after the last line, one pop each

  /* ---- The rotating word in the pill (<WordCarousel>) ---- */
  wordFirstRotation: 2900, // holds until the whole entrance has landed (cue.at + cue.ms)
  wordInterval: 2800, // two conversation beats, so a rotation never lands on a bubble
} as const;

/** Inline vars for a sequenced element: `--seq` (start) and `--dur` (duration) for the hero CSS. */
export function beatVars({ at, ms }: Beat): CSSProperties {
  return { "--seq": `${at}ms`, "--dur": `${ms}ms` } as CSSProperties;
}

/**
 * The sequence clock's origin in document time (ms, the `performance.now()` basis): the startTime of
 * the CSS animation on the nearest sequenced ancestor of `from`. Client-only. Falls back to 0 —
 * navigation start, which the first styled frame can only follow — when there is no animation to read
 * (not hydrated yet, or the element is not inside the sequence).
 */
export function sequenceOrigin(from: Element | null | undefined): number {
  const host = from?.closest(".hero-seq, .hero-slide");
  const start = host?.getAnimations()[0]?.startTime;
  return typeof start === "number" ? start : 0;
}

/**
 * The interaction vocabulary: how the app answers a click (docs/frontdesk-motion-spec.md §7).
 *
 * A three-step duration ladder and one decelerating ease. Every value here is mirrored as a CSS
 * custom property in globals.css (`--m-fast`, `--m-standard`, `--m-slow`, `--m-exit-*`, `--m-ease`)
 * and tests/motion-vocabulary.test.mjs fails if the two drift. CSS reads the variables; the JS timers
 * that must agree with them (how long a leaving row stays mounted, when a toast lets go) read this.
 *
 * - fast: presses, toggles, hovers, colour swaps — feedback that must feel attached to the finger.
 * - standard: expands, menus, toasts, rows arriving, badges crossfading, the tab indicator sliding.
 * - slow: the ceiling; sheets and drawers, the one-step progress bar. Nothing in the app exceeds it.
 * - exits: shorter than their entrance (about two thirds), so what leaves is out of the way before
 *   what replaces it has finished arriving.
 *
 * Urgent surfaces (dispatch queue rows, EMERGENCY, unacknowledged escalations, "caller not notified")
 * take only the quiet end of this ladder — press and status advance at `fast`, no soft arrival — so
 * nothing here can dilute what they already say with colour.
 */
export const INTERACTION = {
  fast: 150,
  standard: 220,
  slow: 300,
  exit: { fast: 100, standard: 150, slow: 200 },
  ease: "cubic-bezier(0.22, 1, 0.36, 1)",
  /** How long a success toast holds before it leaves. */
  toastHold: 4000,
  /** How long the submit button reads "Saved" with its drawn check before it offers "Save" again. */
  savedHold: 2000,
} as const;

/** Client-only: true when the visitor asked for reduced motion (every state change then lands at once). */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
}
