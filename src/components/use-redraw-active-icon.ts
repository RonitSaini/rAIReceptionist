import { useEffect, useRef, type RefObject } from "react";

/**
 * Re-draws the <DrawIcon> inside the `[data-active="true"]` item whenever the route changes.
 * Skips the first mount (the mount stagger already drew every icon) and drops the rail delay so the
 * newly active icon redraws immediately — state changed, so the icon draws; a hover never does.
 */
export function useRedrawActiveIcon(ref: RefObject<HTMLElement | null>, pathname: string) {
  const prev = useRef(pathname);
  useEffect(() => {
    if (prev.current === pathname) return;
    prev.current = pathname;
    const svg = ref.current?.querySelector<SVGSVGElement>('[data-active="true"] .draw-icon');
    if (!svg) return;
    svg.style.setProperty("--draw-delay", "0ms");
    svg.classList.remove("is-drawing");
    void svg.getBoundingClientRect(); // flush styles so re-adding the class restarts the animation
    svg.classList.add("is-drawing");
  }, [ref, pathname]);
}
