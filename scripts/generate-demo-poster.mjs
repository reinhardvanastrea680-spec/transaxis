/**
 * Builds public/demo/transaxis-demo-poster.jpg from the demo video itself.
 *
 * The frame is taken at 45s, where the inventory screen is fully populated.
 * The top 48px — the signed-in browser header — is cropped off before scaling
 * back to 1280x720. That header carries the account's email address, and this
 * image is published to Google as the video thumbnail, so leaving it in would
 * put a real address in a public search result.
 *
 * Cropping then rescaling is deliberate: painting a white box over the address
 * needed pixel-exact coordinates that shifted between frames, and left a
 * fragment of the address visible on the first attempt.
 *
 * Run: node scripts/generate-demo-poster.mjs
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import ffmpegPath from "ffmpeg-static";

const run = promisify(execFile);

const SRC = "public/demo/transaxis-demo.mp4";
const OUT = "public/demo/transaxis-demo-poster.jpg";
const AT_SECONDS = 45;
const HEADER_PX = 48;

if (!fs.existsSync(SRC)) {
  console.error(`${SRC} not found — the poster is generated from the video.`);
  process.exit(1);
}

await run(ffmpegPath, [
  "-hide_banner",
  "-loglevel", "error",
  "-ss", String(AT_SECONDS),
  "-i", SRC,
  "-frames:v", "1",
  // 720 - 48 = 672, then scaled back to 720 so the aspect ratio is 16:9.
  "-vf", `crop=1280:${720 - HEADER_PX}:0:${HEADER_PX},scale=1280:720:flags=lanczos`,
  "-q:v", "2",
  OUT,
  "-y",
]);

const { size } = fs.statSync(OUT);
console.log(`${OUT} written — 1280x720, ${(size / 1024).toFixed(0)} KB`);
