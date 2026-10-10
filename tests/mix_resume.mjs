// «Мой микс»: ушёл на другой трек, вернулся — микс продолжается с того же трека и секунды.
//   node tests/mix_resume.mjs   (нужен tests/serve_local.py и интернет)
import { launch } from "./cdp.mjs";
const BASE = "http://127.0.0.1:8099";
const b = await launch({ dir: "C:/Users/leksik/Documents/Notka/tests/shots", port: 9380 });
let bad = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "PASS " : "FAIL ") + name + " " + extra); if (!ok) bad++; };
const found = ((await (await fetch(`${BASE}/search?q=${encodeURIComponent("Кино Группа крови")}`)).json()).results || []).filter((t) => t.artwork && t.source === "youtube_music");
const uniq = []; found.forEach((t) => { if (!uniq.some((u) => u.title === t.title)) uniq.push(t); });
const seed = { favorites: uniq.slice(0, 4), recent: [], playlists: [], onboardingSeenV2: true, settings: {} };
await b.goto(`${BASE}/health`);
await b.eval(`localStorage.clear(); localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify(seed))}); true`);
await b.goto(`${BASE}/app/`);
await b.waitFor("!!document.body && document.body.dataset.screen !== 'splash'", 8000, "x");
await b.sleep(800);
const src = () => b.eval("document.getElementById('audio').getAttribute('src')");
const playing = () => b.waitFor("(() => { const a = document.getElementById('audio'); return !a.paused && a.currentTime > 0.3; })()", 60000, "playing");

await b.click("#mymix-play-btn");
await playing();
const first = await src();
// the second track of the mix
await b.click("#player-next-btn").catch(async () => { await b.eval("document.getElementById('mini-open-btn').click(); true"); await b.sleep(500); await b.click("#player-next-btn"); });
await b.waitFor(`document.getElementById('audio').getAttribute('src') !== ${JSON.stringify(first)}`, 60000, "second track");
await playing();
const mixTrack = await src();
await b.sleep(600);
await b.eval("document.getElementById('audio').currentTime = 40; true");
await b.sleep(1500);

// leave for a track outside the mix
await b.eval("document.getElementById('mini-open-btn').click(); true");
await b.goBack?.().catch(() => {});
await b.eval("window.__leave = true; true");
await b.click('.tab[data-tab="library"]').catch(() => {});
await b.sleep(500);
await b.click("#open-favorites-btn"); await b.sleep(600);
await b.click("#favorites-list .track-row .row-main");
await b.waitFor(`document.getElementById('audio').getAttribute('src') !== ${JSON.stringify(mixTrack)}`, 60000, "other track").catch(() => {});
await playing();
const other = await src();
check("it left the mix for another track", other !== mixTrack);
const saved = await b.eval("localStorage.getItem('notka_mix_resume')");
check("the mix's place is stored", !!saved && saved.includes('"mymix"'));

// back to the mix
await b.click('.tab[data-tab="home"]'); await b.sleep(600);
await b.click("#mymix-play-btn");
await b.waitFor(`document.getElementById('audio').getAttribute('src') === ${JSON.stringify(mixTrack)}`, 60000, "mix again").catch(() => {});
await playing();
await b.sleep(800);
const back = await src();
const pos = await b.eval("document.getElementById('audio').currentTime");
check("the mix goes on with the same track", back === mixTrack);
check("...from the same second", pos > 38 && pos < 50, `pos ${pos.toFixed(1)}`);
console.log(bad ? "FAILED" : "ALL PASS");
process.exit(bad ? 1 : 0);
