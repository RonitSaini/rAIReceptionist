"use client";

import { useLayoutEffect, useRef } from "react";
import { useParams } from "next/navigation";

/** The last step this template mounted for, kept across client navigations; a hard load starts over. */
let lastStep: number | null = null;

/**
 * Re-mounts on every step (the segment's key changes), so each step gets its guided arrival (motion spec §8):
 * the title, the form and the footer rise in three staggered groups, and the progress fill travels one step.
 *
 * Direction makes the flow one corridor. Before the new step's first paint (a layout effect), the container
 * is stamped data-dir="forward" or "back" by comparing this step with the last one mounted — so a save that
 * redirects, the Back link and the browser's own back button all read correctly, and the groups arrive
 * along the corridor instead of rising. A hard load has no history and arrives the plain way.
 */
export default function OnboardingTemplate({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const params = useParams<{ step?: string }>();
  const step = Number.parseInt(params?.step ?? "", 10);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !Number.isInteger(step)) return;
    if (lastStep !== null && lastStep !== step) el.dataset.dir = step > lastStep ? "forward" : "back";
    lastStep = step;
  }, [step]);

  return (
    <div ref={ref} className="guided">
      {children}
    </div>
  );
}
