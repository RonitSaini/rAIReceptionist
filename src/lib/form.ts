/** Small helpers for reading FormData in server actions (no validation library). */

export type ActionState = { ok: boolean; error?: string; message?: string } | null;

export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export function optStr(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v === "" ? null : v;
}

export function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}

export function int(fd: FormData, key: string, fallback: number): number {
  const v = str(fd, key);
  if (v === "") return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function optInt(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  if (v === "") return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

export function optDecimal(fd: FormData, key: string): string | null {
  const v = str(fd, key).replace(/[$,\s]/g, "");
  if (v === "") return null;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n.toFixed(2) : null;
}

export function list(fd: FormData, key: string): string[] {
  return fd.getAll(key).filter((v): v is string => typeof v === "string" && v.trim() !== "").map((v) => v.trim());
}

export function json<T>(fd: FormData, key: string, fallback: T): T {
  const v = str(fd, key);
  if (!v) return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}

export function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/** Normalize a US phone number to E.164 (+1XXXXXXXXXX). Returns null if it can't be parsed. */
export function normalizeUsPhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/** "+15551234567" -> "(555) 123-4567" */
export function formatUsPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  const d = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (d.length !== 10) return phone;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export function isZip(s: string): boolean {
  return /^\d{5}(-\d{4})?$/.test(s);
}

export function formatUsd(value: number | string | { toString(): string } | null | undefined): string {
  if (value === null || value === undefined) return "";
  const n = typeof value === "number" ? value : Number.parseFloat(value.toString());
  if (!Number.isFinite(n)) return "";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}
