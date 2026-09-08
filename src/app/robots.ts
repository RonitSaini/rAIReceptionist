import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/env";
import { PRIVATE_PREFIXES } from "@/lib/site";

/** Index the public pages, stay out of the app and the API, and point at the sitemap. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: [...PRIVATE_PREFIXES] },
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
