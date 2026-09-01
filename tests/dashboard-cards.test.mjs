import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * Home-page placement is deterministic from card state alone: urgent first, content next, empty
 * last, declaration order preserved within a state. The homes declare Needs-attention first, so an
 * urgent one is always the first card — top-left in the masonry, whose columns fill in DOM order.
 */

const { orderDashCards } = await import("../src/lib/dashboard-cards.ts");

const card = (key, state) => ({ key, state });

test("urgent first, content next, empty last — declaration order kept within each state", () => {
  const declared = [card("attention", "urgent"), card("callbacks", "content"), card("today", "empty"), card("waiting", "content"), card("week", "empty"), card("ahead", "content")];
  assert.deepEqual(orderDashCards(declared).map((c) => c.key), ["attention", "callbacks", "waiting", "ahead", "today", "week"]);
});

test("an urgent Needs-attention card is always first, whatever else exists", () => {
  const declared = [card("attention", "urgent"), card("callbacks", "content"), card("today", "content"), card("orders", "content")];
  assert.equal(orderDashCards(declared)[0].key, "attention");
});

test("identical input always produces identical placement, and the input is not mutated", () => {
  const declared = [card("a", "empty"), card("b", "urgent"), card("c", "content")];
  const first = orderDashCards(declared).map((c) => c.key);
  const second = orderDashCards(declared).map((c) => c.key);
  assert.deepEqual(first, second);
  assert.deepEqual(declared.map((c) => c.key), ["a", "b", "c"], "the declared array must not be reordered in place");
});
