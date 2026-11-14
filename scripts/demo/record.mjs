/**
 * Records the Transaxis product demo, one section at a time.
 *
 * Why sections instead of one take: each section is cut to the length of its
 * narration line, so the picture follows the voice rather than the reverse.
 * A fumble in one section costs one section, not the whole video.
 *
 * Run:  node scripts/demo/record.mjs            (all sections)
 *       node scripts/demo/record.mjs 03 07      (just those sections)
 *
 * Output: demo-out/raw/<id>.webm + demo-out/raw/manifest.json
 * Next:   node scripts/demo/assemble.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { ensureDir, OUT } from "./lib.mjs";

const BASE = process.env.DEMO_BASE_URL || "https://transaxis.com.ng";
const STATE =
  process.env.DEMO_STATE_FILE || "C:/Users/HP/AppData/Local/Temp/state-owner2.json";
const DRIVER_EMAIL =
  process.env.DEMO_DRIVER_EMAIL || "demonkinganosvoldigoad5@gmail.com";
const WAYBILL =
  process.env.DEMO_WAYBILL || "C:/Users/HP/AppData/Local/Temp/waybill.png";

const RAW = ensureDir(path.join(OUT, "raw"));
const VIDEO = { width: 1280, height: 720 };
const VIEWPORT = { width: 1440, height: 810 };

/* ------------------------------------------------------------------ cursor */
/**
 * Headless Chrome draws no pointer, so a recording of it looks like the page is
 * operating itself. This paints a soft dot that follows real mousemove events
 * and pulses on press, which is what makes a scripted demo readable.
 */
const CURSOR_SCRIPT = () => {
  // Init scripts run before <html> exists on the very first document, so mount
  // lazily rather than assuming a root node.
  const mount = () => {
    if (!document.documentElement) return setTimeout(mount, 10);
    if (document.getElementById("__txcur")) return;
    build();
  };
  const build = () => {
    const dot = document.createElement("div");
    dot.id = "__txcur";
    dot.style.cssText = [
      "position:fixed", "left:-200px", "top:-200px", "width:22px", "height:22px",
      "border-radius:9999px", "background:#ffffff", "border:2.5px solid #111827",
      "box-shadow:0 0 0 2px rgba(255,255,255,.9),0 4px 12px rgba(0,0,0,.45)",
      "transform:translate(-50%,-50%) scale(1)", "pointer-events:none",
      "z-index:2147483647", "transition:transform .09s ease-out,background .09s",
    ].join(";");
    document.documentElement.appendChild(dot);
    window.addEventListener("mousemove", (e) => {
      dot.style.left = e.clientX + "px";
      dot.style.top = e.clientY + "px";
    }, true);
    window.addEventListener("mousedown", () => {
      dot.style.transform = "translate(-50%,-50%) scale(.6)";
      dot.style.background = "#93c5fd";
    }, true);
    window.addEventListener("mouseup", () => {
      dot.style.transform = "translate(-50%,-50%) scale(1)";
      dot.style.background = "#ffffff";
    }, true);
  };
  mount();
};

/* ------------------------------------------------------- fake camera (scan) */
/**
 * The scan screen needs a camera and the BarcodeDetector API. Headless Chrome
 * has neither, and a phone cannot be scripted. This feeds a canvas-drawn label
 * to getUserMedia and answers the detector after a beat, so the real scanner UI
 * — mode tabs, live frame, scan line, resolve — is what ends up on screen.
 */
const FAKE_SCAN_SCRIPT = (barcodeDataUrl) => {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext("2d");
  const label = new Image();
  label.src = barcodeDataUrl;

  const paint = () => {
    const grad = ctx.createLinearGradient(0, 0, 0, 480);
    grad.addColorStop(0, "#242d38");
    grad.addColorStop(1, "#151b22");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 640, 480);

    if (label.complete && label.naturalWidth) {
      const w = 400;
      const h = 170;
      const x = (640 - w) / 2;
      const y = 130;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,.55)";
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 8;
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(x, y, w, h);
      ctx.restore();
      ctx.drawImage(label, x + 22, y + 26, w - 44, h - 52);
    }
    requestAnimationFrame(paint);
  };
  paint();

  const stream = canvas.captureStream(30);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: async () => stream,
      enumerateDevices: async () => [],
      addEventListener() {},
    },
  });

  let calls = 0;
  window.BarcodeDetector = class {
    static async getSupportedFormats() {
      return ["code_128", "ean_13", "qr_code"];
    }
    async detect() {
      calls += 1;
      return calls > 6 ? [{ rawValue: "PKM-400", format: "code_128" }] : [];
    }
  };
};

