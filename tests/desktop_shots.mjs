// Скриншоты компьютерной вёрстки в окне 1440×900 (главная, поиск, моё, артист, плеер).
//   node tests/desktop_shots.mjs   (нужен tests/serve_local.py и интернет)
import { launch } from "./cdp.mjs";
import fs from "node:fs";
const BASE = "http://127.0.0.1:8099";
const W = +(process.argv[2] || 1440), H = +(process.argv[3] || 900);
const b = await launch({ dir: "C:/Users/leksik/Documents/Notka/tests/shots", port: 9381, width: W, height: H });
await b.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
const found = ((await (await fetch(`${BASE}/search?q=${encodeURIComponent("Кино Группа крови")}`)).json()).results || []).filter((t) => t.artwork && t.source === "youtube_music");
const seed = { favorites: found.slice(0, 8), recent: found.slice(0, 6), playlists: [], onboardingSeenV2: true, settings: {} };
await b.goto(`${BASE}/health`);
await b.eval(`localStorage.clear(); localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify(seed))}); true`);
await b.goto(`${BASE}/app/`);
await b.waitFor("!!document.body && document.body.dataset.screen !== 'splash'", 8000, "x");
await b.sleep(1500);
const shot = async (name) => {
  const r = await b.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(`_tmp/d_${name}.png`, Buffer.from(r.data, "base64"));
  console.log("shot", name);
};
await shot("home");
await b.click("#mymix-play-btn").catch(() => {});
await b.waitFor("(() => { const a = document.getElementById('audio'); return !a.paused && a.currentTime > 0.3; })()", 60000, "playing").catch(() => {});
await b.sleep(800);
await shot("home_playing");
await b.click('.tab[data-tab="search"]'); await b.sleep(500);
await b.eval("(() => { const i = document.getElementById('search-input'); i.value = 'кино'; i.dispatchEvent(new Event('input', {bubbles:true})); return true; })()");
await b.sleep(3500);
await shot("search");
await b.click('.tab[data-tab="library"]'); await b.sleep(700);
await shot("library");
await b.click("#mini-open-btn"); await b.sleep(1200);
await shot("player");
await b.close?.();
process.exit(0);
