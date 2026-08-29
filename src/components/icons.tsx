import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

/**
 * Animated arrow: the shaft draws in, then the head. Plays on mount (SMIL), so it
 * animates each time the page/link renders. Used for every directional arrow in the UI.
 */
export function ArrowRightIcon({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
        <path strokeDasharray="16" strokeDashoffset="16" d="M5 12h13.5">
          <animate fill="freeze" attributeName="stroke-dashoffset" dur="0.3s" values="16;0" />
        </path>
        <path strokeDasharray="10" strokeDashoffset="10" d="M19 12l-5 5M19 12l-5 -5">
          <animate fill="freeze" attributeName="stroke-dashoffset" begin="0.3s" dur="0.2s" to="0" />
        </path>
      </g>
    </svg>
  );
}

/** Same animation, mirrored to point left. */
export function ArrowLeftIcon({ size = 24, style, ...props }: IconProps) {
  return <ArrowRightIcon size={size} style={{ transform: "scaleX(-1)", ...style }} {...props} />;
}
