import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "@/lib/cx";
import type { BadgeTone } from "@/components/badge";

export { Badge } from "@/components/badge";

// ---------- Buttons ----------

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "md" | "lg" | "sm";

const variantClass: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-hover active:bg-brand-press disabled:bg-brand-300",
  secondary: "bg-surface text-ink border border-gray-300 hover:bg-gray-50 active:bg-gray-100 disabled:text-gray-400",
  danger: "bg-red-600 text-white hover:bg-red-700 active:bg-red-800 disabled:bg-red-300",
  ghost: "bg-transparent text-brand-700 hover:bg-brand-50 active:bg-brand-100 disabled:text-gray-400",
};

const sizeClass: Record<Size, string> = {
  lg: "min-h-14 px-6 text-lg font-semibold",
  md: "min-h-12 px-4 text-base font-semibold",
  sm: "min-h-9 px-3 text-sm font-medium",
};

const baseButton = "press inline-flex items-center justify-center gap-2 rounded-xl disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2";

export function Button({
  variant = "primary",
  size = "md",
  full,
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size; full?: boolean }) {
  return <button className={cx(baseButton, variantClass[variant], sizeClass[size], full && "w-full", className)} {...props} />;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  full,
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size; full?: boolean }) {
  return <Link className={cx(baseButton, variantClass[variant], sizeClass[size], full && "w-full", className)} {...props} />;
}

// ---------- Form controls ----------

export const inputClass =
  "w-full min-h-12 rounded-xl border border-gray-300 bg-surface px-4 text-base text-ink placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:bg-gray-100";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(inputClass, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx(inputClass, "appearance-none", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(inputClass, "min-h-24 py-3", className)} {...props} />;
}

export function Field({ label, hint, htmlFor, children, className }: { label: string; hint?: string; htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-gray-800">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-gray-500">{hint}</p> : null}
    </div>
  );
}

/**
 * ON is green: a switch that is on is the system doing the thing. The exception is a switch that
 * flags something for attention rather than enabling a capability (an emergency, a waitlist entry).
 * Those pass tone="brand" and stay blue, because green there would read as "all good".
 */
export function Toggle({ label, description, name, defaultChecked, checked, onChange, tone = "go" }: { label: string; description?: string; name?: string; defaultChecked?: boolean; checked?: boolean; onChange?: (v: boolean) => void; tone?: "go" | "brand" }) {
  return (
    <label className="press-soft flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-xl border border-gray-200 bg-surface px-4 py-3">
      <span>
        <span className="block font-semibold">{label}</span>
        {description ? <span className="block text-sm text-gray-500">{description}</span> : null}
      </span>
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        checked={checked}
        onChange={onChange ? (e) => onChange(e.target.checked) : undefined}
        className="peer sr-only"
      />
      {/* .switch (globals.css) times the track colour and the thumb's travel; the thumb stretches toward
          where it is going while pressed (scale composes with the translate). */}
      <span
        className={cx(
          "switch relative h-7 w-12 shrink-0 rounded-full bg-gray-300 after:absolute after:left-0.5 after:top-0.5 after:h-6 after:w-6 after:origin-left after:rounded-full after:bg-white after:shadow-sm peer-checked:after:translate-x-5 peer-checked:after:origin-right peer-active:after:scale-x-115",
          tone === "brand" ? "peer-checked:bg-brand-500" : "peer-checked:bg-green-500",
        )}
      />
    </label>
  );
}

export function Checkbox({ label, name, value, defaultChecked }: { label: string; name: string; value: string; defaultChecked?: boolean }) {
  return (
    <label className="press-soft flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-surface px-4 py-2">
      <input type="checkbox" name={name} value={value} defaultChecked={defaultChecked} className="h-5 w-5 rounded border-gray-300 accent-brand-600" />
      <span className="text-base">{label}</span>
    </label>
  );
}

// ---------- Layout ----------

export function Card({ children, className, title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={cx("rounded-2xl border border-gray-200 bg-surface p-4 shadow-sm", className)}>
      {title || action ? (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title ? <h2 className="text-base font-bold">{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** tone="clear" is an empty state that is GOOD NEWS (nothing unread, nothing overdue) rather than
 *  an absence (no customers yet). Absence stays neutral, so "empty" never flatly reads as "fine". */
export function EmptyState({ title, body, action, tone = "neutral" }: { title: string; body?: string; action?: ReactNode; tone?: "neutral" | "clear" }) {
  const clear = tone === "clear";
  return (
    <div className={cx("rounded-2xl border border-dashed bg-surface/60 px-4 py-10 text-center", clear ? "border-green-300" : "border-gray-300")}>
      <p className={cx("font-semibold", clear && "text-green-700")}>{title}</p>
      {body ? <p className="mt-1 text-sm text-gray-500">{body}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Alert({ kind = "error", children }: { kind?: "error" | "success" | "info"; children: ReactNode }) {
  const cls = {
    error: "border-red-200 bg-red-50 text-red-800",
    success: "border-green-400 bg-green-50 text-green-800",
    info: "border-blue-200 bg-blue-50 text-blue-800",
  }[kind];
  return <div className={cx("slide-in rounded-xl border px-4 py-3 text-sm", cls)} role={kind === "error" ? "alert" : "status"}>{children}</div>;
}

/** Small rippling dot for live / unread / ready states. Inherits its color from `text-*`. */
export function StatusDot({ className, label }: { className?: string; label?: string }) {
  return <span className={cx("status-dot", className)} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}

// ---------- Badges (the component itself lives in badge.tsx: it crossfades on change, so it is a client leaf) ----------

export const reservationTone: Record<string, BadgeTone> = {
  booked: "blue",
  confirmed: "green", // Sage: the confirmed state is what the palette reserves green for
  seated: "green",
  completed: "gray",
  cancelled: "red",
  no_show: "amber",
};

export const takeoutTone: Record<string, BadgeTone> = {
  new: "blue",
  confirmed: "green", // Sage, as above
  ready: "green",
  picked_up: "gray",
  cancelled: "red",
};

export const classificationTone: Record<string, BadgeTone> = {
  reservation: "blue",
  service_call: "blue",
  estimate: "brand",
  emergency: "red",
  takeout: "brand",
  question: "gray",
  waitlist: "amber",
  message: "purple",
  escalation: "red",
  missed: "amber",
  other: "gray",
};

export const notificationTone: Record<string, BadgeTone> = {
  reservation: "blue",
  job: "blue",
  takeout: "brand",
  waitlist: "amber",
  message: "purple",
  escalation: "red",
  missed_call: "amber",
  system: "gray",
};
