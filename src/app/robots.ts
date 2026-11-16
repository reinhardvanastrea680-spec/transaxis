import type { MetadataRoute } from "next";
import { ROBOTS_DISALLOW, SITE_URL } from "@/lib/seo";

/**
 * Previously this path 404'd, which meant Google had no instructions at all and
 * was free to crawl the authenticated app.
 *
 * Disallowing the private paths is about crawl budget and about not surfacing
 * "sign in" pages for brand searches — not about security. Those routes are
 * protected by middleware and RLS; a crawler that ignores this file still gets
 * nothing but a redirect.
 *
 * The rules are assembled in seo.ts rather than written out here, because
 * `Disallow: /inventory` silently blocks `/inventory-software-nigeria` too —
 * robots.txt matches by prefix — and that cost a day of indexing the first time
 * it happened.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ROBOTS_DISALLOW,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
