import type { CSSProperties, SVGProps } from "react";
import { ICON_PATHS, type IconName } from "@/components/icon-paths";

/**
 * Stroked line icon that DRAWS itself (pathLength="1" + stroke-dasharray: 1 + stroke-dashoffset 1→0),
 * the same trick as the theme toggle and the bell. Server-safe: no hooks, no runtime.
 *
 * When it draws:
 *  - on MOUNT (`draw`, the default) — stagger a row of icons with `delay` (ms), like the bell's clapper;
 *  - on ACTIVE STATE CHANGE — the owner restarts the animation (see useRedrawActiveIcon).
 * Never on hover: hover stays colors-only. Reduced motion renders it fully drawn (see globals.css).
 */
export function DrawIcon({ name, size = 20, draw = true, delay = 0, className = "", style, ...rest }: SVGProps<SVGSVGElement> & { name: IconName; size?: number; draw?: boolean; delay?: number }) {
  const vars = delay ? ({ ...style, "--draw-delay": `${delay}ms` } as CSSProperties) : style;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className={`draw-icon ${draw ? "is-drawing" : ""} ${className}`.trim()} style={vars} {...rest}>
      {ICON_PATHS[name].map((d) => (
        <path key={d} pathLength={1} d={d} />
      ))}
    </svg>
  );
}
