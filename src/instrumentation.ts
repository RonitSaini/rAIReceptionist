/**
 * Runs once when the server starts (Node runtime), before any request is handled.
 * Normalizes environment values that would otherwise crash third-party code at import time.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // next-auth parses NEXTAUTH_URL with `new URL()`; an empty string (easy to create in the Vercel
  // dashboard) throws "Invalid URL" on every page. Fall back to Vercel's URLs, else drop it.
  const raw = process.env.NEXTAUTH_URL?.trim() ?? "";
  let valid = false;
  try {
    valid = raw !== "" && !!new URL(raw);
  } catch {
    valid = false;
  }
  if (!valid) {
    const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
    if (vercel) process.env.NEXTAUTH_URL = `https://${vercel}`;
    else delete process.env.NEXTAUTH_URL;
  }

  // Same treatment for our own public URL so webhook URLs are never built from an empty string.
  if (!process.env.NEXT_PUBLIC_APP_URL?.trim()) delete process.env.NEXT_PUBLIC_APP_URL;
}
