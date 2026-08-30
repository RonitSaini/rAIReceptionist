import { ChartTooltip } from "@/components/chart-tooltip";

/**
 * Small server-rendered SVG charts following the data-viz method: thin marks, 2px surface
 * gaps between stacked segments, rounded data-ends, recessive grid, selective direct labels,
 * legend for >= 2 series, hover tooltips via <ChartTooltip>, and a hidden table for screen readers.
 */

export type Series = { key: string; label: string; color: string };
export type StackedDay = { label: string; sublabel?: string; values: Record<string, number>; highlight?: boolean };

function niceMax(v: number): number {
  if (v <= 4) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const step = n <= 2 ? 0.5 : n <= 5 ? 1 : 2;
  return Math.ceil(n / step) * step * p;
}

const W = 600;
const H = 200;
const PAD = { top: 22, right: 8, bottom: 30, left: 30 };

/** Stacked columns (one column per day, segments per series). */
export function StackedColumns({ days, series, title, unit = "" }: { days: StackedDay[]; series: Series[]; title: string; unit?: string }) {
  const totals = days.map((d) => series.reduce((s, k) => s + (d.values[k.key] ?? 0), 0));
  const max = niceMax(Math.max(1, ...totals));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / days.length;
  const barW = Math.min(40, slot * 0.6);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];
  const seriesTotals = series.map((s) => ({ ...s, total: days.reduce((a, d) => a + (d.values[s.key] ?? 0), 0) }));

  return (
    <ChartTooltip>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={title}>
        <title>{title}</title>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--viz-grid)" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--color-gray-500)">
              {Number.isInteger(t) ? t : t.toFixed(1)}
            </text>
          </g>
        ))}
        {days.map((d, i) => {
          const x = PAD.left + slot * i + (slot - barW) / 2;
          let acc = 0;
          const total = totals[i];
          return (
            <g key={d.label + i}>
              {series.map((s, si) => {
                const v = d.values[s.key] ?? 0;
                if (v <= 0) return null;
                const y1 = y(acc + v);
                const y0 = y(acc);
                acc += v;
                const isTop = acc === total;
                const gap = si > 0 ? 2 : 0; // 2px surface gap between stacked segments
                const h = Math.max(0, y0 - y1 - gap);
                return (
                  <rect
                    key={s.key}
                    x={x}
                    y={y1}
                    width={barW}
                    height={h}
                    rx={isTop ? 4 : 0}
                    fill={s.color}
                    data-tip={`${d.label}${d.sublabel ? ` · ${d.sublabel}` : ""}\n${s.label}: ${v}${unit}\nTotal: ${total}${unit}`}
                  />
                );
              })}
              {total > 0 ? (
                <text x={x + barW / 2} y={y(total) - 5} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--color-gray-700)">
                  {total}
                </text>
              ) : null}
              <text x={x + barW / 2} y={H - 10} textAnchor="middle" fontSize={11} fontWeight={d.highlight ? 700 : 400} fill={d.highlight ? "var(--color-ink)" : "var(--color-gray-500)"}>
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600" aria-label="Legend">
        {seriesTotals.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
            {s.label} <span className="font-semibold text-ink">{s.total}</span>
          </li>
        ))}
      </ul>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th>Day</th>
            {series.map((s) => (
              <th key={s.key}>{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((d, i) => (
            <tr key={i}>
              <td>{d.label}</td>
              {series.map((s) => (
                <td key={s.key}>{d.values[s.key] ?? 0}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </ChartTooltip>
  );
}

/** Single-series columns with a value on each cap (few columns, so every value is labeled). */
export function Columns({ items, title, unit = "", color = "var(--viz-single)" }: { items: { label: string; sublabel?: string; value: number; highlight?: boolean }[]; title: string; unit?: string; color?: string }) {
  const max = niceMax(Math.max(1, ...items.map((i) => i.value)));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / items.length;
  const barW = Math.min(40, slot * 0.6);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  return (
    <ChartTooltip>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={title}>
        <title>{title}</title>
        {[0, max / 2, max].map((t) => (
          <line key={t} x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--viz-grid)" strokeWidth={1} />
        ))}
        {items.map((it, i) => {
          const x = PAD.left + slot * i + (slot - barW) / 2;
          const h = Math.max(0, y(0) - y(it.value));
          return (
            <g key={it.label + i}>
              <rect x={x} y={y(it.value)} width={barW} height={h} rx={4} fill={it.highlight ? color : "var(--viz-single-soft)"} data-tip={`${it.label}${it.sublabel ? ` · ${it.sublabel}` : ""}\n${it.value}${unit}`} />
              {it.value > 0 ? (
                <text x={x + barW / 2} y={y(it.value) - 5} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--color-gray-700)">
                  {it.value}
                </text>
              ) : null}
              <text x={x + barW / 2} y={H - 10} textAnchor="middle" fontSize={11} fontWeight={it.highlight ? 700 : 400} fill={it.highlight ? "var(--color-ink)" : "var(--color-gray-500)"}>
                {it.label}
              </text>
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td>{it.label}</td>
              <td>{it.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ChartTooltip>
  );
}

/** Single horizontal proportion bar (e.g. sentiment mix) with a labeled legend. */
export function SegmentBar({ segments, title }: { segments: { label: string; value: number; color: string }[]; title: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  return (
    <ChartTooltip>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100" role="img" aria-label={title}>
        {total > 0
          ? segments
              .filter((s) => s.value > 0)
              .map((s, i) => (
                <div key={s.label} className={i > 0 ? "ml-0.5" : ""} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} data-tip={`${s.label}: ${s.value} (${Math.round((s.value / total) * 100)}%)`} />
              ))
          : null}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
            {s.label} <span className="font-semibold text-ink">{total ? Math.round((s.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </ChartTooltip>
  );
}

/** Tiny inline bars by hour of day (peak call times). */
export function HourBars({ counts, title, tz }: { counts: number[]; title: string; tz: string }) {
  const max = Math.max(1, ...counts);
  const w = 600;
  const h = 70;
  const bw = w / 24;
  const fmtHour = (hr: number) => `${hr % 12 === 0 ? 12 : hr % 12}${hr < 12 ? "a" : "p"}`;
  const peak = counts.indexOf(max);
  return (
    <ChartTooltip>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" role="img" aria-label={`${title} (${tz})`}>
        <title>{title}</title>
        {counts.map((c, hr) => {
          const bh = (c / max) * (h - 22);
          return (
            <g key={hr}>
              <rect x={hr * bw + 2} y={h - 18 - bh} width={bw - 4} height={Math.max(bh, c > 0 ? 3 : 1)} rx={3} fill={hr === peak && c > 0 ? "var(--viz-single)" : "var(--viz-single-soft)"} data-tip={`${fmtHour(hr)}–${fmtHour((hr + 1) % 24)}: ${c} call${c === 1 ? "" : "s"}`} />
              {hr % 6 === 0 ? (
                <text x={hr * bw + bw / 2} y={h - 4} textAnchor="middle" fontSize={10} fill="var(--color-gray-500)">
                  {fmtHour(hr)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </ChartTooltip>
  );
}
