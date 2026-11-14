/**
 * Resolve the demo video URL into something renderable.
 *
 * The landing page has a `#demo` slot that currently says "coming soon". Rather
 * than hard-coding a player once a file exists, the slot reads
 * `NEXT_PUBLIC_DEMO_VIDEO_URL` and works out what to render:
 *
 *   a self-hosted file  -> <video>
 *   YouTube / Vimeo / Loom share link -> <iframe>
 *   anything else       -> a plain link, so a wrong paste still degrades
 *   nothing set         -> the existing placeholder
 *
 * Pure and dependency-free so the URL handling can be tested without a browser.
 */

export type DemoVideo =
  | { kind: "none" }
  | { kind: "file"; src: string }
  | { kind: "embed"; src: string }
  | { kind: "link"; src: string };

const FILE_EXTENSIONS = [".mp4", ".webm", ".ogg", ".ogv", ".mov", ".m4v"];

/** Bare YouTube ids are 11 chars; Vimeo and Loom ids are numeric/alphanumeric. */
function youtubeId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");

  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return id || null;
  }

  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") return url.searchParams.get("v");
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live") {
      return parts[1] ?? null;
    }
  }

  return null;
}

function vimeoId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "");
  if (host !== "vimeo.com" && host !== "player.vimeo.com") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  // /123456789  or  /video/123456789
  const candidate = parts[0] === "video" ? parts[1] : parts[0];
  return candidate && /^\d+$/.test(candidate) ? candidate : null;
}

function loomId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "");
  if (host !== "loom.com") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  // /share/<id>  or  /embed/<id>
  if ((parts[0] === "share" || parts[0] === "embed") && parts[1]) return parts[1];
  return null;
}

export function resolveDemoVideo(raw: string | undefined | null): DemoVideo {
  const value = (raw ?? "").trim();
  if (!value) return { kind: "none" };

  // A root-relative path is almost certainly a file we host ourselves.
  if (value.startsWith("/")) {
    return { kind: "file", src: value };
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { kind: "link", src: value };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { kind: "link", src: value };
  }

  const path = url.pathname.toLowerCase();
  if (FILE_EXTENSIONS.some((ext) => path.endsWith(ext))) {
    return { kind: "file", src: value };
  }

  const yt = youtubeId(url);
  if (yt) return { kind: "embed", src: `https://www.youtube.com/embed/${yt}` };

  const vimeo = vimeoId(url);
  if (vimeo) return { kind: "embed", src: `https://player.vimeo.com/video/${vimeo}` };

  const loom = loomId(url);
  if (loom) return { kind: "embed", src: `https://www.loom.com/embed/${loom}` };

  return { kind: "link", src: value };
}
