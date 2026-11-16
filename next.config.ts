import type { NextConfig } from "next";

/**
 * Security headers, applied to every response.
 *
 * What this is actually for: the app holds a business's entire inventory,
 * customer addresses and proof-of-delivery photos, and it is reachable by
 * anyone with the URL. The database already refuses to hand rows to the wrong
 * tenant (verified: anonymous reads return nothing, a signed-in driver sees one
 * organization and cannot change their own role). These headers close the other
 * half — what a browser will do with a page once it has one.
 *
 * The Content-Security-Policy is the load-bearing part. It cannot be strict
 * about inline script, because Next.js inlines its own hydration payload into
 * every page and those bytes differ per route, so a hash or nonce would have to
 * be recomputed per request — which the prerendered pages cannot do. What it
 * does still buy:
 *
 *   - no script, style or frame from an origin we did not name, so an injected
 *     `<script src="https://attacker…">` is refused by the browser
 *   - `eval` refused in production
 *   - no <object>/<embed> plugins
 *   - the page cannot be framed, so clickjacking a "downgrade" or "delete" is out
 *   - <base> cannot be retargeted, so relative URLs cannot be hijacked
 *   - forms cannot post to another origin, so a login form cannot be repointed
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
let supabaseOrigin = "";
let supabaseSocket = "";
try {
  if (SUPABASE_URL) {
    const url = new URL(SUPABASE_URL);
    supabaseOrigin = url.origin;
    supabaseSocket = `wss://${url.host}`;
  }
} catch {
  // A malformed URL should not stop the build; the policy simply omits it.
}

const isDev = process.env.NODE_ENV !== "production";

/**
 * Video embeds are only ever rendered from a demo URL the operator configures,
 * and only ever for these hosts (see src/lib/demo-video.ts).
 */
const VIDEO_FRAMES = [
  "https://www.youtube.com",
  "https://www.youtube-nocookie.com",
  "https://player.vimeo.com",
  "https://www.loom.com",
];

const csp = [
  "default-src 'self'",
  // 'unsafe-inline' is required by Next's inline hydration payload; 'unsafe-eval'
  // only in dev, where the bundler evaluates modules.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob:${supabaseOrigin ? ` ${supabaseOrigin}` : ""}`,
  "font-src 'self' data:",
  `connect-src 'self'${supabaseOrigin ? ` ${supabaseOrigin}` : ""}${
    supabaseSocket ? ` ${supabaseSocket}` : ""
  }${isDev ? " ws://localhost:* http://localhost:*" : ""}`,
  "media-src 'self' blob:",
  `frame-src 'self' ${VIDEO_FRAMES.join(" ")}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Vercel already sends HSTS; this adds the subdomain and preload qualifiers
  // that make it a one-way door rather than a hint.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Camera and location are used for barcode scanning and proof-of-delivery
  // pins; nothing else on the device is offered to the page.
  {
    key: "Permissions-Policy",
    value:
      "camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), magnetometer=(), gyroscope=()",
  },
  // Keeps a page opened from an external link in its own browsing context.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  cacheComponents: false,
  partialPrefetching: false,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
