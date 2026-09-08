import type { NextConfig } from "next";

/**
 * Baseline response headers, added after the 2026-09-07 pre-launch audit found none on production.
 *
 * The CSP is report-only on purpose. Next's inline bootstrap scripts need a per-request nonce
 * before a blocking script-src can ship, and a blocking policy that is wrong takes the app down for
 * every customer at once. Report-only never blocks anything; it shows in the browser console what
 * a blocking policy would have refused, which is how the strict one gets written. The origins:
 * Google Maps for the address fields and the delivery map, Retell's API and LiveKit media for the
 * browser test call, voice samples and call recordings over https, Stripe Checkout and the billing
 * portal as form-submission targets.
 */
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"} https://maps.googleapis.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "connect-src 'self' https: wss:",
  "worker-src 'self' blob:",
  "frame-src https://checkout.stripe.com https://js.stripe.com",
  "form-action 'self' https://checkout.stripe.com https://billing.stripe.com https://accounts.google.com",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
];

const nextConfig: NextConfig = {
  // Prisma's query engine must stay external to the server bundle.
  serverExternalPackages: ["@prisma/client", "prisma"],
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