/* ---------------------------------------------------------------- helpers */
function makeHelpers(page, origin, startedAt) {
  let pos = { x: origin.x, y: origin.y };
  const state = { loadMs: 0 };
  const pause = (ms) => page.waitForTimeout(ms);

  async function glide(x, y, ms = 620, steps = 26) {
    const sx = pos.x;
    const sy = pos.y;
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; // ease in-out
      await page.mouse.move(sx + (x - sx) * e, sy + (y - sy) * e);
      await pause(Math.max(6, ms / steps));
    }
    pos = { x, y };
  }

  async function centre(locator) {
    const loc = locator.first();
    // boundingBox() does not scroll, so an element below the fold returns a
    // y outside the viewport and the synthetic click lands on nothing. Scroll
    // it into view first, with a wheel gesture so the move reads as a scroll.
    let box = await loc.boundingBox();
    if (box && (box.y < 90 || box.y + box.height > VIEWPORT.height - 50)) {
      const delta = box.y + box.height / 2 - VIEWPORT.height * 0.55;
      await wheel(delta, 650);
      await pause(260);
      box = await loc.boundingBox();
    }
    if (!box) throw new Error("element has no box (not visible?)");
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  async function hover(locator, ms = 620) {
    const c = await centre(locator);
    await glide(c.x, c.y, ms);
  }

  async function click(locator, { settle = 420, ms = 620 } = {}) {
    const c = await centre(locator);
    await glide(c.x, c.y, ms);
    await pause(90);
    await page.mouse.down();
    await pause(70);
    await page.mouse.up();
    await pause(settle);
  }

  async function type(locator, text, delay = 42) {
    await locator.click();
    await pause(120);
    // Ctrl+A then type replaces the value. `fill("")` alone loses the race with
    // React re-rendering a controlled number input, which left a stray "1" and
    // turned a request for 10 units into 110.
    await page.keyboard.press("Control+A");
    await pause(60);
    await locator.pressSequentially(text, { delay });
  }

  async function wheel(dy, ms = 700, steps = 14) {
    for (let i = 0; i < steps; i += 1) {
      await page.mouse.wheel(0, dy / steps);
      await pause(ms / steps);
    }
  }

  /**
   * Picks a <select> option by matching its visible text. Option labels carry
   * live stock counts ("… — 24 on hand"), so matching on label is brittle;
   * matching on text and selecting the underlying value is not.
   */
  async function pick(select, needle) {
    const opts = await select
      .locator("option")
      .evaluateAll((os) => os.map((o) => ({ value: o.value, text: (o.textContent || "").trim() })));
    const hit = opts.find((o) => needle.test(o.text));
    if (!hit) throw new Error(`no option matching ${needle}: ${opts.map((o) => o.text).join(" | ")}`);
    await select.selectOption(hit.value);
    return hit.text;
  }

  /**
   * Waits for the signed-in header. Without this the recording opens on a
   * half-hydrated page — the nav visibly re-flows and the avatar pops in — and
   * the head-trim has no reliable place to cut.
   */
  async function ready(settle = 800) {
    await page
      .getByRole("button", { name: "Sign out" })
      .first()
      .waitFor({ state: "visible", timeout: 20000 })
      .catch(() => {});
    await pause(settle);
    state.loadMs = (Date.now() - startedAt) / 1000;
  }

  async function waitHidden(locator, timeout = 45000) {
    await locator.first().waitFor({ state: "hidden", timeout }).catch(() => {});
  }

  return { page, pause, glide, hover, click, type, wheel, ready, pick, waitHidden, state };
}

