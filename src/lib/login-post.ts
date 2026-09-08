/**
 * The password login as a plain POST (2026-09-08).
 *
 * The login form used to be client-only: `onSubmit` called next-auth's `signIn`, and a form with no
 * `method` submits as a native GET when Enter lands before React has attached — email and password
 * in the URL, in history and in every log. The form now posts to a server action, which works
 * before hydration (a native POST) and after it (fetch), and the action logs the owner in the same
 * way the browser did: NextAuth's credentials callback, reached from the server. The session cookie
 * NextAuth issues is relayed onto the response. Credentials never appear in a URL under any timing.
 *
 * Pure helpers live here so they can be tested without a server; the one network call is
 * `postCredentials`, and its fetch is injectable for the same reason.
 */

/** A safe post-login destination: a same-origin path. Anything else falls back to the dashboard. */
export function safeCallbackPath(input: string | null | undefined, fallback = "/dashboard"): string {
  const s = (input ?? "").trim();
  if (!s.startsWith("/") || s.startsWith("//") || s.startsWith("/\\") || /[\r\n]/.test(s)) return fallback;
  return s;
}

export type ParsedCookie = {
  name: string;
  value: string;
  path?: string;
  expires?: Date;
  maxAge?: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite?: "lax" | "strict" | "none";
};

/** One Set-Cookie line, as the cookie store wants it. Null for a line with no name=value. */
export function parseSetCookie(line: string): ParsedCookie | null {
  const [pair, ...attrs] = line.split(";");
  const eq = pair.indexOf("=");
  if (eq <= 0) return null;
  const out: ParsedCookie = { name: pair.slice(0, eq).trim(), value: pair.slice(eq + 1).trim(), httpOnly: false, secure: false };
  for (const raw of attrs) {
    const [k, ...rest] = raw.trim().split("=");
    const v = rest.join("=").trim();
    switch (k.toLowerCase()) {
      case "path":
        out.path = v;
        break;
      case "expires": {
        const d = new Date(v);
        if (!Number.isNaN(d.getTime())) out.expires = d;
        break;
      }
      case "max-age": {
        const n = Number.parseInt(v, 10);
        if (Number.isFinite(n)) out.maxAge = n;
        break;
      }
      case "httponly":
        out.httpOnly = true;
        break;
      case "secure":
        out.secure = true;
        break;
      case "samesite": {
        const s = v.toLowerCase();
        if (s === "lax" || s === "strict" || s === "none") out.sameSite = s;
        break;
      }
    }
  }
  return out;
}

/** NextAuth's session cookie among a response's Set-Cookie lines (`next-auth.session-token`, `__Secure-` prefixed in production). */
export function sessionCookieFrom(lines: readonly string[]): ParsedCookie | null {
  for (const line of lines) {
    const c = parseSetCookie(line);
    if (c && /(^|\.)next-auth\.session-token$/.test(c.name) && c.value) return c;
  }
  return null;
}

/** The request cookies NextAuth's callback needs, from the CSRF response's Set-Cookie lines. */
function cookieHeaderFrom(lines: readonly string[]): string {
  return lines
    .map(parseSetCookie)
    .filter((c): c is ParsedCookie => !!c)
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

export type CredentialsPost = { ok: true; session: ParsedCookie } | { ok: false; status: number };

/**
 * Log in through NextAuth's own credentials callback, from the server: fetch a CSRF token (which
 * sets the cookie the callback checks), post the credentials with that cookie, and read the session
 * cookie off the answer. `json=true` makes a refusal a 401 rather than a redirect to the error page.
 */
export async function postCredentials(
  origin: string,
  creds: { email: string; password: string; callbackUrl: string },
  fetchImpl: typeof fetch = fetch,
): Promise<CredentialsPost> {
  const csrfRes = await fetchImpl(`${origin}/api/auth/csrf`, { headers: { accept: "application/json" } });
  if (!csrfRes.ok) return { ok: false, status: csrfRes.status };
  const { csrfToken } = (await csrfRes.json()) as { csrfToken?: string };
  if (!csrfToken) return { ok: false, status: 500 };
  const cookie = cookieHeaderFrom(csrfRes.headers.getSetCookie?.() ?? []);

  const res = await fetchImpl(`${origin}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body: new URLSearchParams({ csrfToken, email: creds.email, password: creds.password, callbackUrl: creds.callbackUrl, json: "true" }),
  });
  const session = sessionCookieFrom(res.headers.getSetCookie?.() ?? []);
  return session ? { ok: true, session } : { ok: false, status: res.status };
}
