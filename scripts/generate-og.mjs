/**
 * Builds public/og.png — the 1200x630 card WhatsApp, LinkedIn and X render when
 * someone shares the site. Without it those previews are a bare URL.
 *
 * Run: node scripts/generate-og.mjs
 */
import fs from "node:fs";
import { chromium } from "playwright";

const W = 1200;
const H = 630;

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${W}px; height: ${H}px;
    background: #0A0A0A;
    font-family: "Segoe UI", Inter, Helvetica, Arial, sans-serif;
    color: #FAFAF9;
    position: relative;
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
  }
  .glow {
    position: absolute; width: 900px; height: 900px;
    right: -320px; top: -380px; border-radius: 50%;
    background: radial-gradient(circle, rgba(52,211,153,0.22) 0%, rgba(34,211,238,0.10) 42%, rgba(10,10,10,0) 70%);
  }
  .grid {
    position: absolute; inset: 0;
    background-image:
      linear-gradient(to right, rgba(255,255,255,0.045) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255,255,255,0.045) 1px, transparent 1px);
    background-size: 60px 60px;
    mask-image: linear-gradient(to bottom, rgba(0,0,0,0.9), rgba(0,0,0,0.15));
  }
  .wrap { position: absolute; inset: 0; padding: 64px 72px; display: flex; flex-direction: column; }
  .brand { display: flex; align-items: center; gap: 14px; }
  .mark {
    width: 52px; height: 52px; border-radius: 13px;
    background: linear-gradient(135deg, #22d3ee 0%, #34d399 100%);
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 8px 28px rgba(52,211,153,0.28);
  }
  .brand-name { font-size: 27px; font-weight: 600; letter-spacing: -0.01em; }
  .mid { margin-top: auto; }
  .eyebrow {
    font-size: 15px; font-weight: 600; letter-spacing: 0.14em;
    text-transform: uppercase; color: #34d399; margin-bottom: 22px;
  }
  h1 {
    font-size: 68px; line-height: 1.04; font-weight: 650;
    letter-spacing: -0.028em; max-width: 900px;
  }
  .sub {
    margin-top: 26px; font-size: 24px; line-height: 1.45;
    color: #A8A29E; max-width: 760px; font-weight: 400;
  }
  .foot {
    margin-top: 46px; padding-top: 26px;
    border-top: 1px solid rgba(255,255,255,0.12);
    display: flex; align-items: center; justify-content: space-between;
    font-size: 19px; color: #78716C;
  }
  .domain { color: #E7E5E4; font-weight: 600; }
  .pill {
    display: inline-flex; align-items: center; gap: 9px;
    padding: 8px 15px; border-radius: 999px;
    background: rgba(52,211,153,0.10); border: 1px solid rgba(52,211,153,0.30);
    color: #6EE7B7; font-size: 15px; font-weight: 600;
  }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #34d399; }
</style>
</head>
<body>
  <div class="grid"></div>
  <div class="glow"></div>
  <div class="wrap">
    <div class="brand">
      <div class="mark">
        <svg width="30" height="30" viewBox="0 0 40 40" fill="none">
          <line x1="4" y1="20" x2="36" y2="20" stroke="#0A0A0A" stroke-width="2.5" stroke-linecap="round" opacity="0.9"/>
          <path d="M30 14 L36 20 L30 26" stroke="#0A0A0A" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.9"/>
          <line x1="20" y1="8" x2="20" y2="32" stroke="#0A0A0A" stroke-width="3" stroke-linecap="round" opacity="0.9"/>
          <line x1="12" y1="8" x2="28" y2="8" stroke="#0A0A0A" stroke-width="3" stroke-linecap="round" opacity="0.9"/>
          <circle cx="20" cy="20" r="2.5" fill="#0A0A0A"/>
        </svg>
      </div>
      <span class="brand-name">Transaxis</span>
    </div>

    <div class="mid">
      <div class="eyebrow">Built for Nigerian logistics</div>
      <h1>Logistics operations,<br>accounted for.</h1>
      <p class="sub">
        Inventory, dispatch and staff accountability in one workspace.
        Know what enters your warehouse, what leaves, and who handled it.
      </p>
    </div>

    <div class="foot">
      <span class="domain">transaxis.com.ng</span>
      <span class="pill"><span class="dot"></span>14-day free trial</span>
    </div>
  </div>
</body>
</html>`;

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "load" });
await page.waitForTimeout(400);
await page.screenshot({ path: "public/og.png", type: "png" });
await browser.close();

const { size } = fs.statSync("public/og.png");
console.log(`public/og.png written — ${W}x${H}, ${(size / 1024).toFixed(0)} KB`);