/* ---------------------------------------------------------------- sections */
const sections = [
  {
    id: "01-dashboard",
    minSeconds: 17.0,
    async run(p, h) {
      await p.goto(BASE + "/dashboard", { waitUntil: "domcontentloaded" });
      await h.ready(1000);
      await h.hover(p.getByText("STOCK ALERTS").first());
      await h.pause(1100);
      await h.hover(p.getByText("Bigi Cola 50cl (crate)").first(), 700);
      await h.pause(1300);
      await h.hover(p.getByText("Dangote Cement 50kg").first(), 600);
      await h.pause(1200);
      await h.hover(p.getByText("OPEN DISPATCHES").first(), 700);
      await h.pause(1100);
      await h.hover(p.getByRole("heading", { name: "Modules" }), 700);
      await h.pause(1600);
    },
  },
  {
    id: "02-inventory",
    minSeconds: 10.0,
    async run(p, h) {
      await p.goto(BASE + "/inventory", { waitUntil: "domcontentloaded" });
      await h.ready(900);
      await h.hover(p.locator("tbody tr").first(), 750);
      await h.pause(800);
      await h.hover(p.getByText("Low stock", { exact: true }).first(), 500);
      await h.pause(1000);
      await h.wheel(320, 800);
      await h.pause(800);
      await h.hover(p.getByRole("heading", { name: "Recent stock movements" }), 600);
      await h.pause(1100);
    },
  },
  {
    id: "03-scan",
    minSeconds: 9.0,
    fakeScan: true,
    async run(p, h) {
      await p.goto(BASE + "/inventory", { waitUntil: "domcontentloaded" });
      await h.ready(800);
      await h.click(p.getByRole("button", { name: "Scan to find" }).first());
      await h.pause(2800); // live frame, mode tabs, scan line
      // The scan dialog closes and the product panel opens in its place, so
      // "dialog hidden" is the wrong signal — wait for the panel by name.
      await p.getByText("Product details").first().waitFor({ state: "visible", timeout: 20000 });
      await h.pause(700);
      await h.hover(p.getByText("Storage location", { exact: false }).first(), 600);
      await h.pause(1700);
    },
  },
  {
    id: "04-location",
    minSeconds: 9.0,
    async run(p, h) {
      await p.goto(BASE + "/inventory", { waitUntil: "domcontentloaded" });
      await h.ready(700);
      await h.click(p.getByRole("button", { name: "Peak Milk 400g (carton)", exact: true }).first());
      await h.pause(650);
      const pd = p.getByRole("dialog");
      await pd.getByRole("button", { name: "Edit", exact: true }).first().waitFor({ timeout: 15000 });
      await h.click(pd.getByRole("button", { name: "Edit", exact: true }).first());
      await h.pause(450);
      const input = pd.locator('input[aria-label="Storage location"]');
      await h.type(input, "Aisle A, Rack 1, Shelf 3", 45);
      await h.pause(400);
      await h.click(pd.getByRole("button", { name: "Save", exact: true }));
      await h.pause(1500);
    },
  },
  {
    id: "05-movement",
    minSeconds: 9.0,
    async run(p, h) {
      await p.goto(BASE + "/inventory", { waitUntil: "domcontentloaded" });
      await h.ready(800);
      await h.click(p.getByRole("button", { name: "Record movement" }).first());
      await h.pause(650);
      const d = p.getByRole("dialog");
      await h.pick(d.locator("select").nth(0), /Peak Milk/);
      await h.pause(450);
      await h.pick(d.locator("select").nth(1), /Stock in/i);
      await h.pause(350);
      await h.type(d.locator('input[type="number"]').first(), "24", 90);
      await h.pause(250);
      await h.type(d.locator('input[type="text"]').first(), "PO-1042 depot transfer", 45);
      await h.pause(350);
      await h.click(d.getByRole("button", { name: "Record movement", exact: true }));
      await h.pause(1800);
    },
  },
  {
    id: "06-stocktake",
    minSeconds: 11.8,
    async run(p, h) {
      await p.goto(BASE + "/stocktaking", { waitUntil: "domcontentloaded" });
      await h.ready(900);
      const counts = p.locator('input[type="number"]');
      await h.hover(counts.nth(0), 700);
      await h.pause(350);
      await h.type(counts.nth(0), "12", 90);
      await h.pause(900);
      await h.type(counts.nth(1), "92", 90);
      await h.pause(900);
      await h.hover(p.getByText("variances", { exact: false }).first(), 600);
      await h.pause(700);
      await h.click(p.getByRole("button", { name: /Submit adjustments/ }));
      await h.pause(2000);
    },
  },
  {
    id: "07-dispatch",
    minSeconds: 17.4,
    async run(p, h) {
      await p.goto(BASE + "/dispatch", { waitUntil: "domcontentloaded" });
      await h.ready(800);
      await h.click(p.getByRole("button", { name: "New dispatch" }).first());
      await h.pause(750);
      const d = p.getByRole("dialog");
      await h.type(d.locator('input[type="text"]').nth(0), "Balogun Traders Ltd", 40);
      await h.pause(220);
      await h.type(d.locator('input[type="text"]').nth(1), "14 Iddo Market Road, Lagos Island", 30);
      await h.pause(280);
      await h.pick(d.locator("select").nth(0), /Lagos Main Warehouse/);
      await h.pause(380);
      await h.pick(d.locator("select").nth(1), /Dangote Cement/);
      await h.pause(380);
      await h.type(d.locator('input[type="number"]').first(), "10", 110);
      await h.pause(450);
      await h.click(d.getByRole("button", { name: "Create dispatch" }));
      await h.pause(1900);
      await h.click(p.getByRole("button", { name: "Assign driver" }).first());
      await h.pause(850);
      const ad = p.getByRole("dialog");
      await h.pick(ad.locator("select").first(), new RegExp(DRIVER_EMAIL.split("@")[0]));
      await h.pause(550);
      await h.click(ad.getByRole("button", { name: "Assign", exact: true }));
      await h.pause(1700);
    },
  },
  {
    id: "08-pickup",
    minSeconds: 10.4,
    async run(p, h) {
      await p.goto(BASE + "/dispatch", { waitUntil: "domcontentloaded" });
      await h.ready(800);
      await h.click(p.getByRole("button", { name: "Mark picked up" }).first());
      await h.pause(2100);
      await h.click(p.getByRole("button", { name: "Record delivery proof" }).first());
      await h.pause(850);
      const d = p.getByRole("dialog");
      await d.locator('input[type="file"]').first().setInputFiles(WAYBILL);
      await h.pause(2000); // the photo renders inside the dialog
      await h.click(d.getByRole("button", { name: "Send delivery proof" }));
      // The dialog stays open on success and says so, then offers Done.
      await p
        .getByText(/waiting for the office to confirm/i)
        .first()
        .waitFor({ state: "visible", timeout: 60000 });
      await h.pause(1400);
      await h.click(d.getByRole("button", { name: "Done" }));
      await h.pause(1000);
    },
  },
  {
    id: "09-proof",
    minSeconds: 13.4,
    async run(p, h) {
      await p.goto(BASE + "/dispatch", { waitUntil: "domcontentloaded" });
      await h.ready(900);
      const pending = p.getByText("Awaiting confirmation").first();
      await pending.waitFor({ state: "visible", timeout: 30000 });
      await h.hover(pending, 700);
      await h.pause(1100);
      await h.click(p.getByRole("button", { name: "Confirm delivery" }).first());
      await h.pause(2600);
      await h.hover(p.getByRole("dialog").locator("img").first(), 700);
      await h.pause(2300);
    },
  },
  {
    id: "10-confirm",
    minSeconds: 8.8,
    async run(p, h) {
      await p.goto(BASE + "/dispatch", { waitUntil: "domcontentloaded" });
      await h.ready(800);
      await p
        .getByText("Awaiting confirmation")
        .first()
        .waitFor({ state: "visible", timeout: 30000 });
      await h.click(p.getByRole("button", { name: "Confirm delivery" }).first());
      await h.pause(1200);
      const d = p.getByRole("dialog");
      await h.click(d.getByRole("button", { name: "Confirm delivered" }));
      await h.waitHidden(d, 45000);
      await h.pause(2300);
      await h.hover(p.getByText("Delivered", { exact: true }).first(), 600);
      await h.pause(1400);
    },
  },
  {
    id: "11-roles",
    minSeconds: 10.4,
    async run(p, h) {
      await p.goto(BASE + "/staff", { waitUntil: "domcontentloaded" });
      await h.ready(900);
      await h.hover(p.locator("select").first(), 700);
      await h.pause(1300);
      await h.hover(p.getByText("Join code", { exact: false }).first(), 600);
      await h.pause(1100);
      await h.wheel(300, 700);
      await h.pause(1300);
    },
  },
  {
    id: "12-audit",
    minSeconds: 7.6,
    async run(p, h) {
      await p.goto(BASE + "/staff", { waitUntil: "domcontentloaded" });
      await h.ready(800);
      // The audit trail is a tab, not something further down the page — the
      // team table already fits on screen, so scrolling reveals nothing.
      await h.click(p.getByText("Audit log", { exact: false }).first(), { settle: 1000 });
      await h.pause(900);
      const row = p
        .locator("tbody tr, li")
        .filter({ hasText: /created|updated|assigned|delivered|confirmed|movement/i })
        .first();
      await h.hover(row, 600).catch(() => {});
      await h.pause(1600);
      await h.wheel(240, 700);
      await h.pause(1500);
    },
  },
];

