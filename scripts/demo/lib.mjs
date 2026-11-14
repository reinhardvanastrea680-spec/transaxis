import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

export const FF = ffmpegPath;
export const run = promisify(execFile);

export async function ffmpeg(args, opts = {}) {
  return run(FF, ["-hide_banner", "-y", ...args], {
    maxBuffer: 1024 * 1024 * 64,
    ...opts,
  });
}

/**
 * Duration in seconds. `ffmpeg-static` ships only the muxer, not ffprobe, so we
 * read the "Duration: hh:mm:ss.xx" line ffmpeg prints before it errors out on
 * an output-less invocation.
 */
export async function duration(file) {
  let stderr = "";
  try {
    await run(FF, ["-hide_banner", "-i", file], { maxBuffer: 1024 * 1024 * 16 });
  } catch (e) {
    stderr = e.stderr || "";
  }
  const m = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/.exec(stderr);
  if (!m) throw new Error(`could not read duration of ${file}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

export function loadEnv(file = ".env.local") {
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
      }),
  );
}

export function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
  return d;
}

/** hh:mm:ss,mmm as SRT wants it. */
export function stamp(seconds) {
  const h = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const s = String(Math.floor(seconds % 60)).padStart(2, "0");
  const ms = String(Math.round((seconds % 1) * 1000)).padStart(3, "0");
  return `${h}:${m}:${s},${ms}`;
}

/**
 * Builds subtitles that are actually readable: one cue covers one thought,
 * never a whole section. Text is packed into ~78-character cues and the
 * narration time is shared out by character count, which tracks speech closely
 * enough for captions without forcing word-level alignment.
 */
export function buildSrt(timeline, leadIn = 0.3) {
  const MAX = 78;
  const lines = [];

  for (const seg of timeline) {
    const text = (seg.text || "").replace(/\s+/g, " ").trim();
    if (!text) continue;

    // Split into sentences, then break any overlong sentence at commas.
    const sentences = text.split(/(?<=[.?!])\s+/);
    const chunks = [];
    for (const sentence of sentences) {
      if (sentence.length <= MAX) {
        chunks.push(sentence);
        continue;
      }
      let rest = sentence;
      while (rest.length > MAX) {
        let cut = rest.lastIndexOf(", ", MAX);
        if (cut < MAX * 0.5) cut = rest.lastIndexOf(" ", MAX);
        if (cut < 1) cut = MAX;
        chunks.push(rest.slice(0, cut + 1).trim());
        rest = rest.slice(cut + 1).trim();
      }
      if (rest) chunks.push(rest);
    }

    // Pack short sentences together so cues do not flicker.
    const cues = [];
    for (const chunk of chunks) {
      const last = cues[cues.length - 1];
      if (last && last.length + 1 + chunk.length <= MAX) {
        cues[cues.length - 1] = `${last} ${chunk}`;
      } else {
        cues.push(chunk);
      }
    }

    const spoken = seg.vo ?? seg.end - seg.start - leadIn;
    const totalChars = cues.reduce((n, c) => n + c.length, 0) || 1;
    let cursor = seg.start + leadIn;

    for (const cue of cues) {
      const share = (cue.length / totalChars) * spoken;
      const end = Math.min(cursor + share, seg.end - 0.05);
      lines.push(`${lines.length + 1}\n${stamp(cursor)} --> ${stamp(end)}\n${cue}\n`);
      cursor = end;
    }
  }

  return lines.join("\n");
}

/**
 * The same cues as WebVTT.
 *
 * Browsers only parse WebVTT for a <track> element — an .srt is not fetched at
 * all, so the caption button appears and then does nothing. The cue text is
 * identical; only the header and the decimal separator differ.
 */
export function buildVtt(timeline, leadIn = 0.3) {
  const body = buildSrt(timeline, leadIn)
    .split("\n")
    .map((line) => (line.includes("-->") ? line.replace(/,/g, ".") : line))
    .join("\n");
  return `WEBVTT\n\n${body}`;
}

export const OUT = path.resolve("demo-out");
