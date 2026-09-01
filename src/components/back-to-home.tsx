import Link from "next/link";
import { DrawIcon } from "@/components/draw-icon";

/**
 * Way back to the landing page from pages reached off it (signup, privacy, terms).
 * Default: a fixed top-left icon button mirroring the fixed theme toggle's chrome (motion spec §3 —
 * hover is colors only, the icon never draws on hover). `inline` renders an icon + "Back" text link
 * for document pages whose left-aligned header a fixed corner button would overlap on phones.
 */
export function BackToHome({ inline = false }: { inline?: boolean }) {
  if (inline) {
    return (
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600 transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 rounded-xl"
      >
        <DrawIcon name="arrow-left" size={16} draw={false} />
        Back
      </Link>
    );
  }
  return (
    <div className="fixed left-4 top-4 z-10">
      <Link
        href="/"
        aria-label="Back to the landing page"
        title="Back"
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-300 bg-surface text-ink transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
      >
        <DrawIcon name="arrow-left" size={18} draw={false} />
      </Link>
    </div>
  );
}
