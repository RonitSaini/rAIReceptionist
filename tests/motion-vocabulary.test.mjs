/**
 * The interaction vocabulary is written twice on purpose — INTERACTION in src/lib/motion.ts for the
 * JS timers, --m-* on :root in globals.css for every transition and keyframe — and this keeps the
 * two the same table. Pure: no server, no database.
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

test("the CSS tokens mirror INTERACTION", () => {
  assert.equal(token("m-fast"), `${INTERACTION.fast}ms`);
  assert.equal(token("m-standard"), `${INTERACTION.standard}ms`);
  assert.equal(token("m-slow"), `${INTERACTION.slow}ms`);
  assert.equal(token("m-exit-fast"), `${INTERACTION.exit.fast}ms`);
  assert.equal(token("m-exit"), `${INTERACTION.exit.standard}ms`);
  assert.equal(token("m-exit-slow"), `${INTERACTION.exit.slow}ms`);
  assert.equal(token("m-ease"), INTERACTION.ease);
  assert.equal(token("m-stagger"), `${INTERACTION.stagger}ms`);
  assert.equal(token("m-cascade"), `${INTERACTION.cascade}ms`);
});

test("a guided arrival fits its window and adds no durations", () => {
  // Three groups at the standard step, two stagger gaps: 300–400 ms in total (spec §8.1).
  const total = 2 * INTERACTION.stagger + INTERACTION.standard;
  assert.ok(total >= 300 && total <= 400, `guided total ${total}ms`);
  // Ten picker cards at the fast step, one cascade gap apart: the grid is assembled inside 400 ms.
  const grid = 9 * INTERACTION.cascade + INTERACTION.fast;
  assert.ok(grid <= 400, `cascade total ${grid}ms`);
  assert.ok(INTERACTION.stagger < INTERACTION.fast && INTERACTION.cascade < INTERACTION.stagger);
});

test("the ladder is a ladder and exits are shorter", () => {
  assert.ok(INTERACTION.fast < INTERACTION.standard && INTERACTION.standard < INTERACTION.slow);
  assert.ok(INTERACTION.exit.fast < INTERACTION.fast);
  assert.ok(INTERACTION.exit.standard < INTERACTION.standard);
  assert.ok(INTERACTION.exit.slow < INTERACTION.slow);
});

test("every interaction class is in the reduced-motion block", () => {
  const reduce = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  for (const cls of [".press", ".press-soft", ".switch", ".seg-ind", ".seg-item", ".row-enter", ".row-exit", ".badge-swap > .badge-in", ".badge-swap > .badge-out", ".tick-in", ".tick-out", ".toast", ".content-in", ".menu-in", ".menu-out", ".draw-fast.is-drawing path", ".saved-in", ".notif-panel", ".swap", ".guided [data-guided]", ".guided .cascade > *", ".guided[data-leaving]", ".slide-in", ".progress-fill"]) {
    assert.ok(reduce.includes(cls), `${cls} is listed under prefers-reduced-motion`);
  }
});
