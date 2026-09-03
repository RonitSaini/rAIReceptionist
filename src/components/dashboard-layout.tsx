import type { ReactNode } from "react";
import Link from "next/link";
import { orderDashCards, type DashCardState } from "@/lib/dashboard-cards";

/**
 * The home page's card region, shared by every archetype.
 *
 * Cards declare what they ARE — urgent, content-bearing, or empty — and placement follows from
 * that alone: urgent first (each home declares its Needs-attention card first, so an urgent one is
 * always top-left), content next, empty rows last. The sort is stable, so identical data always
 * produces the identical page, server-rendered, with nothing measured or moved after paint.
 *
 * The two-column packing itself is CSS multi-column (`.dash-masonry` in globals.css): each column
 * is an independent vertical stack with a uniform gap, so a tall card in one column never opens a
 * hole beside it, and on mobile the same DOM collapses to a single ordered column. An empty card
 * renders as a compact single-line row instead of a full-height box — a chart with nothing in
 * range collapses exactly the same way.
 */

export type DashCard = {
  key: string;
  state: DashCardState;
  /** The full card, for urgent and content states. */
  node?: ReactNode;
  /** The compact single-line row an empty card collapses to. */
  empty?: { text: ReactNode; href?: string; cta?: string };
};

function EmptyRow({ text, href, cta }: NonNullable<DashCard["empty"]>) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-gray-200 bg-surface px-4 py-2.5">
      <p className="truncate text-sm text-gray-500">{text}</p>
      {href && cta ? (
        <Link href={href} className="shrink-0 text-sm font-semibold text-brand-700">
          {cta}
        </Link>
      ) : null}
    </div>
  );
}

/**
 * Home's cards are the SECOND arriving group: they trail the KPI row rather than racing it (motion
 * spec §10.2). They settle in placement order — which is the sort above, so an urgent card is first
 * and is exempted from the stagger besides. A collapsed empty row is marked `data-empty` and is
 * simply there: a dashed "nothing here yet" has nothing to settle in, and animating one would put
 * motion on the absence of data.
 */
export function DashboardMasonry({ cards }: { cards: readonly DashCard[] }) {
  const ordered = orderDashCards(cards);
  return (
    <div data-arrival="cards" className="dash-masonry">
      {ordered.map((c) => (
        <div key={c.key} className="dash-slot" data-empty={c.state === "empty" ? "true" : undefined} data-urgent={c.state === "urgent" ? "true" : undefined}>
          {c.state === "empty" ? <EmptyRow {...(c.empty ?? { text: "Nothing here yet." })} /> : c.node}
        </div>
      ))}
    </div>
  );
}
