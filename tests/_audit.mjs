// Обход всех экранов: снимки и измерения шапок, заголовков, отступов, скруглений.
//   node tests/_audit.mjs [префикс]      (нужен tests/serve_local.py)
import { launch } from "./cdp.mjs";
import fs from "node:fs";
const BASE = "http://127.0.0.1:8099";
const P = process.argv[2] || "aud";
const b = await launch({ dir: "C:/Users/leksik/Documents/Notka/tests/shots", port: 9378 });
const search = async (q) => (await (await fetch(`${BASE}/search?q=${encodeURIComponent(q)}`)).json()).results || [];
const kino = (await search("Группа крови Кино")).filter((t) => t.artwork).slice(0, 4);
const other = (await search("Miyagi Minor")).filter((t) => t.artwork).slice(0, 3);
const tracks = [...kino, ...other];
const seed = {
  favorites: tracks, recent: tracks.slice(0, 4), onboardingSeenV2: true, accountName: "Лёша",
  playlists: [{ id: "p1", name: "Вечер", trackIds: tracks.slice(0, 5).map((t) => t.id), tracksCache: Object.fromEntries(tracks.slice(0, 5).map((t) => [t.id, t])), createdAt: Date.now() }, { id: "p2", name: "Дорога", trackIds: tracks.slice(2, 6).map((t) => t.id), tracksCache: Object.fromEntries(tracks.slice(2, 6).map((t) => [t.id, t])), createdAt: Date.now() - 1000 }],
  settings: {},
  listens: { seconds: 5400, plays: 30, tracks: Object.fromEntries(tracks.slice(0, 3).map((t, i) => [t.id, { track: t, plays: 12 - i * 3, seconds: 3000 - i * 700 }])), artists: { Кино: { plays: 12, seconds: 3000 }, Miyagi: { plays: 8, seconds: 2400 } }, days: {} },
};
await b.goto(`${BASE}/health`);
await b.eval(`localStorage.clear(); localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify(seed))}); true`);
await b.goto(`${BASE}/app/`);
await b.waitFor("!!document.body && document.body.dataset.screen !== 'splash'", 8000, "x");
await b.sleep(1500);

const measure = `(() => {
  const sc = document.querySelector('.screen:not([hidden])');
  if (!sc) return null;
  const r = (el) => { if (!el) return null; const q = el.getBoundingClientRect(); const s = getComputedStyle(el); return { x: Math.round(q.left), y: Math.round(q.top), w: Math.round(q.width), h: Math.round(q.height), fs: s.fontSize, fw: s.fontWeight, ls: s.letterSpacing, col: s.color, clip: s.backgroundClip, rad: s.borderRadius }; };
  const back = sc.querySelector('.back-btn');
  const title = sc.querySelector('.page-title, .display, .look-title, .mood-title, .plus-title, .hero-title, h1');
  const bar = sc.querySelector('.bar-title');
  const h2 = [...sc.querySelectorAll('h2')].filter((e) => e.offsetParent).slice(0, 6).map((e) => { const s = getComputedStyle(e); return s.fontSize + '/' + s.fontWeight; });
  const first = [...sc.children].find((e) => e.offsetParent && !e.classList.contains('bar'));
  const pad = getComputedStyle(sc);
  return { id: sc.id, padL: pad.paddingLeft, padR: pad.paddingRight, padT: pad.paddingTop, back: r(back), barTitle: r(bar), title: r(title), titleText: title ? title.textContent.trim().slice(0, 30) : null, h2: h2.join(' '), firstBlock: first ? r(first) : null };
})()`;
const report = [];
const snap = async (name, extra = 700) => {
  await b.sleep(extra);
  const m = await b.eval(measure);
  report.push({ name, ...m });
  await b.shot(`${P}-${name}`);
};
const back = async () => { await b.eval("(() => { const x = document.querySelector('.screen:not([hidden]) .back-btn'); if (x) x.click(); return true; })()"); await b.sleep(600); };

await snap("home", 1200);
await b.eval("document.getElementById('screen-home').scrollTo(0, 700); true"); await snap("home2", 900);
await b.eval("document.getElementById('screen-home').scrollTo(0, 0); true");
await b.click('.tab[data-tab="search"]'); await snap("search-empty");
await b.eval("(() => { const i = document.getElementById('search-input'); i.value = 'Кино'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true; })()");
await b.waitFor("document.querySelectorAll('#search-state-results *').length > 5", 20000, "results").catch(() => {});
await snap("search-results", 1500);
await b.click('#search-tabs [data-tab="artists"]'); await snap("search-artists", 900);
await b.eval("(() => { const c = document.querySelector('#search-state-results .track-row .row-main'); if (c) c.click(); return true; })()");
await snap("artist", 2200);
await back();
await b.click('#search-tabs [data-tab="albums"]'); await b.sleep(900);
await b.eval("(() => { const c = document.querySelector('#search-state-results .track-row .row-main'); if (c) c.click(); return true; })()");
await snap("album", 2200);
await back();
await b.click('.tab[data-tab="library"]'); await snap("library", 900);
await b.click("#open-favorites-btn"); await snap("favorites", 900); await back();
await b.eval("(() => { const c = document.querySelector('#playlists-grid .playlist-card'); if (c) c.click(); return true; })()"); await snap("playlist", 900);
await b.click("#playlist-menu-btn"); await snap("playlist-menu", 500);
await b.eval("(() => { const c = document.getElementById('menu-addtracks'); if (c) c.click(); return true; })()"); await snap("add-tracks", 900); await back();
await b.click("#playlist-menu-btn"); await b.sleep(400);
await b.eval("(() => { const c = document.getElementById('menu-editlist'); if (c) c.click(); return true; })()"); await snap("edit-playlist", 900); await back();
await b.click("#playlist-menu-btn"); await b.sleep(300);
await b.eval("(() => { const c = document.getElementById('playlist-menu-close'); if (c) c.click(); return true; })()"); await b.sleep(400);
await back();
await b.click('.tab[data-tab="home"]'); await b.sleep(400);
await b.click("#home-avatar-btn"); await snap("profile", 1000);
for (const [id, name] of [["menu-account", "account"], ["menu-stats", "stats"], ["menu-look", "look"], ["menu-sound", "sound"], ["menu-about", "about"]]) {
  await b.click("#" + id); await snap(name, 1100); await back();
}
await b.eval("(() => { const c = document.getElementById('menu-plus'); if (c && !c.hidden) c.click(); return true; })()"); await snap("plus", 1200); await back();
await back();
await b.eval("(() => { const c = [...document.querySelectorAll('#screen-home button')].find((e) => /настроение/i.test(e.textContent)); if (c) c.click(); return true; })()"); await snap("mood", 1200); await back();
await b.eval("(() => { const c = document.getElementById('home-event'); if (c && !c.hidden) c.click(); return true; })()"); await snap("event", 1200); await back();
await b.eval("document.querySelectorAll('#home-favorites-list .track-row .row-main')[0].click(); true");
await b.sleep(6000);
await b.eval("(() => { const c = document.getElementById('mini-open-btn'); if (c) c.click(); return true; })()"); await snap("player", 1500);
fs.writeFileSync("C:/Users/leksik/Documents/Notka/tests/shots/" + P + "-report.json", JSON.stringify(report, null, 1));
console.log(b.errors.filter((e) => !/Haptic/.test(e)).join("|").slice(0, 300) || "ok");
await b.close();
