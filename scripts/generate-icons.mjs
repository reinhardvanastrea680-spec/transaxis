#!/usr/bin/env node
/**
 * Renders the PWA icons from the logo mark.
 *
 * The manifest pointed at /icon-192.png and /icon-512.png, which never existed —
 * so an installed app launched onto a blank splash instead of a branded one.
 * Chrome builds that splash from the manifest icon + background_color, which is
 * exactly the "logo fades into the app" effect we want, for free.
 *
 *   node scripts/generate-icons.mjs
 */

import { chromium } from "playwright";
import fs from "node:fs";

const OUT = "public";

// White strokes on the brand tile: the logo's own cyan→green gradient would
// disappear against a green background.
function mark(sizePct) {
  return `
  <svg width="${sizePct}%" height="${sizePct}%" viewBox="0 0 40 40" fill="none"
       style="display:block">
    <line x1="4" y1="20" x2="36" y2="20" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity="0.92"/>
    <path d="M30 14 L36 20 L30 26" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.92"/>
    <line x1="20" y1="8" x2="20" y2="32" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
    <line x1="12" y1="8" x2="28" y2="8" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
    <circle cx="20" cy="20" r="2.5" fill="#fff"/>
  </svg>`;
}

function page(size, sizePct) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;width:${size}px;height:${size}px;overflow:hidden}
    .tile{
      width:${size}px;height:${size}px;display:grid;place-items:center;
      background:
        radial-gradient(120% 120% at 22% 12%, #10B981 0%, #059669 42%, #047857 78%, #065F46 100%);
    }
  </style></head><body><div class="tile">${mark(sizePct)}</div></body></html>`;
}

const jobs = [
  { file: "icon-192.png", size: 192, pct: 62 },
  { file: "icon-512.png", size: 512, pct: 62 },
  // Maskable: keep the mark inside the 80% safe circle so Android's mask never
  // crops it.
  { file: "icon-maskable-512.png", size: 512, pct: 48 },
  { file: "apple-touch-icon.png", size: 180, pct: 62 },
];

const browser = await chromium.launch({ headless: true });
for (const job of jobs) {
  const pageObj = await browser.newPage({
    viewport: { width: job.size, height: job.size },
    deviceScaleFactor: 1,
  });
  await pageObj.setContent(page(job.size, job.pct), { waitUntil: "load" });
  const path = `${OUT}/${job.file}`;
  await pageObj.screenshot({ path, omitBackground: false });
  const bytes = fs.statSync(path).size;
  console.log(`${job.file.padEnd(24)} ${job.size}×${job.size}  ${bytes} bytes`);
  await pageObj.close();
}
await browser.close();
