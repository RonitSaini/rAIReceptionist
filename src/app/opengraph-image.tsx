import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { SITE_TAGLINE } from "@/lib/site";

/**
 * The card a shared link shows (Open Graph; twitter-image.tsx re-exports it). Rendered once at
 * build from the wordmark in public/, so it never depends on a request and needs no hosted asset.
 * Until 2026-09-08 a shared link carried no image and no og:title at all.
 */

export const alt = `FrontDesk AI: ${SITE_TAGLINE.replace(/^The /, "the ")}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Read once at module scope: the asset does not depend on request data.
const wordmark = `data:image/png;base64,${await readFile(join(process.cwd(), "public/logo.png"), "base64")}`;

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
          color: "#0f172a",
          fontFamily: "sans-serif",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders a plain img; next/image has no meaning here */}
        <img src={wordmark} width={460} height={231} alt="" />
        <div style={{ marginTop: 44, fontSize: 46, fontWeight: 600, textAlign: "center", lineHeight: 1.2, maxWidth: 1000 }}>{SITE_TAGLINE}</div>
        <div style={{ marginTop: 28, fontSize: 28, color: "#05668d" }}>frontdeskai.dev</div>
      </div>
    ),
    { ...size },
  );
}
