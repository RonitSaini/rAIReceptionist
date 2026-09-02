import Link from "next/link";
import type { ReactNode } from "react";
import { CountUp } from "@/components/count-up";
import { DrawIcon } from "@/components/draw-icon";
import type { IconName } from "@/components/icon-paths";

/** KPI tile: one hero number, a label, and an optional comparison line. */
export function StatTile({
  label,
  value,
  delta,
  note,
  href,
  icon,
  live,
  format,
}: {
  label: string;
  value: number;
  delta?: { value: number; label: string } | null;
  note?: ReactNode;
  href: string;
  /** Static (non-drawing) line icon: it just appears with the tile. */
  icon?: IconName;
  /** Value that can change while mounted — animates the changed digits instead of re-tweening. */
  live?: boolean;
  format?: (n: number) => string;
}) {
  const up = delta && delta.value > 0;
  const down = delta && delta.value < 0;
  return (
    <Link href={href} className="lift block rounded-2xl border border-gray-200 bg-surface p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
        {icon ? <DrawIcon name={icon} size={18} draw={false} className="text-gray-400" /> : null}
      </div>
      <p className="mt-1 text-3xl font-black tracking-tight text-ink">
        <CountUp to={value} format={format} live={live} />
      </p>
      {delta ? (
        <p className={`mt-1 text-xs font-semibold ${up ? "text-green-700" : down ? "text-red-700 dark:text-red-400" : "text-gray-500"}`}>
          {up ? "▲" : down ? "▼" : "•"} {Math.abs(delta.value)} {delta.label}
        </p>
      ) : note ? (
        <p className="mt-1 text-xs text-gray-500">{note}</p>
      ) : null}
    </Link>
  );
}
