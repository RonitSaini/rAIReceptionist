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

/** Local part: dot-separated atoms of the characters a domain is required to accept unquoted. */
const EMAIL_LOCAL = /^[A-Za-z0-9!#$%&'*+\/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+\/=?^_`{|}~-]+)*$/;
/** One domain label: alphanumeric at both ends, hyphens only inside, 63 characters at most. */
const EMAIL_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
/** The last label. No TLD is numeric and none is a single letter, so "x.7" and "x.c" are not typos to forgive. */
const EMAIL_TLD = /^[A-Za-z]{2,63}$/;

/**
 * Is this shaped like an address mail can actually be delivered to?
 *
 * The old one-liner asked only for an @ and a dot somewhere after it, which let through everything
 * a slipped finger produces: `me@gmail..com`, `me@-gmail.com`, `me@example`, `me@x.c`, `.me@x.com`.
 * This checks the parts RFC 5321 genuinely constrains — the length caps, dot-atom local part,
 * label shape, and an alphabetic TLD.
 *
 * Deliberately narrower than the RFC in two places: quoted local parts (`"a b"@x.com`) and
 * non-ASCII domains are refused. Neither can be handed to an email API without escaping or
 * punycode first, and nobody signing up a US or Canadian business types one by accident.
 *
 * Syntax only. Whether the domain exists is a DNS question, and `@/lib/email-address` asks it.
 */
export function isEmail(s: string): boolean {
  if (s.length > 254) return false; // RFC 5321's cap on the whole address
  const at = s.lastIndexOf("@");
  if (at < 1 || at === s.length - 1) return false;
  const local = s.slice(0, at);
  if (local.length > 64 || !EMAIL_LOCAL.test(local)) return false;
  const labels = s.slice(at + 1).split(".");
  if (labels.length < 2 || !EMAIL_TLD.test(labels[labels.length - 1])) return false;
  return labels.every((label) => EMAIL_LABEL.test(label));
}

/** The domain half of an address that has already passed `isEmail`. */
export function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1);
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

/** Append `changed=<id>` to a redirect target so the destination page can pop that row's status badge. */
export function withChanged(path: string, id: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}changed=${encodeURIComponent(id)}`;
}
