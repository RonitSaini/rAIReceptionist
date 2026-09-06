/**
 * The interaction vocabulary is written twice on purpose — INTERACTION in src/lib/motion.ts for the
 * JS timers, --m-* on :root in globals.css for every transition and keyframe — and this keeps the
 * two the same table. Since the motion scale (spec §9) every scaled token is its *-base times
 * --m-scale, and the clamped ones (the fast step, the toggle thumb) must never read the scale at all.
 * Pure: no server, no database.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { INTERACTION } from "../src/lib/motion.ts";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, "../src/app/globals.css"), "utf8");

const token = (name) => {
  const m = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
  assert.ok(m, `globals.css defines --${name}`);
  return m[1].trim();
};

test("the scaled tokens are their bases times --m-scale, and the bases mirror INTERACTION", () => {
  assert.equal(token("m-scale"), "1");
  for (const [name, base] of [
    ["m-standard", INTERACTION.standard],
    ["m-slow", INTERACTION.slow],
    ["m-exit", INTERACTION.exit.standard],
    ["m-exit-slow", INTERACTION.exit.slow],
    ["m-stagger", INTERACTION.stagger],
    ["m-cascade", INTERACTION.cascade],
    ["m-arrive", INTERACTION.arrive],
    ["m-arrive-spread", INTERACTION.arriveSpread],
    ["m-arrive-group", INTERACTION.arriveGroup],
  ]) {
    assert.equal(token(`${name}-base`), `${base}ms`);
    assert.equal(token(name), `calc(var(--${name}-base) * var(--m-scale))`);
  }
  assert.equal(token("m-ease"), INTERACTION.ease);
  assert.equal(token("m-travel"), `${INTERACTION.travel}px`);
  assert.equal(token("m-rise"), `${INTERACTION.rise}px`);
  assert.equal(token("m-arrive-y"), `${INTERACTION.arriveY}px`);
});

test("the clamped tokens never read the scale", () => {
  assert.equal(token("m-fast"), `${INTERACTION.fast}ms`);
  assert.equal(token("m-exit-fast"), `${INTERACTION.exit.fast}ms`);
  assert.equal(token("m-toggle"), `${INTERACTION.toggle}ms`);
  // The route skeleton's hold is a THRESHOLD, not a duration: scaling it would turn a fast route into
  // a blank pause instead of into a longer arrival.
  assert.equal(token("m-hold"), `${INTERACTION.hold}ms`);
  // And nothing else in the stylesheet multiplies the fast step, the thumb or the hold by the scale.
  assert.ok(!/--m-fast[^;]*--m-scale|--m-exit-fast[^;]*--m-scale|--m-toggle[^;]*--m-scale|--m-hold[^;]*--m-scale/.test(css));
  // Urgent surfaces read only the clamped tokens.
  for (const m of css.matchAll(/\[data-urgent\][^{]*\{([^}]*)\}/g)) {
    assert.ok(!/--m-(standard|slow|exit|exit-slow|stagger|cascade)(?![\w-])/.test(m[1]), `urgent rule reads only fast tokens: ${m[1].trim()}`);
  }
});

test("the ladder is a ladder and exits are shorter", () => {
  assert.ok(INTERACTION.fast < INTERACTION.standard && INTERACTION.standard < INTERACTION.slow);
  assert.ok(INTERACTION.exit.fast < INTERACTION.fast);
  assert.ok(INTERACTION.exit.standard < INTERACTION.standard);
  assert.ok(INTERACTION.exit.slow < INTERACTION.slow);
  // Exits stay about two thirds of their entrance, so they stay shorter at every scale (both sides scale together).
  assert.ok(INTERACTION.exit.standard / INTERACTION.standard <= 0.7 && INTERACTION.exit.slow / INTERACTION.slow <= 0.7);
  assert.ok(INTERACTION.toggle <= INTERACTION.standard, "the toggle thumb is never slower than standard");
});

test("a guided arrival fits its window and adds no durations", () => {
  // Three groups at the standard step, two stagger gaps: 700–850 ms in total at scale 1 (spec §8.1 after the 1.6× pick).
  const total = 2 * INTERACTION.stagger + INTERACTION.standard;
  assert.ok(total >= 700 && total <= 850, `guided total ${total}ms`);
  // Ten picker cards at the standard step, one cascade gap apart, starting with group two: assembled by ~1,130 ms.
  const grid = INTERACTION.stagger + 9 * INTERACTION.cascade + INTERACTION.standard;
  assert.ok(grid >= 1050 && grid <= 1200, `cascade total ${grid}ms`);
  assert.ok(INTERACTION.cascade < INTERACTION.stagger && INTERACTION.stagger < INTERACTION.standard);
});

test("a content arrival fits its 600-850 ms window and the page's exit stays under 200 ms", () => {
  // A capped cascade: the last staggered element starting at `cap` spreads and running for `arrive`.
  // The cap is what makes this a BUDGET rather than a function of row count — element nine onward all
  // leave with element nine, so a four-hundred-row list arrives in the same window as an eight-row one.
  const budget = INTERACTION.arrive + INTERACTION.arriveCap * INTERACTION.arriveSpread;
  assert.ok(budget >= 600 && budget <= 900, `arrival budget ${budget}ms`);
  // Home is two groups: the KPI row, then the cards trailing it. Still inside the same window.
  const home = INTERACTION.arriveGroup + INTERACTION.arrive + INTERACTION.arriveCap * INTERACTION.arriveSpread;
  assert.ok(home <= 1100, `home two-group total ${home}ms`);
  // Beat two is CLAMPED to the fast exit, so no scale can push the page's leave past the 200 ms
  // ceiling or let it become something a route change could be felt waiting on.
  assert.ok(INTERACTION.exit.fast < 200);
  assert.match(css, /\.page-enter\[data-leaving\]\s*\{[^}]*--m-exit-fast/);
  // One element's arrival is quicker than the ladder's standard step: many of them overlap, and the
  // spread is what carries the reading order rather than each row taking the long way in.
  assert.ok(INTERACTION.arrive < INTERACTION.standard);
  assert.ok(INTERACTION.arriveSpread < INTERACTION.arrive);
});

test("a route skeleton can never be painted partially", () => {
  // The measured regression this guards: a 480 ms fade-up on the skeleton was caught 48 ms in by the
  // content landing, painting it at 0.292 opacity for two frames — a ghost that appears and vanishes.
  // The appearance must therefore be a STEP shorter than one frame, not a fade, so that no route
  // timing can sample an in-between opacity.
  const rule = css.match(/\.route-skeleton\s*\{([^}]*)\}/);
  assert.ok(rule, "globals.css defines .route-skeleton");
  const decl = rule[1];
  assert.match(decl, /opacity:\s*0\s*;/, "it starts invisible");
  const anim = decl.match(/animation:\s*([^;]+);/);
  assert.ok(anim, ".route-skeleton declares an animation");
  // The duration is the FIRST time in the shorthand and the delay the second: a step, then the hold.
  const times = anim[1].match(/(\d+(?:\.\d+)?)(ms|s)|var\(--m-hold\)/g) ?? [];
  assert.equal(times[0], "1ms", `the appearance is a step, not a fade (got ${times[0]})`);
  assert.ok(anim[1].includes("var(--m-hold)"), "the delay is the clamped threshold");
  assert.ok(/forwards|both/.test(anim[1]), "it holds the appeared state");
  // And the threshold sits well past a typical route: an ordinary navigation must reveal no skeleton.
  assert.ok(INTERACTION.hold >= 600, `the hold clears typical route resolution (${INTERACTION.hold}ms)`);
  // Reduced motion must still land it VISIBLE, since the base rule now hides it.
  const reduce = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduce, /\.route-skeleton\s*\{\s*opacity:\s*1/, "reduced motion lands the skeleton visible, not on its hidden base state");
});

test("an alarm and an empty state are never staggered", () => {
  // Rule 17, in the stylesheet: whatever the arrival variant, a row that declares itself urgent (or a
  // slot that is empty) is complete at t=0 — no delay to sit behind, nothing hidden to fade up from.
  const exempt = css.match(/\[data-arrival\] > \[data-urgent\],[\s\S]{0,200}?\}/);
  assert.ok(exempt, "the stylesheet exempts [data-urgent] inside an arrival");
  assert.match(exempt[0], /animation:\s*none/);
  assert.match(exempt[0], /opacity:\s*1/);
  assert.match(exempt[0], /transform:\s*none/);
  assert.match(exempt[0], /\[data-empty\]/);
});

test("an arrived row can still be moved: entrances never fill forwards", () => {
  // The measured regression this guards (spec §12.3): `[data-arrival] > *` filled `both`, and a
  // finished animation that still fills outranks an inline style — so every row that had arrived
  // ignored the FLIP transform <MotionList> writes when a neighbour leaves, and jumped. Only the
  // urgent rows, exempt from the arrival, could slide. An entrance whose end state is the element's
  // own state has nothing to hold: it fills backwards (the stagger delay) and lets go.
  for (const selector of ["[data-arrival] > *", ".row-enter"]) {
    const rule = css.match(new RegExp(`${selector.replace(/[[\]*.>]/g, (c) => `\\${c}`)}\\s*\\{([^}]*)\\}`));
    assert.ok(rule, `globals.css defines ${selector}`);
    const anim = rule[1].match(/animation:\s*([^;]+);/);
    assert.ok(anim, `${selector} declares an animation`);
    assert.match(anim[1], /\bbackwards\b/, `${selector} fills backwards`);
    assert.doesNotMatch(anim[1], /\b(both|forwards)\b/, `${selector} must not keep filling after it ends`);
  }
});

test("every interaction class is in the reduced-motion block", () => {
  const reduce = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  for (const cls of [".press", ".press-soft", ".switch", ".check", ".check-box", ".check-box path", ".check:has(.check-input:active)", ".seg-ind", ".seg-item", ".row-enter", ".row-exit", ".badge-swap > .badge-in", ".badge-swap > .badge-out", ".tick-in", ".tick-out", ".toast", ".content-in", ".menu-in", ".menu-out", ".draw-fast.is-drawing path", ".saved-in", ".notif-panel", ".swap", ".guided [data-guided]", ".guided .cascade > *", ".guided[data-leaving]", ".slide-in", ".progress-fill", "[data-arrival] > *", ".nav-pill", ".nav-tab-ind", ".route-skeleton", ".page-enter[data-leaving]"]) {
    assert.ok(reduce.includes(cls), `${cls} is listed under prefers-reduced-motion`);
  }
});

test("a checkbox answers at the fast step, clamped, and its tick is drawn rather than switched on", () => {
  // Spec section 14: the box and the mark read only the clamped fast tokens (a checkbox is press
  // feedback and never slows with the scale); the mark is a stroke that draws (dashoffset 1 to 0)
  // at the fast step and un-draws at the fast exit, so unchecking is quicker than checking.
  const rules = [...css.matchAll(/(?<=\})([^{}]*\.check\b[^{}]*)\{([^}]*)\}/g)].map((m) => ({ sel: m[1].trim(), decl: m[2] }));
  assert.ok(rules.length >= 7, `globals.css times the checkbox (${rules.length} rules)`);
  for (const r of rules) {
    assert.ok(!/--m-(standard|slow|exit|exit-slow|stagger|cascade|arrive|arrive-spread|arrive-group|toggle)(?![\w-])/.test(r.decl), `a checkbox rule reads only the fast tokens: ${r.sel}`);
  }
  const mark = rules.find((r) => /\.check-box path$/.test(r.sel));
  assert.ok(mark, "the mark is styled");
  assert.match(mark.decl, /stroke-dasharray:\s*1\s*;/);
  assert.match(mark.decl, /stroke-dashoffset:\s*1\s*;/, "at rest the mark is undrawn");
  assert.match(mark.decl, /transition-property:\s*stroke-dashoffset/, "the mark animates by its stroke");
  assert.match(mark.decl, /transition-duration:\s*var\(--m-exit-fast\)/, "the un-draw runs at the fast exit");
  const drawn = rules.find((r) => /:checked[^{]*\.check-mark/.test(r.sel));
  assert.ok(drawn, "the checked state draws the mark");
  assert.match(drawn.decl, /stroke-dashoffset:\s*0\s*;/);
  assert.match(drawn.decl, /transition-duration:\s*var\(--m-fast\)/, "the draw runs at the fast step");
  // The state rules set DURATIONS only: a shorthand there would outrank the reduce block's `transition: none`.
  for (const r of rules.filter((x) => /:checked|:indeterminate/.test(x.sel))) assert.doesNotMatch(r.decl, /transition:/, `state rules never re-declare the shorthand: ${r.sel}`);
  assert.ok(INTERACTION.exit.fast < INTERACTION.fast, "uncheck leaves faster than check arrives");
  const press = rules.find((r) => /\.check:has\(\.check-input:active\)$/.test(r.sel) && !r.sel.includes("prefers"));
  assert.ok(press && /scale\(/.test(press.decl) && /60ms/.test(press.decl), "the wrapper presses with the 60 ms down-stroke");
  const reduce = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduce, /\.check:has\(\.check-input:active\)\s*\{\s*transform:\s*none/, "reduced motion: no press either");
});
