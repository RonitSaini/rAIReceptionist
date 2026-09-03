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
 *   The page's own exit lives here too (spec §10 beat two): a leave is never waited on, so it can
 *   never be allowed to grow with the scale.
 * - standard: expands, menus, toasts, rows arriving, badges crossfading, the tab indicator sliding.
 * - slow: the ceiling; sheets and drawers, the one-step progress bar. Nothing in the app exceeds it.
 * - exits: shorter than their entrance (about two thirds), so what leaves is out of the way before
 *   what replaces it has finished arriving.
 *
 * Urgent surfaces (dispatch queue rows, EMERGENCY, unacknowledged escalations, "caller not notified")
 * take only the quiet end of this ladder — press and status advance at `fast`, no soft arrival — so
 * nothing here can dilute what they already say with colour.
 *
 * The funnel's guided arrivals (spec §8) run on the same durations; the two extra numbers are GAPS —
 * how far group two and three trail group one, and how far each picker card trails the one before.
 *
 * Rebalanced for visibility on 2026-09-02 (spec §9): standard 220 → 300, slow 300 → 450, exits kept at
 * about two thirds, stagger 60 → 90, cascade 20 → 35, travel 16 → 24 px; then the owner's 1.6× pick was
 * baked in on 2026-09-03 (standard 480, slow 720, exits 320 / 480, stagger 144, cascade 56). These are the BASES: the CSS
 * multiplies every scaled token by --m-scale (1; a rebalance comparison may set it on <html>), and `scaled()` below gives
 * a JS timer the same number the CSS is running. `fast`, its exit and `toggle` are CLAMPED — never
 * scaled — so no knob value can gate input or slow an alarm.
 */
export const INTERACTION = {
  fast: 150,
  standard: 480,
  slow: 720,
  exit: { fast: 100, standard: 320, slow: 480 },
  /** The toggle thumb's travel: clamped, a toggle answers a flick at the same speed at every scale. */
  toggle: 220,
  /** Guided entrance geometry (px, not durations): travel along the corridor and the plain rise. */
  travel: 24,
  rise: 12,
  ease: "cubic-bezier(0.22, 1, 0.36, 1)",
  /** How long a success toast holds before it leaves. */
  toastHold: 4000,
  /** How long the submit button reads "Saved" with its drawn check before it offers "Save" again. */
  savedHold: 2000,
  /** Guided arrivals (spec §8): the second and third groups of a page trail the first by this much. */
  stagger: 144,
  /** The profession picker's cascade: each card trails the one before by this much, at `standard`. */
  cascade: 56,

  /* ---- Content arrival (spec §10): how a page's DATA becomes visible after a navigation ---- */
  /** One arriving element's own duration. Shorter than `standard`: many of them overlap. */
  arrive: 460,
  /** The gap between one arriving element and the next — a list's cascade, a calendar's columns. */
  arriveSpread: 55,
  /** How far a second group trails the first (Home: the KPI row, then the cards). */
  arriveGroup: 110,
  /**
   * The stagger CAP, in steps. Element nine onward all leave with element nine, so the arrival
   * budget is `arrive + cap * arriveSpread` (900 ms at scale 1) no matter how long the list is.
   */
  arriveCap: 8,
  /** How far arriving content travels (px). The corridor picks the sign; the layout box never moves. */
  arriveY: 10,
  /**
   * CLAMPED THRESHOLD: how long a route skeleton stays invisible before it appears, in ONE STEP.
   *
   * Set well past typical route resolution (dev resolves about 300 ms after commit), so an ordinary
   * navigation shows no skeleton at all and only a genuinely slow route reveals one — by which point
   * it is on screen long enough to read as intentional. Raised 250 → 700 on 2026-09-03: at 250 the
   * hold expired just before the content landed and the skeleton was painted at 0.292 opacity for two
   * frames, a ghost. The appearance is a step rather than a fade for the same reason — see the
   * `.route-skeleton` comment in globals.css.
   */
  hold: 700,
} as const;

/**
 * The arrival budget at the live scale (ms): the last element of a capped cascade finishing. What the
 * spec's 600–900 ms window is measured against, and what a harness should compare a frame series to.
 */
export function arrivalBudget(): number {
  return scaled(INTERACTION.arrive + INTERACTION.arriveCap * INTERACTION.arriveSpread);
}

/** Client-only: the live `--m-scale` (1 unless a rebalance comparison set it on <html>, spec §9.3). */
export function motionScale(): number {
  if (typeof document === "undefined") return 1;
  const v = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--m-scale"));
  return Number.isFinite(v) && v > 0 ? v : 1;
}

/**
 * A scaled ladder duration as the CSS is actually running it: the base times the live scale. For the JS
 * timers that must agree with a CSS animation (how long a leaving node stays mounted). Clamped values —
 * `fast`, `exit.fast`, `toggle` — never pass through here.
 */
export function scaled(ms: number): number {
  return Math.round(ms * motionScale());
}

/** Client-only: true when the visitor asked for reduced motion (every state change then lands at once). */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
}

/**
 * Client-only: the guided container around `from` (an onboarding step) steps aside in the direction of
 * travel while the route changes — 8 px along the corridor, dimmed to the pending state, at the exit step
 * (spec §8.3). Never awaited: the caller navigates in the same tick, and the route lands whenever it lands.
 */
export function leaveGuided(from: Element, dir: "forward" | "back"): void {
  from.closest(".guided")?.setAttribute("data-leaving", dir);
}

/**
 * Client-only: beat two of the navigation gesture (spec §10). The page currently on screen steps aside
 * along the corridor — 6 px against the direction of travel, dimmed — at the CLAMPED fast exit (100 ms,
 * so it is under the 200 ms ceiling at every scale).
 *
 * Never awaited, by design: the caller's `<Link>` navigates in the same tick and the route lands whenever
 * it lands. If it lands within a frame the leave is simply cut, which is the correct outcome — the exit
 * exists to cover a wait, never to create one. The container is found by class rather than passed in
 * because the rail and the page live in different trees (the rail is in the layout, the page under the
 * template), and there is exactly one `.page-enter` on screen.
 */
export function leavePage(dir: "down" | "up"): void {
  if (typeof document === "undefined") return;
  document.querySelector(".page-enter")?.setAttribute("data-leaving", dir);
}
