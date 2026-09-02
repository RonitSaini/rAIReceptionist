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
  ]) {
    assert.equal(token(`${name}-base`), `${base}ms`);
    assert.equal(token(name), `calc(var(--${name}-base) * var(--m-scale))`);
  }
  assert.equal(token("m-ease"), INTERACTION.ease);
  assert.equal(token("m-travel"), `${INTERACTION.travel}px`);
  assert.equal(token("m-rise"), `${INTERACTION.rise}px`);
});

test("the clamped tokens never read the scale", () => {
  assert.equal(token("m-fast"), `${INTERACTION.fast}ms`);
  assert.equal(token("m-exit-fast"), `${INTERACTION.exit.fast}ms`);
  assert.equal(token("m-toggle"), `${INTERACTION.toggle}ms`);
  // And nothing else in the stylesheet multiplies the fast step or the thumb by the scale.
  assert.ok(!/--m-fast[^;]*--m-scale|--m-exit-fast[^;]*--m-scale|--m-toggle[^;]*--m-scale/.test(css));
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

test("every interaction class is in the reduced-motion block", () => {
  const reduce = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  for (const cls of [".press", ".press-soft", ".switch", ".seg-ind", ".seg-item", ".row-enter", ".row-exit", ".badge-swap > .badge-in", ".badge-swap > .badge-out", ".tick-in", ".tick-out", ".toast", ".content-in", ".menu-in", ".menu-out", ".draw-fast.is-drawing path", ".saved-in", ".notif-panel", ".swap", ".guided [data-guided]", ".guided .cascade > *", ".guided[data-leaving]", ".slide-in", ".progress-fill"]) {
    assert.ok(reduce.includes(cls), `${cls} is listed under prefers-reduced-motion`);
  }
});
