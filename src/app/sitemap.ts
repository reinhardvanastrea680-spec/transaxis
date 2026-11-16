import type { MetadataRoute } from "next";
import { PUBLIC_PAGES, absoluteUrl } from "@/lib/seo";

/**
 * `lastModified` is a constant, not `new Date()`.
 *
 * Returning the current time on every request tells Google that every page
 * changed today, every day. A lastmod that is always "now" carries no signal,
 * and Google learns to ignore it — which is worse than omitting it. This value
 * should be bumped by hand when the public pages actually change.
 */
const LAST_MODIFIED = new Date("2026-11-16T00:00:00Z");

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map((page) => ({
    url: absoluteUrl(page.path),
    lastModified: LAST_MODIFIED,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
