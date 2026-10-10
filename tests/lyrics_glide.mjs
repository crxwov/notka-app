// Текст песни: смена строки идёт плавно: прокрутка едет по промежуточным значениям, а не прыгает.
//   node tests/lyrics_glide.mjs   (нужен tests/serve_local.py и интернет)
import { launch } from "./cdp.mjs";
const BASE = "http://127.0.0.1:8099";
const b = await launch({ dir: "C:/Users/leksik/Documents/Notka/tests/shots", port: 9402, width: 390, height: 844 });
await b.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
let bad = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "PASS " : "FAIL ") + name + " " + extra); if (!ok) bad++; };
const found = ((await (await fetch(`${BASE}/search?q=${encodeURIComponent("The Weeknd Blinding Lights")}`)).json()).results || []).filter((t) => t.artwork && t.source === "youtube_music" && /weeknd/i.test(t.artist)).slice(0, 1);
await b.goto(`${BASE}/health`);
await b.eval(`localStorage.clear(); localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify({ favorites: found.slice(0, 4), recent: [], playlists: [], onboardingSeenV2: true, settings: {} }))}); true`);
await b.goto(`${BASE}/app/`);
await b.waitFor("!!document.body && document.body.dataset.screen !== 'splash'", 8000, "x");
await b.sleep(1000);
await b.eval("document.querySelector('.tab[data-tab=library]').click(); true"); await b.sleep(500);
await b.eval("document.getElementById('open-favorites-btn').click(); true"); await b.sleep(600);
await b.eval("document.querySelector('#favorites-list .track-row .row-main').click(); true");
await b.waitFor("(() => { const a = document.getElementById('audio'); return !a.paused && a.currentTime > 0.3; })()", 60000, "playing");
await b.eval("document.getElementById('mini-open-btn').click(); true"); await b.sleep(700);
await b.eval("document.getElementById('player-lyrics-btn').click(); true");
await b.waitFor("document.querySelector('#lyrics-lines.is-synced .lyrics-line') !== null", 30000, "synced lyrics").catch(() => {});
const synced = await b.eval("!!document.querySelector('#lyrics-lines.is-synced')");
if (!synced) { console.log("SKIP no synced lyrics for this track"); process.exit(0); }
// jump the song to just before a later line, then watch the text glide
const t = await b.eval("(() => { const l = document.querySelectorAll('#lyrics-lines .lyrics-line'); return 0; })()");
const starts = await b.eval("JSON.stringify([...document.querySelectorAll('#lyrics-lines .lyrics-line')].map((li) => li.dataset.i))");
await b.eval("(() => { const a = document.getElementById('audio'); a.currentTime = 90; return true; })()");
await b.sleep(1500);
// wait for the active line to change and sample the scroll
const before = await b.eval("document.getElementById('player-lyrics').scrollTop");
const samples = [];
let lastActive = await b.eval("[...document.querySelectorAll('#lyrics-lines .lyrics-line')].findIndex((l) => l.classList.contains('is-active'))");
const t0 = Date.now();
let changed = false;
while (Date.now() - t0 < 60000) {
  const act = await b.eval("[...document.querySelectorAll('#lyrics-lines .lyrics-line')].findIndex((l) => l.classList.contains('is-active'))");
  if (act !== lastActive && act >= 0) { changed = true; break; }
  await b.sleep(150);
}
if (changed) {
  for (let i = 0; i < 24; i++) { samples.push(await b.eval("document.getElementById('player-lyrics').scrollTop")); await b.sleep(40); }
}
console.log("samples", samples.map((v) => Math.round(v)).join(","));
check("the active line changed during the song", changed);
if (changed) {
  const distinct = new Set(samples.map((v) => Math.round(v))).size;
  check("the scroll moved through intermediate positions (a glide)", distinct >= 6, `${distinct} distinct positions`);
  const ops = await b.eval("JSON.stringify([...document.querySelectorAll('#lyrics-lines .lyrics-line')].slice(0, 6).map((l) => l.style.getPropertyValue('--lo')))");
  check("the lines have their own brightness by distance", /\d\.\d/.test(ops), ops);
}
console.log(bad ? "FAILED" : "ALL PASS");
process.exit(bad ? 1 : 0);
