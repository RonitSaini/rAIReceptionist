/**
 * What the public web knows about this site: the pages a crawler may index, the prefixes it must
 * not, and the one line that describes the product on a shared link. sitemap.ts, robots.ts, the
 * Open Graph image and the root metadata all read from here so they cannot drift apart.
 */

/** Public pages, in sitemap order. Everything else needs a session or is a one-time link. */
export const PUBLIC_PATHS = ["/", "/privacy", "/terms", "/login", "/signup"] as const;

/**
 * Prefixes crawlers are told to stay out of: the API, the signed-in app (every route group under
 * src/app/(app)), onboarding, and the one-time pages. A crawler that ignores robots.txt still
 * meets the login redirect, so this is about not wasting crawl budget and not indexing redirects.
 */
export const PRIVATE_PREFIXES = [
  "/api/",
  "/onboarding/",
  "/accept-terms",
  "/verify-email",
  "/calls",
  "/customers",
  "/dashboard",
  "/dispatch",
  "/jobs",
  "/notifications",
  "/properties",
  "/reservations",
  "/schedule",
  "/services",
  "/settings",
  "/subjects",
  "/takeout",
  "/tenants",
  "/vendors",
  "/work-orders",
] as const;

export const SITE_NAME = "FrontDesk AI";
export const SITE_TAGLINE = "The AI receptionist that answers your business phone";
export const SITE_DESCRIPTION = "FrontDesk AI — an AI receptionist that answers your business line, books work, takes orders and messages, and keeps you in the loop.";
