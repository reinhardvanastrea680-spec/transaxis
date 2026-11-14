# 2-minute product demo — shooting script

A screen recording for the landing page `#demo` slot. Target **1:55–2:00**,
1080p, voiceover optional but captions mandatory (most people watch muted).

> **The current video was produced by script, not by hand.** See
> [Automated pipeline](#automated-pipeline) at the bottom — it records the real
> app with Playwright, narrates with a Nigerian English neural voice, and cuts
> each shot to the length of its line. The manual guidance below still applies
> if you would rather record it yourself, or re-shoot a single section.

The one thing this video must prove: **Transaxis closes the loop from stock
arrival to confirmed delivery, with a photo as evidence.** Everything else is
supporting detail. If you only have 90 seconds, cut the inventory section —
never cut the proof-of-delivery confirmation, because that is the part no
spreadsheet can do.

---

## Before you record

**Use a demo org, not real data.** Create a separate organization with:

- Warehouse: `Lagos Main Warehouse`
- 6–8 products with realistic Nigerian names and clean stock levels, e.g.
  `Peak Milk 400g (carton)`, `Indomie Super Pack 40`, `Bigi Cola 50cl (crate)`
- One product deliberately **low stock** so a warning badge is visible
- One product with a **storage location** filled in (`Aisle B, Rack 3, Shelf 2`)
- One dispatch in `in_transit` so the board is not empty

**Two sessions open side by side.** The owner and the driver must be different
accounts, because the whole point is that the driver cannot confirm their own
delivery. Use two browser profiles or two devices.

**Browser setup:** Chrome, 1920×1080, zoom **110%** (text stays legible on a
phone screen after compression), bookmarks bar hidden (`Ctrl+Shift+B`), no
notifications, single tab. Dark theme photographs well on video — keep it if
your brand is dark.

**Tools:** Loom (fastest — auto captions, instant embed link) or OBS Studio
(free, more control). Edit in CapCut or Descript if you need to trim takes.

**Pace:** ~300 spoken words for two minutes. That is roughly **2.5 words per
second** — slower than conversation. Say less than feels natural.

---

## Shot list

| Time | Screen | On-screen action | Voiceover |
| --- | --- | --- | --- |
| **0:00–0:08** | Dashboard | Cursor rests; let the low-stock and awaiting-confirmation tiles be readable | "This is a day at a Lagos distribution warehouse. Every crate in, every crate out, accounted for." |
| **0:08–0:20** | Dashboard | Point at the two stat tiles: *low stock*, *awaiting confirmation* | "Two things go wrong in every logistics business: stock that quietly disappears, and deliveries nobody can prove. Transaxis closes both." |
| **0:20–0:36** | Inventory | Scroll the table; hover the low-stock badge; click the Location column | "Your catalogue, with live stock — not a monthly spreadsheet. Each product also knows where it physically sits." |
| **0:36–0:50** | Inventory → scan | Click **Scan to find**, scan a barcode, product panel opens showing the location block | "Scan a label and it tells you the shelf. No walking the aisles, no asking the storekeeper." |
| **0:50–1:05** | Record movement | Open *Record movement*, quantity 24, type `in`, save; stock count updates | "Stock arriving is recorded as a movement, not an overwrite — so every unit has a history." |
| **1:05–1:20** | Dispatch | Create a dispatch, add items, then **Assign driver** — show the driver dropdown | "Now it ships. The office creates the dispatch and assigns the driver. Only the office can assign — the driver cannot assign themselves work." |
| **1:20–1:38** | Dispatch (driver session) | Switch to driver window; status → *in transit* → **Delivered**, upload a photo of the signed waybill | "The driver marks it delivered and uploads the proof — a photo of the signed waybill, with time and location." |
| **1:38–1:52** | Dispatch (owner session) | Refresh; the row shows **Awaiting confirmation**; open it, the photo appears full size; click **Confirm delivered** | "It does not count as delivered yet. The office sees the proof, and only then does it become a completed delivery. The driver's word is not the record — the photo is." |
| **1:52–2:00** | Reports / audit | Brief scroll of the audit trail | "Every step is logged, by name. That is what accountable operations looks like." |

---

## Voiceover, written out

Read this straight through to check your pacing before recording. It is 292
words — just under two minutes at a calm pace.

> This is a day at a Lagos distribution warehouse. Every crate in, every crate
> out, accounted for.
>
> Two things go wrong in every logistics business: stock that quietly
> disappears, and deliveries nobody can prove. Transaxis closes both.
>
> Here is your catalogue, with live stock — not a monthly spreadsheet. Each
> product also knows where it physically sits.
>
> Scan a label, and it tells you the shelf. No walking the aisles, no asking the
> storekeeper.
>
> Stock arriving is recorded as a movement, not an overwrite — so every unit has
> a history you can trace.
>
> Now it ships. The office creates the dispatch and assigns the driver. Only the
> office can assign — a driver cannot assign themselves work.
>
> The driver marks it delivered and uploads the proof: a photo of the signed
> waybill, with the time and location.
>
> But it does not count as delivered yet. The office sees the proof — and only
> then does it become a completed delivery. The driver's word is not the record.
> The photo is.
>
> Every step is logged, by name. That is what accountable operations looks like.

---

## Recording tips that matter more than the script

1. **Record in sections, not one take.** Four takes — inventory, dispatch,
   driver, confirmation — then cut. One fumble in a single 2-minute take costs
   you the whole thing.
2. **Move the cursor deliberately.** Slow, straight lines. Do not circle or
   wiggle. Hide the cursor entirely when reading a screen for more than a second.
3. **Leave a beat after each click.** ~0.4s. The viewer needs time to see what
   changed before you move on.
4. **Never show a loading spinner or an empty state.** Pre-load every page
   before you start the take.
5. **Caption everything.** Loom does it automatically; otherwise run the file
   through Descript or CapCut's auto-captions. Check product names manually —
   autocaptions mangle "Transaxis".
6. **Add one visible timestamp** on the delivery confirmation screen. It proves
   the audit trail is real, and it is the frame people screenshot.
7. **No background music** for a B2B demo, or something extremely quiet. Music
   dates the video and fights the voiceover.
8. **End on the product, not a logo.** The last frame should be the audit trail,
   not a title card.

---

## Where to publish it

| Option | Best for | Then set |
| --- | --- | --- |
| **Loom** | Fastest path. Instant embed, auto captions, view analytics | `NEXT_PUBLIC_DEMO_VIDEO_URL=https://www.loom.com/share/<id>` |
| **YouTube (unlisted)** | Free hosting, reliable player, captions | `NEXT_PUBLIC_DEMO_VIDEO_URL=https://youtu.be/<id>` |
| **Self-hosted MP4** | No third-party player, no cookie concerns, full control | Put it in `public/demo/transaxis-demo.mp4` and set `NEXT_PUBLIC_DEMO_VIDEO_URL=/demo/transaxis-demo.mp4` |

Self-hosting is the only option that adds no third-party cookies — worth
considering given the cookie policy states there are none. If you embed YouTube
or Loom, **update `/cookies`**, because that iframe sets its own cookies.

### Wiring it up

The landing page reads `NEXT_PUBLIC_DEMO_VIDEO_URL` and picks the right player:

```bash
# local
echo 'NEXT_PUBLIC_DEMO_VIDEO_URL=/demo/transaxis-demo.mp4' >> .env.local

# production (then redeploy — NEXT_PUBLIC_* is baked in at build time)
vercel env add NEXT_PUBLIC_DEMO_VIDEO_URL production
vercel --prod --yes
```

Share links are converted to embed URLs automatically (YouTube watch/shorts/
`youtu.be`, Vimeo, Loom). Anything unrecognised renders as a plain "watch the
demo" link rather than a broken player. Leaving it unset keeps the current
"coming soon" placeholder.

---

## A 20-second cut for cold outreach

Same footage, different edit. WhatsApp and email get far more plays with a short
clip than a full demo:

1. 0–3s: the dispatch marked *Awaiting confirmation*
2. 3–10s: the waybill photo opening full size
3. 10–16s: **Confirm delivered** → status flips to *Delivered*
4. 16–20s: "Proof before payment. transaxis.com.ng"

That is the single most persuasive 20 seconds in the product. Lead with it.

---

## Automated pipeline

`demo-out/transaxis-demo.mp4` — **2:10, 1280×720, 30 fps, H.264 + AAC**, with a
Nigerian English voiceover (`en-NG-AbeoNeural`) and a matching `.srt`.

```bash
npm run demo:auth       # log in once, save the browser session
npm run demo:record     # record all 12 sections to demo-out/raw/
npm run demo:assemble   # cut to narration length, join, mux
npm run demo:srt        # rebuild captions without re-rendering
npm run demo:video      # all of the above
```

### Why it is cut in sections

Each section is recorded separately and then trimmed to the length of its
narration line. The picture follows the voice instead of the voice being
stretched over a take that ran long. A fumble costs one section, not the video.

| # | Section | Shows | Length |
| --- | --- | --- | --- |
| 1 | Dashboard | Low-stock alerts and the confirmation queue | 17.0s |
| 2 | Inventory | Live stock, warehouse, storage location per SKU | 10.0s |
| 3 | Scan | Scan a label → product panel with the shelf | 8.2s |
| 4 | Storage location | Correct the shelf inline, saves instantly | 8.8s |
| 5 | Record movement | Stock in as a movement, not an overwrite | 8.8s |
| 6 | Stocktaking | Counted vs recorded, posted as an adjustment | 11.4s |
| 7 | Dispatch | Create the order, assign the driver | 14.4s |
| 8 | Pickup + proof | Mark picked up, photograph the waybill | 13.0s |
| 9 | Awaiting confirmation | The office opens the photo full size | 13.0s |
| 10 | Confirm delivery | Only now does it become delivered | 8.2s |
| 11 | Roles | Who can assign, who can confirm | 10.1s |
| 12 | Audit log | Every action against a name | 7.4s |

### Two things to know before re-shooting

**The camera feed in section 3 is simulated.** Headless Chrome has neither a
camera nor the `BarcodeDetector` API, so the recorder feeds a canvas-drawn
Code 128 label to `getUserMedia` and answers the detector after ~1.3 s. The
scanner UI, its three modes and the resolve logic are the real ones — only the
lens is synthetic. For an authentic shot, record that one section on a phone.

**Sections 8–10 are performed from the owner account.** The demo is more
convincing with two logins, because the driver cannot confirm their own
delivery. That needs a working driver password (`DEMO_DRIVER_EMAIL` /
`DEMO_DRIVER_PASSWORD`); until then the office account drives every step.

### Files

```
demo-out/
  transaxis-demo.mp4     the deliverable
  transaxis-demo.srt     captions, 28 cues
  timeline.json          per-section start/end, used by srt.mjs
  vo/segments.json       narration text + target length (edit this)
  vo/*.mp3               one line per section
  raw/*.webm             untouched section recordings
  clips/, audio/         intermediates
  data-backup.json       the catalogue as it was before the demo rename
```
