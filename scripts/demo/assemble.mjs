/**
 * Cuts the recorded sections to their narration length and joins them.
 *
 * Each section gets a target length from its voiceover line:
 *     L = max(narration + 0.3s lead-in + 0.45s tail, minSeconds)
 *
 * The clip is then fitted to L: trim the page-load head, then stretch or freeze
 * to land exactly on L. Video and audio are assembled as two separate streams
 * and muxed once, so there is no drift accumulating at the seams.
 *
 * Run: node scripts/demo/assemble.mjs
 * Out: demo-out/transaxis-demo.mp4 (+ .srt sidecar)
 */
import fs from "node:fs";
import path from "node:path";
import { buildSrt, buildVtt, duration, ensureDir, ffmpeg, OUT } from "./lib.mjs";

const RAW = path.join(OUT, "raw");
const VO = path.join(OUT, "vo");
const CLIPS = ensureDir(path.join(OUT, "clips"));
const AUDIO = ensureDir(path.join(OUT, "audio"));

const LEAD_IN = 0.3;
const TAIL = 0.45;
const FPS = 30;
const SIZE = "1280:720";

const manifest = JSON.parse(fs.readFileSync(path.join(RAW, "manifest.json"), "utf8"));
const manifestById = Object.fromEntries(manifest.map((m) => [m.id, m]));

const ids = fs
  .readdirSync(VO)
  .filter((f) => f.endsWith(".mp3"))
  .map((f) => f.replace(/\.mp3$/, ""))
  .sort();

const segments = JSON.parse(fs.readFileSync(path.join(VO, "segments.json"), "utf8"));
const textById = Object.fromEntries(segments.map((s) => [s.id, s.text]));
const minById = Object.fromEntries(segments.map((s) => [s.id, s.minSeconds ?? 0]));

const timeline = [];
let clock = 0;

for (const id of ids) {
  const meta = manifestById[id];
  const webm = path.join(RAW, id + ".webm");
  const vo = path.join(VO, id + ".mp3");

  if (!meta || !fs.existsSync(webm)) {
    console.warn(`  ${id}: no recording, skipping`);
    continue;
  }
  if (!meta.ok) console.warn(`  ${id}: recorded with errors — check the clip`);

  const voSeconds = await duration(vo);
  const videoSeconds = await duration(webm);
  const target = Math.max(voSeconds + LEAD_IN + TAIL, minById[id] ?? meta.minSeconds);

  // Trim the load-in first, but never past the point where the clip would be
  // shorter than its narration.
  const head = Math.min(meta.loadMs, Math.max(0, videoSeconds - target));
  const source = videoSeconds - head;
  const stretch = target / source;

  const clip = path.join(CLIPS, id + ".mp4");
  const vf = [
    `trim=start=${head.toFixed(3)}`,
    `setpts=(PTS-STARTPTS)*${stretch.toFixed(5)}`,
    `fps=${FPS}`,
    `tpad=stop_mode=clone:stop_duration=8`,
    `trim=duration=${target.toFixed(3)}`,
    `setpts=PTS-STARTPTS`,
    `scale=${SIZE}:flags=lanczos`,
    "setsar=1",
    "format=yuv420p",
  ].join(",");

  await ffmpeg([
    "-i", webm,
    "-vf", vf,
    "-an",
    "-t", target.toFixed(3),
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "20",
    "-profile:v", "high",
    "-level", "4.0",
    "-g", String(FPS * 2),
    "-pix_fmt", "yuv420p",
    clip,
  ]);

  // Voice padded to exactly the clip length, with a short lead-in so the
  // narration starts just after the cut, not on top of it.
  const wav = path.join(AUDIO, id + ".wav");
  await ffmpeg([
    "-i", vo,
    "-af", `adelay=${Math.round(LEAD_IN * 1000)}|${Math.round(LEAD_IN * 1000)},apad`,
    "-t", target.toFixed(3),
    "-ar", "44100",
    "-ac", "2",
    "-c:a", "pcm_s16le",
    wav,
  ]);

  timeline.push({
    id,
    start: clock,
    end: clock + target,
    text: textById[id] || "",
    vo: voSeconds,
    video: videoSeconds,
    head,
    stretch,
  });
  clock += target;

  console.log(
    `  ${id}  vo ${voSeconds.toFixed(1)}s  clip ${target.toFixed(1)}s  ` +
      `head -${head.toFixed(1)}s  x${stretch.toFixed(2)}`,
  );
}

/* --------------------------------------------------------------- join video */
const listFile = path.join(CLIPS, "concat.txt");
fs.writeFileSync(
  listFile,
  timeline.map((t) => `file '${path.join(CLIPS, t.id + ".mp4").replace(/\\/g, "/")}'`).join("\n"),
);
const silent = path.join(CLIPS, "_video.mp4");
await ffmpeg(["-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", silent]);

/* --------------------------------------------------------------- join audio */
const audioList = path.join(AUDIO, "concat.txt");
fs.writeFileSync(
  audioList,
  timeline.map((t) => `file '${path.join(AUDIO, t.id + ".wav").replace(/\\/g, "/")}'`).join("\n"),
);
const voice = path.join(AUDIO, "_voice.wav");
await ffmpeg(["-f", "concat", "-safe", "0", "-i", audioList, "-c", "copy", voice]);

/* -------------------------------------------------------------------- mux */
const out = path.join(OUT, "transaxis-demo.mp4");
const total = clock;
await ffmpeg([
  "-i", silent,
  "-i", voice,
  "-map", "0:v:0",
  "-map", "1:a:0",
  "-c:v", "copy",
  // Speech sits well below broadcast level straight out of the TTS; normalise
  // to -16 LUFS (the usual target for online video) and fade the tail.
  "-af", `loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=out:st=${(total - 0.8).toFixed(2)}:d=0.8`,
  "-c:a", "aac",
  "-b:a", "160k",
  "-ar", "44100",
  "-ac", "2",
  "-movflags", "+faststart",
  "-shortest",
  out,
]);

/* -------------------------------------------------------------------- srt */
fs.writeFileSync(path.join(OUT, "timeline.json"), JSON.stringify(timeline, null, 2));
fs.writeFileSync(path.join(OUT, "transaxis-demo.srt"), buildSrt(timeline, LEAD_IN), "utf8");
fs.writeFileSync(path.join(OUT, "transaxis-demo.vtt"), buildVtt(timeline, LEAD_IN), "utf8");

const finalSeconds = await duration(out);
const bytes = fs.statSync(out).size;
console.log(
  `\n${out}\n  ${Math.floor(finalSeconds / 60)}:${String(Math.round(finalSeconds % 60)).padStart(2, "0")}  ` +
    `${(bytes / 1024 / 1024).toFixed(1)} MB  ${timeline.length} sections`,
);
