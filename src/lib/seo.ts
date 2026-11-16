/**
 * Everything a search engine or a link preview reads, in one place.
 *
 * The title, the description, the canonical URL and the JSON-LD all describe
 * the same product, and they drift apart the moment they live in four files.
 * The landing page, the legal pages, `robots.txt`, `sitemap.xml` and the
 * structured data all import from here.
 *
 * Google needs three separate things and they are not interchangeable:
 *   - metadata  -> what the blue link and the grey snippet say
 *   - OpenGraph -> what WhatsApp, LinkedIn and X render as a card
 *   - JSON-LD   -> what powers a knowledge panel and rich results
 * Getting one right does nothing for the other two, which is why all three are
 * generated from these constants rather than written out by hand.
 */
import { PRICE_TABLE, SELLABLE_PLANS, PLAN_META } from "@/lib/plans";

/**
 * The production origin. Canonicals are absolute and always point here, even
 * when the page is rendered on a preview deployment — two hosts serving the
 * same page is exactly the duplicate-content problem a canonical exists to
 * solve, and a preview URL must never claim to be the canonical one.
 */
export const SITE_URL = "https://transaxis.com.ng";
export const SITE_NAME = "Transaxis";
export const SITE_LOCALE = "en_NG";
export const CONTACT_EMAIL = "transaxis6.ng@gmail.com";

/** ~53 characters — short enough that Google will not rewrite it. */
export const SITE_TITLE = "Transaxis — Inventory & Dispatch Software for Nigeria";

/** ~155 characters, front-loaded with the phrases people actually type. */
export const SITE_DESCRIPTION =
  "Warehouse and logistics software for Nigerian businesses. Track stock across warehouses, dispatch deliveries with photo proof, and keep staff accountable.";

export const OG_IMAGE = {
  url: "/og.png",
  width: 1200,
  height: 630,
  alt: "Transaxis — logistics operations, accounted for",
} as const;

/**
 * Paths that must never be crawled. These are all behind auth and would only
 * ever return a redirect to /login, so indexing them wastes crawl budget and
 * can surface "sign in" pages for brand searches.
 *
 * Note the ordering: `/auth` would otherwise swallow nothing here, but keeping
 * the list flat and explicit is easier to audit than a regex.
 */
export const PRIVATE_PATHS = [
  "/dashboard",
  "/inventory",
  "/dispatch",
  "/staff",
  "/stocktaking",
  "/reports",
  "/billing",
  "/onboarding",
  "/api/",
  "/auth/",
];

/** Pages worth indexing, in the order a sitemap should list them. */
export const PUBLIC_PAGES: Array<{
  path: string;
  priority: number;
  changeFrequency: "daily" | "weekly" | "monthly" | "yearly";
}> = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/inventory-software-nigeria", priority: 0.9, changeFrequency: "monthly" },
  { path: "/fmcg-distribution-software", priority: 0.9, changeFrequency: "monthly" },
  { path: "/login", priority: 0.6, changeFrequency: "monthly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
  { path: "/cookies", priority: 0.3, changeFrequency: "yearly" },
];

/** Absolute URL for a path — the form every canonical and sitemap entry needs. */
export function absoluteUrl(path = "/"): string {
  return new URL(path, SITE_URL).toString();
}

/**
 * The company itself. This is what feeds a knowledge panel: the logo, the
 * country it operates in, and a way to reach it. `@id` is a stable identifier
 * so the other blocks can point at this one instead of repeating it.
 */
export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    logo: {
      "@type": "ImageObject",
      url: absoluteUrl("/icon-512.png"),
      width: 512,
      height: 512,
    },
    image: absoluteUrl(OG_IMAGE.url),
    description: SITE_DESCRIPTION,
    email: CONTACT_EMAIL,
    address: {
      "@type": "PostalAddress",
      addressLocality: "Abuja",
      addressCountry: "NG",
    },
    areaServed: {
      "@type": "Country",
      name: "Nigeria",
    },
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: CONTACT_EMAIL,
        areaServed: "NG",
        availableLanguage: ["en"],
      },
    ],
  };
}

/**
 * The site as an entity, tied back to the organisation by `@id`. Declaring the
 * site name explicitly is what lets Google print "Transaxis" above the URL
 * instead of guessing it from the domain.
 */
export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: SITE_URL,
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    publisher: { "@id": `${SITE_URL}/#organization` },
    inLanguage: "en-NG",
  };
}

