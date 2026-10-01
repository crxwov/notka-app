// Decodes cached tracks in Chrome and reports silent stretches.
// Needs tests/serve_local.py running.   node tests/silence_scan.mjs [count]
import { launch } from "./cdp.mjs";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = "http://127.0.0.1:8099";
const here = path.dirname(fileURLToPath(import.meta.url));
const cache = path.join(here, "..", "cache", "audio_v2");
const count = +(process.argv[2] || 40);
const files = fs.readdirSync(cache).filter((f) => f.endsWith(".bin"))
  .map((f) => ({ f, m: fs.statSync(path.join(cache, f)).mtimeMs })).sort((a, b) => b.m - a.m).slice(0, count);

const b = await launch({ dir: path.join(here, "shots") });
await b.goto(`${BASE}/app/`);
let bad = 0;
for (const { f } of files) {
  const key = f.slice(0, -4);
  let source, id;
  if (key.startsWith("itunes_")) { source = "itunes"; id = key.split("_")[1]; }
  else if (key.startsWith("youtube_music_")) { source = "youtube_music"; id = key.slice("youtube_music_".length); }
  else continue;
  const r = await b.eval(`(async () => {
    try {
      const res = await fetch("${BASE}/stream?source=${source}&id=${encodeURIComponent(id)}");
      if (!res.ok) return { err: "HTTP " + res.status };
      const buf = await res.arrayBuffer();
      const ctx = new (window.OfflineAudioContext)(1, 8000, 8000);
      const a = await ctx.decodeAudioData(buf);
      const d = a.getChannelData(0), sr = a.sampleRate, secs = Math.floor(a.duration);
      const quiet = [];
      for (let s = 0; s < secs; s++) { let sum = 0; for (let i = s * sr; i < (s + 1) * sr; i += 16) sum += d[i] * d[i]; if (Math.sqrt(sum / (sr / 16)) < 0.0005) quiet.push(s); }
      const runs = []; let start = null, prev = null;
      for (const s of quiet) { if (start === null) { start = prev = s; } else if (s === prev + 1) { prev = s; } else { if (prev - start >= 3) runs.push([start, prev]); start = prev = s; } }
      if (start !== null && prev - start >= 3) runs.push([start, prev]);
      return { dur: Math.round(a.duration), runs };
    } catch (e) { return { err: String(e) }; }
  })()`);
  const flagged = r.err || r.runs.some(([s, e]) => s > 3 && e < r.dur - 6);
  if (flagged) bad++;
  console.log(flagged ? "BAD " : "ok  ", key, JSON.stringify(r));
}
console.log(`${bad} suspicious of ${files.length}`);
await b.close();
