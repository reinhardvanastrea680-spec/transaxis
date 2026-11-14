/**
 * Regression tests for demo video URL handling.
 *
 * Run with:  npm run test:demo
 *
 * The contract: whatever is pasted into NEXT_PUBLIC_DEMO_VIDEO_URL either
 * renders a player or degrades to a plain link. It must never produce a broken
 * <video src> or an iframe pointing at a share page (which refuses to frame).
 */

import assert from "node:assert/strict";
import { resolveDemoVideo, type DemoVideo } from "../src/lib/demo-video.ts";

let passed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (error) {
    failures.push(`${name}: ${(error as Error).message}`);
  }
}

/** Narrow to the src of a resolved video, failing loudly for `none`. */
function src(v: DemoVideo): string {
  assert.ok("src" in v, `expected a src, got kind="${v.kind}"`);
  return v.src;
}

// ---------------------------------------------------------------------------
// Nothing configured
// ---------------------------------------------------------------------------

test("unset, empty, and whitespace all mean no video", () => {
  for (const v of [undefined, null, "", "   ", "\n\t"]) {
    assert.deepEqual(resolveDemoVideo(v), { kind: "none" });
  }
});

// ---------------------------------------------------------------------------
// Self-hosted files
// ---------------------------------------------------------------------------

test("hosted video files are rendered with <video>", () => {
  for (const ext of [".mp4", ".webm", ".ogg", ".mov", ".m4v", ".MP4"]) {
    assert.deepEqual(resolveDemoVideo(`https://cdn.example.com/demo${ext}`), {
      kind: "file",
      src: `https://cdn.example.com/demo${ext}`,
    });
  }
});

test("root-relative paths are treated as files", () => {
  assert.deepEqual(resolveDemoVideo("/demo/transaxis.mp4"), {
    kind: "file",
    src: "/demo/transaxis.mp4",
  });
});

test("a query string does not stop file detection", () => {
  assert.equal(
    resolveDemoVideo("https://cdn.example.com/demo.mp4?token=abc").kind,
    "file",
  );
});

// ---------------------------------------------------------------------------
// YouTube
// ---------------------------------------------------------------------------

test("youtube watch URLs become embed URLs", () => {
  assert.deepEqual(resolveDemoVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), {
    kind: "embed",
    src: "https://www.youtube.com/embed/dQw4w9WgXcQ",
  });
});

test("youtu.be short links become embed URLs", () => {
  assert.equal(
    src(resolveDemoVideo("https://youtu.be/dQw4w9WgXcQ")),
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
  );
});

test("extra youtube params and timestamps are dropped", () => {
  assert.equal(
    src(resolveDemoVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PL123")),
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
  );
});

test("shorts and live links resolve", () => {
  assert.equal(
    src(resolveDemoVideo("https://www.youtube.com/shorts/dQw4w9WgXcQ")),
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
  );
  assert.equal(
    src(resolveDemoVideo("https://www.youtube.com/live/dQw4w9WgXcQ")),
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
  );
});

test("an already-embedded youtube URL is left alone", () => {
  assert.equal(
    src(resolveDemoVideo("https://www.youtube.com/embed/dQw4w9WgXcQ")),
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
  );
});

// ---------------------------------------------------------------------------
// Vimeo and Loom
// ---------------------------------------------------------------------------

test("vimeo share links become player URLs", () => {
  assert.equal(
    src(resolveDemoVideo("https://vimeo.com/76979871")),
    "https://player.vimeo.com/video/76979871",
  );
});

test("vimeo player URLs are normalised", () => {
  assert.equal(
    src(resolveDemoVideo("https://player.vimeo.com/video/76979871")),
    "https://player.vimeo.com/video/76979871",
  );
});

test("loom share links become embed URLs", () => {
  assert.equal(
    src(resolveDemoVideo("https://www.loom.com/share/abc123def456")),
    "https://www.loom.com/embed/abc123def456",
  );
});

test("a loom embed URL is left alone", () => {
  assert.equal(
    src(resolveDemoVideo("https://www.loom.com/embed/abc123def456")),
    "https://www.loom.com/embed/abc123def456",
  );
});

// ---------------------------------------------------------------------------
// Fallbacks
// ---------------------------------------------------------------------------

test("a non-video URL degrades to a plain link instead of a broken player", () => {
  assert.deepEqual(resolveDemoVideo("https://example.com/demo"), {
    kind: "link",
    src: "https://example.com/demo",
  });
});

test("a nonsense value degrades to a plain link", () => {
  assert.equal(resolveDemoVideo("not a url").kind, "link");
});

test("non-http protocols are not rendered as media", () => {
  for (const bad of ["javascript:alert(1)", "data:text/html,hi", "ftp://x/y.mp4"]) {
    assert.equal(resolveDemoVideo(bad).kind, "link", `expected link for ${bad}`);
  }
});

test("a lookalike host is not mistaken for youtube", () => {
  const r = resolveDemoVideo("https://youtube.com.evil.example/watch?v=abc12345678");
  assert.equal(r.kind, "link");
});

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.error(`FAIL  ${failures.length} test(s) failed`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`PASS  ${passed} tests passed`);
