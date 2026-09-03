import type { Metadata, Viewport } from "next";
import "./globals.css";
import { appUrl } from "@/lib/env";

export const metadata: Metadata = {
  /**
   * The base every relative metadata URL resolves against — Open Graph and Twitter images, and any
   * canonical. Without it Next resolves them against the deployment host and warns; with it a shared
   * link carries the real domain. Read from `appUrl()` rather than hardcoded so the one env var
   * (NEXT_PUBLIC_APP_URL) stays the single source of truth for "where this app lives", and a preview
   * deployment describes itself as the preview rather than as production.
   */
  metadataBase: new URL(appUrl()),
  title: { default: "FrontDesk AI", template: "%s · FrontDesk AI" },
  description: "FrontDesk AI — an AI receptionist that answers your business line, books work, takes orders and messages, and keeps you in the loop.",
  applicationName: "FrontDesk AI",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#05668d" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

/** Applies the saved (or OS) theme before first paint so there's no light→dark flash. */
const themeInitScript = `document.documentElement.classList.add("js");(function(){try{var t=localStorage.getItem("theme");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;if(d){document.documentElement.classList.add("dark");document.documentElement.style.colorScheme="dark"}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
