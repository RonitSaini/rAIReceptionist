import Link from "next/link";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Brand mark for headers. Renders /logo.png (drop the file in /public) and falls back to the
 * wordmark until the file exists. Server component — the existence check runs on the server.
 */
const LOGO_FILE = path.join(process.cwd(), "public", "logo.png");
const hasLogo = existsSync(LOGO_FILE);

export function Logo({ href = "/dashboard", size = "md", className = "" }: { href?: string; size?: "md" | "lg"; className?: string }) {
  const h = size === "lg" ? "h-28" : "h-14";
  return (
    <Link href={href} aria-label="FrontDesk AI — home" className={`inline-flex items-center ${className}`}>
      {hasLogo ? (
        // eslint-disable-next-line @next/next/no-img-element -- static asset in /public, no optimization needed
        <img src="/logo.png" alt="FrontDesk AI" className={`${h} w-auto object-contain`} />
      ) : (
        <span className={`${size === "lg" ? "text-3xl" : "text-lg"} font-black tracking-tight text-brand-700`}>FrontDesk AI</span>
      )}
    </Link>
  );
}
