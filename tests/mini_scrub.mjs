// Перемотка из миниплеера: тап и перетаскивание по нижней кромке меняют позицию трека.
//   node tests/mini_scrub.mjs   (нужен tests/serve_local.py и интернет)
import { launch } from "./cdp.mjs";
const BASE = "http://127.0.0.1:8099";
const b = await launch({ dir: "C:/Users/leksik/Documents/Notka/tests/shots", port: 9379 });
let bad = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "PASS " : "FAIL ") + name + " " + extra); if (!ok) bad++; };
const found = ((await (await fetch(`${BASE}/search?q=${encodeURIComponent("Кино Группа крови")}`)).json()).results || []).filter((t) => t.artwork);
const seed = { favorites: found.slice(0, 3), recent: [], playlists: [], onboardingSeenV2: true, settings: {} };
await b.goto(`${BASE}/health`);
await b.eval(`localStorage.clear(); localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify(seed))}); true`);
await b.goto(`${BASE}/app/`);
await b.waitFor("!!document.body && document.body.dataset.screen !== 'splash'", 8000, "x");
await b.sleep(800);
await b.click('.tab[data-tab="library"]'); await b.sleep(500);
await b.click("#open-favorites-btn"); await b.sleep(600);
await b.click("#favorites-list .track-row .row-main");
await b.waitFor("(() => { const a = document.getElementById('audio'); return !a.paused && a.currentTime > 0.3; })()", 60000, "playing");
await b.sleep(300);
const mouse = (type, x, y) => b.send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
const geo = await b.eval("(() => { const r = document.getElementById('mp-scrub').getBoundingClientRect(); return JSON.stringify({ l: r.left, w: r.width, y: r.top + r.height - 5 }); })()");
const g = JSON.parse(geo);
const dur = await b.eval("(() => { const a = document.getElementById('audio'); return a.duration || 0; })()");
const at = () => b.eval("document.getElementById('audio').currentTime");
const x = g.l + 18 + (g.w - 36) * 0.75;
await mouse("mousePressed", x, g.y); await mouse("mouseReleased", x, g.y);
await b.sleep(600);
const p1 = await at();
check("tap at 75% of the mini player seeks there", Math.abs(p1 / dur - 0.75) < 0.06, `pos ${p1.toFixed(1)} / ${dur.toFixed(1)}`);
check("the player screen stays closed", await b.eval("document.body.dataset.screen !== 'player'"));
const x2 = g.l + 18 + (g.w - 36) * 0.2;
await mouse("mousePressed", x, g.y);
for (let i = 1; i <= 8; i++) { await mouse("mouseMoved", x + ((x2 - x) * i) / 8, g.y); await b.sleep(15); }
await mouse("mouseReleased", x2, g.y);
await b.sleep(600);
const p2 = await at();
check("dragging to 20% seeks there", Math.abs(p2 / dur - 0.2) < 0.06, `pos ${p2.toFixed(1)}`);
await b.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }).catch(() => {});
const shot = await b.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: g.y - 80, width: 390, height: 100, scale: 2 } });
(await import("node:fs")).writeFileSync("_tmp/mini.png", Buffer.from(shot.data, "base64"));
// higher in the strip: a drag seeks, a plain tap opens the player
const yHigh = g.y - 18;
const x3 = g.l + 18 + (g.w - 36) * 0.5, x4 = g.l + 18 + (g.w - 36) * 0.9;
await mouse("mousePressed", x3, yHigh);
for (let i = 1; i <= 8; i++) { await mouse("mouseMoved", x3 + ((x4 - x3) * i) / 8, yHigh); await b.sleep(15); }
await mouse("mouseReleased", x4, yHigh);
await b.sleep(600);
const p3 = await at();
check("a sideways drag higher in the strip seeks", Math.abs(p3 / dur - 0.9) < 0.06, `pos ${p3.toFixed(1)}`);
check("...and does not open the player", await b.eval("document.body.dataset.screen !== 'player'"));
await mouse("mousePressed", x3, yHigh); await mouse("mouseReleased", x3, yHigh);
await b.sleep(900);
check("a plain tap higher in the strip opens the player", await b.eval("document.body.dataset.screen === 'player'"));
console.log(bad ? "FAILED" : "ALL PASS");
process.exit(bad ? 1 : 0);
