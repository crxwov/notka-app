// Player themes (Нотка Плюс) and "try before buying". Needs tests/serve_local.py running.
//   node tests/themes.mjs
import { launch } from "./cdp.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "http://127.0.0.1:8099";
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "shots");
let failed = 0;
const check = (name, ok, extra = "") => { if (!ok) failed++; console.log(ok ? "PASS" : "FAIL", name, extra); };

const search = async (q) => (await (await fetch(`${BASE}/search?q=${encodeURIComponent(q)}`)).json()).results || [];
const tracks = (await search("Группа крови Кино")).filter((t) => t.artist === "Кино").slice(0, 2);
if (tracks.length < 2) throw new Error("need seed tracks");

const b = await launch({ dir });
const audio = "document.getElementById('audio')";
const theme = () => b.eval("document.body.dataset.playerTheme");
const pick = async (name) => {
  await b.click("#player-more-btn");
  await b.click("#player-theme-btn");
  await b.click(`.theme-opt[data-theme="${name}"]`);
};
try {
  await b.goto(`${BASE}/app/`);
  await b.eval(`localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify({ favorites: tracks, playlists: [], onboardingSeenV2: true }))}); localStorage.removeItem("notka_plus_local"); true`);
  await b.goto(`${BASE}/app/`);
  await b.waitFor("document.body.dataset.screen !== 'splash'", 8000, "leave splash");
  await b.click("#home-favorites-list .track-row:nth-child(1) .row-main");
  await b.waitFor(`(!${audio}.paused && ${audio}.currentTime > 0.4)`, 40000, "track playing");
  await b.click("#mini-open-btn");
  check("the player starts in the standard theme", (await theme()) === "standard");

  // without Плюс: a theme can be tried, and it isn't saved
  await pick("vinyl");
  check("vinyl is on for a try", (await theme()) === "vinyl" && !(await b.eval("document.getElementById('theme-try').hidden")));
  check("a tried theme is not saved", (await b.eval(`JSON.parse(localStorage.getItem("notka_state_v2")).settings.playerTheme || "standard"`)) === "standard");
  await b.shot("theme-sheet");
  await b.click("#player-theme-close");
  await b.sleep(1600);
  const spin = await b.eval("(() => { const a = getComputedStyle(document.getElementById('player-art')); return { round: a.borderRadius, state: a.animationPlayState, deco: getComputedStyle(document.querySelector('.vinyl-deco')).display }; })()");
  check("the record is round, turning, with grooves", spin.round === "50%" && spin.state === "running" && spin.deco === "block", JSON.stringify(spin));
  await b.shot("theme-vinyl");

  // the record can be touched: a tap pauses, turning it by the finger moves through the track
  const disc = await b.eval("(() => { const r = document.getElementById('player-art').getBoundingClientRect(); return { cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2), R: Math.round(r.width * 0.36) }; })()");
  const touch = (type, x, y) => b.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  await touch("touchStart", disc.cx, disc.cy - 40); await touch("touchEnd");
  await b.sleep(500);
  check("a tap on the record pauses", await b.eval(`${audio}.paused`));
  await touch("touchStart", disc.cx, disc.cy - 40); await touch("touchEnd");
  await b.sleep(900);
  check("another tap plays again", !(await b.eval(`${audio}.paused`)));
  const before = await b.eval(`${audio}.currentTime`);
  await touch("touchStart", disc.cx + disc.R, disc.cy);
  for (let a = 10; a <= 180; a += 10) { await touch("touchMove", Math.round(disc.cx + disc.R * Math.cos(a * Math.PI / 180)), Math.round(disc.cy + disc.R * Math.sin(a * Math.PI / 180))); await b.sleep(15); }
  const held = await b.eval("document.body.classList.contains('art-held') && getComputedStyle(document.querySelector('.player-art-wrap')).getPropertyValue('--scrub')");
  await touch("touchEnd");
  await b.sleep(700);
  const after = await b.eval(`${audio}.currentTime`);
  check("half a turn forward moves about 7 seconds ahead", after - before > 5 && after - before < 11 && String(held).includes("deg"), JSON.stringify({ before: +before.toFixed(1), after: +after.toFixed(1), held }));

  await pick("cd");
  await b.click("#player-theme-close");
  await b.sleep(900);
  const cd = await b.eval("(() => { const a = getComputedStyle(document.getElementById('player-art')); const d = getComputedStyle(document.querySelector('.vinyl-deco')); return { round: a.borderRadius, deco: d.display, sheen: d.backgroundImage.includes('conic-gradient'), arm: getComputedStyle(document.querySelector('.player-art-wrap .tonearm')).display }; })()");
  check("the disc is round, with a rainbow and no arm", cd.round === "50%" && cd.deco === "block" && cd.sheen && cd.arm === "none", JSON.stringify(cd));
  await b.shot("theme-cd");

  await pick("cassette");
  await b.click("#player-theme-close");
  await b.sleep(900);
  const cas = await b.eval("(() => { const c = document.querySelector('.player-art-wrap .cassette'); const r = c.getBoundingClientRect(); return { shown: getComputedStyle(c).display, w: Math.round(r.width), h: Math.round(r.height), label: document.getElementById('cassette-art').style.backgroundImage.length > 10, title: document.getElementById('cassette-title').textContent, art: getComputedStyle(document.getElementById('player-art')).display }; })()");
  check("the cassette replaces the cover and carries it on its sticker", cas.shown === "block" && cas.art === "none" && cas.label && cas.title.includes("Группа крови") && cas.w > 200 && (await b.eval("document.getElementById('cassette-artist').textContent")) === "Кино", JSON.stringify(cas));
  await b.shot("theme-cassette");
  const t0 = await b.eval(`${audio}.currentTime`);
  const box = await b.eval("(() => { const r = document.querySelector('.player-art-wrap .cassette').getBoundingClientRect(); return { x: Math.round(r.left + 40), y: Math.round(r.top + r.height / 2), w: Math.round(r.width) }; })()");
  await touch("touchStart", box.x, box.y);
  for (let i = 1; i <= 8; i++) { await touch("touchMove", box.x + i * Math.round(box.w / 16), box.y); await b.sleep(15); }
  await touch("touchEnd");
  await b.sleep(700);
  const t1 = await b.eval(`${audio}.currentTime`);
  check("a drag across half the cassette winds half a minute ahead", t1 - t0 > 24 && t1 - t0 < 36, JSON.stringify({ t0: +t0.toFixed(1), t1: +t1.toFixed(1) }));
  check("the tape has moved between the reels", await b.eval("+document.querySelector('.player-art-wrap .cassette').style.getPropertyValue('--p') > 0.05"));

  // "Оставить" leads to Плюс; switching Плюс on keeps the theme
  await b.click("#theme-try-keep");
  await b.sleep(700);
  check("«Оставить» opens Нотка Плюс", (await b.eval("document.body.dataset.screen")) === "plus");
  await b.click("#plus-buy-btn");
  await b.sleep(400);
  check("with Плюс the tried theme stays and is saved", (await theme()) === "cassette" && (await b.eval(`JSON.parse(localStorage.getItem("notka_state_v2")).settings.playerTheme`)) === "cassette" && (await b.eval("document.getElementById('theme-try').hidden")));

  await b.goto(`${BASE}/app/`);
  await b.waitFor("document.body.dataset.screen !== 'splash'", 8000, "leave splash");
  check("the theme is still there after reopening", (await theme()) === "cassette");

  // Плюс off again: back to the standard player
  await b.click("#home-avatar-btn");
  await b.click("#menu-plus");
  await b.click("#plus-buy-btn");
  await b.sleep(400);
  check("without Плюс the player goes back to standard", (await theme()) === "standard");
  // a short window, as in Telegram Desktop: the track menu must not lose its last rows
  await b.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 560, deviceScaleFactor: 2, mobile: true });
  await b.click("#mini-open-btn");
  await b.click("#player-more-btn");
  await b.sleep(700);
  const menu = await b.eval("(() => { const s = document.querySelector('#track-menu-sheet .sheet'); const last = document.getElementById('track-menu-close'); last.scrollIntoView({ block: 'end' }); const r = last.getBoundingClientRect(); const top = s.getBoundingClientRect().top; return { fits: Math.round(r.bottom) <= innerHeight, sheetTop: Math.round(top), scrolls: s.scrollHeight > s.clientHeight, rows: s.querySelectorAll('.sheet-row').length }; })()");
  check("every row of the track menu can be reached in a short window", menu.fits && menu.sheetTop >= 0, JSON.stringify(menu));
  await b.shot("menu-short-window");

  check("no page errors", b.errors.length === 0, b.errors.join(" | ").slice(0, 400));
} catch (err) {
  failed++;
  console.log("FAIL", err.message);
  await b.shot("themes-fail");
} finally {
  await b.close();
}
process.exit(failed ? 1 : 0);
