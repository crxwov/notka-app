// Узор выбран — миниатюры остальных не должны меняться.   node tests/_patbug.mjs
import { launch } from "./cdp.mjs";
const BASE = "http://127.0.0.1:8099";
const b = await launch({ dir: "C:/Users/leksik/Documents/Notka/tests/shots", port: 9376 });
const mk = (t, a, v) => ({ id: `youtube_music_${v}`, source: "youtube_music", sourceId: v, title: t, artist: a, duration: 240, artwork: `https://i.ytimg.com/vi/${v}/hqdefault.jpg` });
const tr = [mk("Yellow", "Coldplay", "yKNxeF4KMsY"), mk("Creep", "Radiohead", "XFkzRNyygfk")];
await b.goto(`${BASE}/health`);
await b.eval(`localStorage.clear(); localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify({ favorites: tr, onboardingSeenV2: true, recent: tr, playlists: [], settings: {} }))}); true`);
await b.goto(`${BASE}/app/`);
await b.waitFor("document.body.dataset.screen !== 'splash'", 8000, "x");
await b.click("#home-avatar-btn"); await b.click("#menu-look"); await b.sleep(900);
const snap = `JSON.stringify([...document.querySelectorAll('.pattern-opt')].map((o) => { const t = o.querySelector('.pattern-thumb'); const s = t.querySelector('.light-shape i'); const g = t.querySelector('.orb-violet'); return [o.dataset.bg, getComputedStyle(s).display, getComputedStyle(g).animationName, getComputedStyle(t.querySelector('.light-group')).width]; }))`;
const a = await b.eval(snap);
let bad = 0;
for (const bg of ["prism", "aurora", "horizon", "lava", "light"]) {
  await b.click(`.pattern-opt[data-bg="${bg}"]`); await b.sleep(500);
  const now = await b.eval(snap);
  const same = now === a;
  if (!same) bad++;
  console.log(same ? "PASS" : "FAIL", "previews unchanged after picking", bg);
}
const cover = await b.eval("document.querySelectorAll('#look-covers .look-cover').length");
console.log("covers:", cover, "errors:", b.errors.filter((e) => !/Haptic/.test(e)).join("|").slice(0, 200) || "none");
await b.close();
process.exit(bad ? 1 : 0);
