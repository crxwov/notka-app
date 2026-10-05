// «Нотка Плюс»: hidden until preview is switched on. Needs tests/serve_local.py running.
//   node tests/plus.mjs
import { launch } from "./cdp.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "http://127.0.0.1:8099";
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "shots");
let failed = 0;
const check = (name, ok, extra = "") => { if (!ok) failed++; console.log(ok ? "PASS" : "FAIL", name, extra); };

const b = await launch({ dir });
try {
  await b.goto(`${BASE}/app/`);
  await b.eval(`localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify({ favorites: [], playlists: [], onboardingSeenV2: true }))}); localStorage.removeItem("notka_plus_preview"); localStorage.removeItem("notka_plus_local"); true`);
  await b.goto(`${BASE}/app/`);
  await b.waitFor("!!document.body && document.body.dataset.screen !== 'splash'", 8000, "leave splash");
  await b.click("#home-avatar-btn");
  // config.js has PLUS_PREVIEW on while Нотка runs from the home computer
  check("the card is in the profile while the preview flag is on", await b.eval("window.NOTKA_CONFIG.PLUS_PREVIEW === true && !document.getElementById('menu-plus').hidden"));
  await b.shot("plus-profile");
  await b.click("#menu-plus");
  await b.sleep(1200);
  check("the screen opens", (await b.eval("document.body.dataset.screen")) === "plus");
  check("the stage shows a theme and seven feature items follow", await b.eval("document.getElementById('plus-stage').dataset.show === 'vinyl' && document.querySelectorAll('#screen-plus .pw-item').length === 7"));
  await b.sleep(4600);
  check("the themes take turns by themselves", await b.eval("document.getElementById('plus-stage').dataset.show === 'cassette'"));
  await b.click('#plus-stage-tabs [data-show="vinyl"]');
  check("the price is in roubles", await b.eval("document.getElementById('plus-bar-note').textContent.includes('89 ₽') && !document.getElementById('plus-bar').textContent.includes('★')"));
  const bar = await b.eval("(() => { const r = document.getElementById('plus-bar').getBoundingClientRect(); return { bottom: Math.round(r.bottom), h: innerHeight }; })()");
  check("the price bar is on screen without scrolling", bar.bottom <= bar.h && bar.bottom > bar.h - 80, JSON.stringify(bar));
  await b.shot("plus-1");
  for (let y = 300; y <= 3600; y += 300) { await b.eval(`document.getElementById('screen-plus').scrollTo(0, ${y}); true`); await b.sleep(180); }
  await b.eval("document.getElementById('screen-plus').scrollTo(0, 99999); true");
  await b.sleep(1500);
  await b.shot("plus-2");
  check("everything has come into view", await b.eval("[...document.querySelectorAll('#screen-plus [data-reveal]')].every((e) => e.classList.contains('is-seen'))"));
  await b.eval("document.getElementById('screen-plus').scrollTo(0, 430); true");
  await b.sleep(1200);
  await b.shot("plus-mid");
  await b.click("#plus-buy-btn");
  await b.sleep(300);
  check("the button switches Плюс on for preview and says no money was taken", await b.eval("document.getElementById('toast').textContent.includes('Оплата не списывалась') && localStorage.getItem('notka_plus_local') === '1'"));
  await b.click("#plus-buy-btn");
  await b.sleep(300);
  check("a second tap switches it off", await b.eval("localStorage.getItem('notka_plus_local') === '0'"));
  check("no page errors", b.errors.length === 0, b.errors.join(" | ").slice(0, 400));
} catch (err) {
  failed++;
  console.log("FAIL", err.message);
  await b.shot("plus-fail");
} finally {
  await b.close();
}
process.exit(failed ? 1 : 0);
