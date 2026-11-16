import type { MetadataRoute } from "next";
import { PRIVATE_PATHS, SITE_URL } from "@/lib/seo";

/**
 * Previously this path 404'd, which meant Google had no instructions at all and
 * was free to crawl the authenticated app.
 *
 * Disallowing the private paths is about crawl budget and about not surfacing
 * "sign in" pages for brand searches — not about security. Those routes are
 * protected by middleware and RLS; a crawler that ignores this file still gets
 * nothing but a redirect.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
