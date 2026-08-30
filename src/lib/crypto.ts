import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Small symmetric-encryption helpers for secrets at rest (OAuth tokens).
 * Key: TOKEN_ENCRYPTION_KEY (any string; hashed to 32 bytes). Falls back to NEXTAUTH_SECRET so
 * nothing is ever stored in plain text, but set TOKEN_ENCRYPTION_KEY so rotating NextAuth's secret
 * doesn't lock you out of stored tokens.
 */

function key(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET;
  if (!raw) throw new Error("TOKEN_ENCRYPTION_KEY (or NEXTAUTH_SECRET) must be set to store tokens.");
  return createHash("sha256").update(raw).digest();
}

/** Returns "v1.<iv>.<tag>.<ciphertext>" (base64url). */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), enc.toString("base64url")].join(".");
}

export function decrypt(payload: string): string {
  const [v, ivB, tagB, dataB] = payload.split(".");
  if (v !== "v1" || !ivB || !tagB || !dataB) throw new Error("Unrecognized encrypted payload");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataB, "base64url")), decipher.final()]).toString("utf8");
}

/** Sign a short-lived value (OAuth state) so callbacks can't be forged. */
export function signState(payload: Record<string, unknown>, ttlMs = 10 * 60_000): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlMs }), "utf8").toString("base64url");
  const mac = createHmac("sha256", key()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyState<T = Record<string, unknown>>(state: string | null | undefined): T | null {
  if (!state) return null;
  const [body, mac] = state.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", key()).update(body).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { exp?: number };
    if (typeof parsed.exp !== "number" || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}
