// Выравнивание громкости: трек играет через Web Audio, уровень измеряется и запоминается.
//   node tests/loudness.mjs   (нужен tests/serve_local.py и интернет)
import { launch } from "./cdp.mjs";
const BASE = "http://127.0.0.1:8099";
const b = await launch({ dir: "C:/Users/leksik/Documents/Notka/tests/shots", port: 9378 });
let bad = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "PASS " : "FAIL ") + name + " " + extra); if (!ok) bad++; };
const found = ((await (await fetch(`${BASE}/search?q=${encodeURIComponent("Кино Группа крови")}`)).json()).results || []).filter((t) => t.artwork).slice(0, 3);
const seed = { favorites: found, recent: [], playlists: [], onboardingSeenV2: true, settings: { loudness: true } };
await b.goto(`${BASE}/health`);
await b.eval(`localStorage.clear(); localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify(seed))}); true`);
await b.goto(`${BASE}/app/`);
await b.waitFor("!!document.body && document.body.dataset.screen !== 'splash'", 8000, "x");
await b.sleep(800);
await b.click('.tab[data-tab="library"]'); await b.sleep(500);
await b.click("#open-favorites-btn"); await b.sleep(600);
await b.click("#favorites-list .track-row .row-main").catch(async () => { await b.click(".track-row .row-main"); });
await b.waitFor("(() => { const a = document.getElementById('audio'); return !a.paused && a.currentTime > 0.5; })()", 60000, "playing");
check("the track plays with the equalizer on", true);
await b.sleep(9000);
const gain = await b.eval("(() => { try { return JSON.parse(localStorage.getItem('notka_gain') || '{}'); } catch (e) { return {}; } })()");
const vals = Object.values(gain);
check("a level was measured and remembered", vals.length === 1 && vals[0] >= 0.45 && vals[0] <= 1.7, JSON.stringify(gain));
check("the music is still playing", await b.eval("(() => { const a = document.getElementById('audio'); return !a.paused && a.currentTime > 3; })()"));
await b.eval("document.getElementById('screen-sound') && true");
console.log(bad ? "FAILED" : "ALL PASS");
process.exit(bad ? 1 : 0);
