import type { Metadata, Viewport } from "next";
import "./globals.css";
import { appUrl } from "@/lib/env";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  /**
   * The base every relative metadata URL resolves against — Open Graph and Twitter images, and any
   * canonical. Without it Next resolves them against the deployment host and warns; with it a shared
   * link carries the real domain. Read from `appUrl()` rather than hardcoded so the one env var
   * (NEXT_PUBLIC_APP_URL) stays the single source of truth for "where this app lives", and a preview
   * deployment describes itself as the preview rather than as production.
   */
  metadataBase: new URL(appUrl()),
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  /**
   * What a shared link shows. Title and description are left unset here so each page's own title
   * and description carry through (Next falls back to them); the image comes from
   * app/opengraph-image.tsx and twitter-image.tsx, resolved against metadataBase.
   */
  openGraph: { type: "website", siteName: SITE_NAME, locale: "en_US", url: "/" },
  twitter: { card: "summary_large_image" },
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
