/**
 * Rebuilds demo-out/timeline.json and the .srt without re-encoding the video.
 *
 * Editing a line of narration changes the cue text and timing but not the
 * picture, so there is no reason to sit through a full re-render just to fix a
 * caption. `assemble.mjs` writes the same two files as part of a full run.
 *
 * Run: node scripts/demo/srt.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { buildSrt, duration, OUT } from "./lib.mjs";

const VO = path.join(OUT, "vo");
const LEAD_IN = 0.3;
const TAIL = 0.45;

const segments = JSON.parse(fs.readFileSync(path.join(VO, "segments.json"), "utf8"));

const timeline = [];
let clock = 0;
for (const seg of segments) {
  const mp3 = path.join(VO, seg.id + ".mp3");
  if (!fs.existsSync(mp3)) {
    console.warn(`  ${seg.id}: no narration, skipping`);
    continue;
  }
  const vo = await duration(mp3);
  const length = Math.max(vo + LEAD_IN + TAIL, seg.minSeconds ?? 0);
  timeline.push({ id: seg.id, start: clock, end: clock + length, text: seg.text, vo });
  clock += length;
}

fs.writeFileSync(path.join(OUT, "timeline.json"), JSON.stringify(timeline, null, 2));
fs.writeFileSync(path.join(OUT, "transaxis-demo.srt"), buildSrt(timeline, LEAD_IN), "utf8");

const cues = fs.readFileSync(path.join(OUT, "transaxis-demo.srt"), "utf8").trim().split("\n\n").length;
console.log(`timeline ${Math.floor(clock / 60)}:${String(Math.round(clock % 60)).padStart(2, "0")} · ${cues} cues`);
