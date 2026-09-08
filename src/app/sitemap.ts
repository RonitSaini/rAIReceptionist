import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/env";
import { PUBLIC_PATHS } from "@/lib/site";

/** The public pages, on the real domain. Generated at build: nothing here depends on the request. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = appUrl();
  const lastModified = new Date();
  return PUBLIC_PATHS.map((path) => ({
    url: `${base}${path === "/" ? "" : path}`,
    lastModified,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.5,
  }));
}
