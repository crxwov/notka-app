// Свайп по плееру: влево — следующий трек, вправо — предыдущий; кнопки и ползунок свайпом не задеваем.
//   node tests/swipe.mjs   (нужен tests/serve_local.py и интернет)
import { launch } from "./cdp.mjs";
const BASE = "http://127.0.0.1:8099";
const b = await launch({ dir: "C:/Users/leksik/Documents/Notka/tests/shots", port: 9378 });
let bad = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "PASS " : "FAIL ") + name + " " + extra); if (!ok) bad++; };
const found = ((await (await fetch(`${BASE}/search?q=${encodeURIComponent("Кино Группа крови")}`)).json()).results || []).filter((t) => t.artwork);
const uniq = []; found.forEach((t) => { if (!uniq.some((u) => u.title === t.title)) uniq.push(t); });
const seed = { favorites: uniq.slice(0, 4), recent: [], playlists: [], onboardingSeenV2: true, settings: {} };
await b.goto(`${BASE}/health`);
await b.eval(`localStorage.clear(); localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify(seed))}); true`);
await b.goto(`${BASE}/app/`);
await b.waitFor("!!document.body && document.body.dataset.screen !== 'splash'", 8000, "x");
await b.sleep(800);
await b.click('.tab[data-tab="library"]'); await b.sleep(500);
await b.click("#open-favorites-btn"); await b.sleep(600);
await b.click("#favorites-list .track-row .row-main");
await b.waitFor("(() => { const a = document.getElementById('audio'); return !a.paused && a.currentTime > 0.3; })()", 60000, "playing");
await b.click("#mini-open-btn"); await b.sleep(900);
const title = () => b.eval("document.getElementById('audio').getAttribute('src')");
const t0 = await title();
const mouse = (type, x, y) => b.send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
const drag = async (x0, x1, y) => {
  await mouse("mousePressed", x0, y);
  const n = 10;
  for (let i = 1; i <= n; i++) { await mouse("mouseMoved", x0 + ((x1 - x0) * i) / n, y); await b.sleep(15); }
  await mouse("mouseReleased", x1, y);
};
const my = await b.eval("(() => { const r = document.querySelector('.player-art-wrap').getBoundingClientRect(); return Math.round(r.top + r.height / 2); })()");
await drag(330, 90, my);
await b.waitFor(`document.getElementById('audio').getAttribute('src') !== ${JSON.stringify(t0)}`, 20000, "next track").catch(() => {});
const t1 = await title();
check("a swipe to the left plays the next track", t1 !== t0, `${t0} -> ${t1}`);
await b.waitFor("(() => { const a = document.getElementById('audio'); return !a.paused; })()", 30000, "playing 2");
await drag(80, 330, my);
await b.waitFor(`document.getElementById('audio').getAttribute('src') !== ${JSON.stringify(t1)}`, 20000, "previous track").catch(() => {});
const t2 = await title();
check("a swipe to the right goes back", t2 === t0, `${t1} -> ${t2}`);
const tt = await title();
await drag(120, 140, my);
await b.sleep(500);
check("a tiny move does nothing", (await title()) === tt);
const sy = await b.eval("(() => { const r = document.getElementById('player-progress-track').getBoundingClientRect(); return Math.round(r.top + r.height / 2); })()");
await drag(300, 120, sy);
await b.sleep(500);
check("dragging the progress bar is not a swipe", (await title()) === tt);
console.log(bad ? "FAILED" : "ALL PASS");
process.exit(bad ? 1 : 0);
