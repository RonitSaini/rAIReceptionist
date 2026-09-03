"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";

/**
 * Copy a short string to the clipboard.
 *
 * The confirmation is the label changing and then changing back — no animation, per motion spec
 * rule 11: a copy either happened or it didn't, and the label is allowed to say so because it is
 * reporting the browser's answer, not predicting one. Falls back to selecting nothing and saying so
 * when the Clipboard API is unavailable (an insecure origin, or a browser that refuses permission).
 */
export function CopyButton({ value, label = "Copy", className }: { value: string; label?: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setState("copied");
        } catch {
          setState("failed");
        }
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setState("idle"), 2000);
      }}
    >
      {state === "copied" ? "Copied" : state === "failed" ? "Press Ctrl+C" : label}
    </Button>
  );
}
