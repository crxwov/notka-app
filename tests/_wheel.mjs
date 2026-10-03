// Снимки «барабана» Плюса и витрины под ним: по кадру на каждую функцию. Нужен tests/serve_local.py.
//   node tests/_wheel.mjs
import { launch } from "./cdp.mjs";
const BASE = "http://127.0.0.1:8099";
const b = await launch({ dir: "C:/Users/leksik/Documents/Notka/tests/shots" });
const mk = (t, a, v) => ({ id: `youtube_music_${v}`, source: "youtube_music", sourceId: v, title: t, artist: a, duration: 240, artwork: `https://i.ytimg.com/vi/${v}/hqdefault.jpg` });
const tr = [mk("Yellow", "Coldplay", "yKNxeF4KMsY"), mk("Creep", "Radiohead", "XFkzRNyygfk")];
const st = { favorites: tr, onboardingSeenV2: true, recent: tr, playlists: [], settings: {}, accountName: "Лёша", listens: { seconds: 5400, plays: 30, tracks: {}, artists: {} } };
await b.goto(`${BASE}/health`);
await b.eval(`localStorage.clear(); localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify(st))}); true`);
await b.goto(`${BASE}/app/`);
await b.waitFor("document.body.dataset.screen !== 'splash'", 8000, "x");
await b.sleep(1200);
await b.click("#home-avatar-btn"); await b.sleep(800);
await b.eval("document.getElementById('menu-plus').hidden=false; true");
await b.click("#menu-plus"); await b.sleep(2200);
const y = await b.eval("(() => { const r = document.getElementById('plus-wheel').getBoundingClientRect(); return Math.round(r.top + 100); })()");
const mouse = (type, x, extra = {}) => b.send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1, ...extra });
for (let i = 0; i < 7; i++) {
  await b.eval("document.getElementById('screen-plus').scrollTo(0, 0); true");
  await b.sleep(900);
  await b.shot(`wheel-${i}-top`);
  await b.eval("document.getElementById('screen-plus').scrollTo(0, 330); true");
  await b.sleep(400);
  await b.shot(`wheel-${i}-demo`);
  await b.eval("document.getElementById('screen-plus').scrollTo(0, 0); true");
  await b.sleep(300);
  const yy = y;
  await mouse("mousePressed", 300);
  for (let x = 300; x >= 170; x -= 20) { await mouse("mouseMoved", x); await b.sleep(14); }
  await mouse("mouseReleased", 170);
  await b.sleep(1300);
}
console.log(b.errors.join("|").slice(0, 400) || "ok");
await b.close();
