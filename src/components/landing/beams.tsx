import type { CSSProperties } from "react";

/**
 * Hero backdrop: call routes drawing themselves toward the receptionist — the site's stroke-draw
 * motif (pathLength="1" + dashoffset) at ambient scale. Server component, pure CSS loop; the
 * gradient stops read theme tokens so both themes get the right accent. Shape adapted from the
 * "background beams follow an SVG path" pattern on 21st.dev (aceternity #1152), ported to house CSS.
 */

const BEAMS: { d: string; delay: number; duration: number; opacity: number }[] = [
  { d: "M-40 90 C 240 60, 500 130, 950 250", delay: 0, duration: 7000, opacity: 0.55 },
  { d: "M-40 210 C 260 195, 520 220, 950 285", delay: 1300, duration: 7800, opacity: 0.4 },
  { d: "M-40 340 C 300 340, 560 315, 950 315", delay: 2500, duration: 6800, opacity: 0.5 },
  { d: "M-40 480 C 280 480, 570 405, 950 345", delay: 3600, duration: 8200, opacity: 0.4 },
  { d: "M-40 610 C 330 620, 610 480, 950 375", delay: 4700, duration: 7200, opacity: 0.55 },
  { d: "M1240 60 C 1030 90, 990 170, 955 245", delay: 5600, duration: 6600, opacity: 0.35 },
];

export function HeroBeams({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`.trim()}
      viewBox="0 0 1200 700"
      fill="none"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="beam-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: "var(--color-green-300)" }} stopOpacity="0" />
          <stop offset="0.55" style={{ stopColor: "var(--color-green-400)" }} stopOpacity="0.9" />
          <stop offset="1" style={{ stopColor: "var(--color-green-500)" }} stopOpacity="1" />
        </linearGradient>
      </defs>
      {BEAMS.map((b) => (
        <path
          key={b.d}
          d={b.d}
          pathLength={1}
          className="beam-path"
          stroke="url(#beam-grad)"
          strokeWidth="1.5"
          strokeLinecap="round"
          style={{ "--beam-delay": `${b.delay}ms`, "--beam-duration": `${b.duration}ms`, "--beam-opacity": b.opacity } as CSSProperties}
        />
      ))}
    </svg>
  );
}
