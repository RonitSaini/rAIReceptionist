/**
 * Placement rules for the home page's masonry, kept apart from the JSX so they are testable and
 * so the guarantee is visible in one place: placement is a pure function of card STATE. Urgent
 * cards first (each home declares Needs-attention first, so an urgent one is always top-left),
 * content-bearing cards next, empty rows last — declaration order preserved within each state, so
 * identical data always produces the identical page.
 */

export type DashCardState = "urgent" | "content" | "empty";

const STATE_RANK: Record<DashCardState, number> = { urgent: 0, content: 1, empty: 2 };

/** Stable, non-mutating: identical input, identical placement. */
export function orderDashCards<T extends { state: DashCardState }>(cards: readonly T[]): T[] {
  return [...cards].sort((a, b) => STATE_RANK[a.state] - STATE_RANK[b.state]);
}
