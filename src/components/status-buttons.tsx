import { humanize } from "@/lib/constants";

/**
 * One-tap status transitions for reservations and takeout orders.
 * Renders a form per allowed next status so it works without client JS.
 */
export function StatusButtons({
  id,
  current,
  transitions,
  action,
  returnTo,
  size = "md",
}: {
  id: string;
  current: string;
  transitions: { status: string; label: string; tone?: "primary" | "secondary" | "danger" }[];
  action: (fd: FormData) => Promise<void>;
  returnTo?: string;
  size?: "md" | "sm";
}) {
  const cls = {
    primary: "bg-brand-600 text-white hover:bg-brand-700",
    secondary: "bg-surface text-ink border border-gray-300 hover:bg-gray-50",
    danger: "bg-surface text-red-700 border border-red-200 hover:bg-red-50",
  };
  const sz = size === "sm" ? "min-h-9 px-3 text-sm" : "min-h-12 px-4 text-base";
  const options = transitions.filter((t) => t.status !== current);
  if (options.length === 0) return <p className="text-sm text-gray-500">{humanize(current)}</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((t) => (
        <form key={t.status} action={action}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value={t.status} />
          {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
          <button type="submit" className={`inline-flex items-center justify-center rounded-xl font-semibold transition-colors ${sz} ${cls[t.tone ?? "secondary"]}`}>
            {t.label}
          </button>
        </form>
      ))}
    </div>
  );
}

export const RESERVATION_TRANSITIONS: Record<string, { status: string; label: string; tone?: "primary" | "secondary" | "danger" }[]> = {
  booked: [
    { status: "confirmed", label: "Confirm", tone: "primary" },
    { status: "seated", label: "Seat" },
    { status: "no_show", label: "No-show" },
    { status: "cancelled", label: "Cancel", tone: "danger" },
  ],
  confirmed: [
    { status: "seated", label: "Seat", tone: "primary" },
    { status: "no_show", label: "No-show" },
    { status: "cancelled", label: "Cancel", tone: "danger" },
  ],
  seated: [{ status: "completed", label: "Complete", tone: "primary" }],
  completed: [{ status: "seated", label: "Reopen" }],
  cancelled: [{ status: "booked", label: "Restore" }],
  no_show: [{ status: "booked", label: "Restore" }],
};

export const TAKEOUT_TRANSITIONS: Record<string, { status: string; label: string; tone?: "primary" | "secondary" | "danger" }[]> = {
  new: [
    { status: "confirmed", label: "Confirm", tone: "primary" },
    { status: "cancelled", label: "Cancel", tone: "danger" },
  ],
  confirmed: [
    { status: "ready", label: "Ready", tone: "primary" },
    { status: "cancelled", label: "Cancel", tone: "danger" },
  ],
  ready: [{ status: "picked_up", label: "Picked up", tone: "primary" }],
  picked_up: [{ status: "ready", label: "Reopen" }],
  cancelled: [{ status: "new", label: "Restore" }],
};