/* -------------------------------------------------------------------- main */
const only = process.argv.slice(2);
const todo = only.length
  ? sections.filter((s) => only.some((o) => s.id.startsWith(o)))
  : sections;

const barcodeDataUrl =
  "data:image/png;base64," +
  fs.readFileSync(path.join(OUT, "assets", "barcode.png")).toString("base64");

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--force-device-scale-factor=1", "--hide-scrollbars"],
});

const manifestPath = path.join(RAW, "manifest.json");
const previous = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  : [];
const manifest = previous.filter((m) => !todo.some((s) => s.id === m.id));

for (const section of todo) {
  const dir = ensureDir(path.join(RAW, section.id));
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    storageState: STATE,
    recordVideo: { dir, size: VIDEO },
    reducedMotion: "no-preference",
    colorScheme: "light",
  });
  await ctx.addInitScript(CURSOR_SCRIPT);
  if (section.fakeScan) await ctx.addInitScript(FAKE_SCAN_SCRIPT, barcodeDataUrl);

  const page = await ctx.newPage();
  page.on("pageerror", (e) => {
    // React #418 is a hydration text mismatch that already exists in prod.
    if (!/Minified React error #418/.test(e.message)) {
      console.warn(`  [${section.id}] pageerror: ${e.message}`);
    }
  });

  const startedAt = Date.now();
  const h = makeHelpers(page, { x: VIEWPORT.width / 2, y: VIEWPORT.height - 140 }, startedAt);

  let ok = true;
  try {
    await section.run(page, h);
  } catch (e) {
    ok = false;
    console.error(`  [${section.id}] FAILED: ${e.message.split("\n")[0]}`);
    await page
      .screenshot({ path: path.join(RAW, section.id + "-fail.png") })
      .catch(() => {});
  }

  const actionSeconds = (Date.now() - startedAt) / 1000;
  const video = page.video();
  await ctx.close();

  const produced = await video.path();
  const target = path.join(RAW, section.id + ".webm");
  fs.rmSync(target, { force: true });
  fs.renameSync(produced, target);
  fs.rmSync(dir, { recursive: true, force: true });

  manifest.push({
    id: section.id,
    minSeconds: section.minSeconds,
    loadMs: Number(h.state.loadMs.toFixed(2)),
    actionSeconds: Number(actionSeconds.toFixed(2)),
    ok,
  });
  console.log(
    `  ${section.id}  load ${h.state.loadMs.toFixed(1)}s  actions ${actionSeconds.toFixed(1)}s  ${ok ? "ok" : "FAILED"}`,
  );
}

manifest.sort((a, b) => a.id.localeCompare(b.id));
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
await browser.close();
console.log(`\nrecorded ${todo.length} section(s). next: node scripts/demo/assemble.mjs`);