/**
 * The product. Prices are read from the same table checkout uses, so a price
 * change can never leave stale numbers in the markup Google reads.
 *
 * No `aggregateRating`: there are no real reviews yet, and inventing them is
 * both a rich-results violation and a lie to the customer.
 */
export function softwareApplicationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${SITE_URL}/#software`,
    name: SITE_NAME,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Inventory management",
    operatingSystem: "Web, Android, iOS",
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    publisher: { "@id": `${SITE_URL}/#organization` },
    inLanguage: "en-NG",
    featureList: [
      "Multi-warehouse inventory tracking",
      "Dispatch management with photo proof of delivery",
      "Staff roles and per-action accountability",
      "Low-stock alerts and stocktaking",
      "CSV catalogue import and export",
    ],
    offers: SELLABLE_PLANS.map((plan) => ({
      "@type": "Offer",
      name: PLAN_META[plan].label,
      price: (PRICE_TABLE[plan].monthly / 100).toFixed(0),
      priceCurrency: "NGN",
      category: "subscription",
      // Not /billing: that route is behind auth and disallowed in robots.txt,
      // and structured data should not point at a URL crawlers cannot fetch.
      url: absoluteUrl("/#get-started"),
    })),
  };
}

/** The blocks the landing page actually renders, in one array. */
export function landingPageSchema() {
  return [organizationSchema(), websiteSchema(), softwareApplicationSchema()];
}

/**
 * The demo video. Google's live test on the homepage already reports "Video
 * detected"; this is what makes it eligible for a video rich result rather than
 * just something the crawler noticed.
 *
 * `thumbnailUrl` and `uploadDate` are required by Google — without them the
 * markup is ignored. The poster frame is generated from the video itself by
 * scripts/generate-demo-poster.mjs, with the browser chrome cropped off so the
 * signed-in account email is never published.
 *
 * Only emitted when a real file is configured: advertising a VideoObject for a
 * "coming soon" placeholder would be a lie, and Google penalises the mismatch.
 */
export function videoObjectSchema(contentUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: "Transaxis product demo — receiving stock to proof of delivery",
    description:
      "A complete transaction in under three minutes: receive goods into a warehouse, record a stock movement, create a dispatch, assign a driver, and confirm delivery against the driver's photo.",
    thumbnailUrl: [absoluteUrl("/demo/transaxis-demo-poster.jpg")],
    uploadDate: "2026-11-14T11:40:00+01:00",
    duration: "PT2M10S",
    contentUrl,
    publisher: { "@id": `${SITE_URL}/#organization` },
    inLanguage: "en-NG",
  };
}

/** Poster frame for the demo video, also used as the <video> poster attribute. */
export const DEMO_POSTER = "/demo/transaxis-demo-poster.jpg";

/**
 * FAQ markup. Built from the same array the page renders, so the answer a
 * visitor reads and the answer Google indexes cannot drift apart — a mismatch
 * between visible text and markup is what gets rich results revoked.
 */
export function faqPageSchema(items: Array<{ q: string; a: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

/**
 * Breadcrumbs. The trailing item is the current page and carries no `item`
 * URL, which is what Google expects for "you are here".
 */
export function breadcrumbSchema(trail: Array<{ name: string; path?: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      ...(crumb.path ? { item: absoluteUrl(crumb.path) } : {}),
    })),
  };
}

/**
 * Metadata for one public page.
 *
 * The canonical is set per page rather than in the root layout on purpose. A
 * layout-level `alternates.canonical` is inherited by every child, so the whole
 * site would declare itself a duplicate of the homepage and Google would drop
 * /privacy, /terms and /cookies from the index entirely.
 *
 * `absoluteTitle` is for the homepage, which must not be rendered as
 * "Transaxis — … · Transaxis" by the root template.
 */
export function pageMetadata(opts: {
  title: string;
  description: string;
  path: string;
  absoluteTitle?: boolean;
  noindex?: boolean;
}) {
  const title = opts.absoluteTitle ? { absolute: opts.title } : opts.title;

  return {
    title,
    description: opts.description,
    alternates: { canonical: opts.path },
    openGraph: {
      type: "website" as const,
      locale: SITE_LOCALE,
      url: absoluteUrl(opts.path),
      siteName: SITE_NAME,
      title: opts.title,
      description: opts.description,
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image" as const,
      title: opts.title,
      description: opts.description,
      images: [OG_IMAGE.url],
    },
    ...(opts.noindex
      ? { robots: { index: false, follow: false } }
      : {}),
  };
}
