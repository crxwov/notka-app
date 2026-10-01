// «Текст» in the player. Needs tests/serve_local.py running.
//   node tests/lyrics.mjs
import { launch } from "./cdp.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "http://127.0.0.1:8099";
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "shots");
let failed = 0;
const check = (name, ok, extra = "") => { if (!ok) failed++; console.log(ok ? "PASS" : "FAIL", name, extra); };

const search = async (q) => (await (await fetch(`${BASE}/search?q=${encodeURIComponent(q)}`)).json()).results || [];
const synced = (await search("Группа крови Кино")).find((t) => t.artist === "Кино");
if (!synced) throw new Error("need a seed track");
const none = { ...synced, id: "youtube_music:none", title: "Zzqx Нет Такой Песни", artist: "Никто" };
const seed = { favorites: [synced, none], playlists: [], onboardingSeenV2: true };

const b = await launch({ dir });
const audio = "document.getElementById('audio')";
const lines = "document.querySelectorAll('#lyrics-lines .lyrics-line')";
const active = `(() => { const el = document.querySelector('#lyrics-lines .is-active'); return el ? { i: +el.dataset.i, text: el.textContent, top: Math.round(el.getBoundingClientRect().top - document.getElementById('player-lyrics').getBoundingClientRect().top) } : null; })()`;

try {
  await b.goto(`${BASE}/app/`);
  await b.eval(`localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify(seed))}); true`);
  await b.goto(`${BASE}/app/`);
  await b.waitFor("document.body.dataset.screen !== 'splash'", 8000, "leave splash");

  await b.click("#home-favorites-list .track-row:nth-child(1) .row-main");
  await b.waitFor(`(!${audio}.paused && ${audio}.currentTime > 0.4)`, 40000, "track playing");
  await b.click("#mini-open-btn");
  check("no lyrics request before the view is opened", !b.requests.some((u) => u.includes("/lyrics?")));

  // hold the answer back for a moment to see the loading state
  await b.eval(`(() => { const real = window.fetch; window.__realFetch = real; window.fetch = (u, o) => String(u).includes("/lyrics?") ? new Promise((r) => setTimeout(() => r(real(u, o)), 1500)) : real(u, o); return true; })()`);
  await b.click("#player-lyrics-btn");
  await b.sleep(500);
  check("loading shows shimmering lines, not words", await b.eval("!document.getElementById('lyrics-skeleton').hidden && document.getElementById('lyrics-note').textContent === ''"));
  await b.shot("lyrics-loading");
  await b.eval("window.fetch = window.__realFetch; true");
  await b.waitFor(`${lines}.length > 5`, 20000, "lyrics lines");
  check("the shimmer is gone once the text is in", await b.eval("document.getElementById('lyrics-skeleton').hidden"));
  await b.sleep(900);
  const shown = "(() => { const o = (id) => +getComputedStyle(document.getElementById(id)).opacity; return { art: o('player-art'), lyrics: o('player-lyrics') }; })()";
  const open = await b.eval(shown);
  check("lyrics shown in place of the cover", open.art === 0 && open.lyrics === 1, JSON.stringify(open));
  check("lyrics are synced", await b.eval("document.getElementById('lyrics-lines').classList.contains('is-synced')"));

  await b.eval(`${audio}.currentTime = 60; true`);
  await b.sleep(1800);
  const a1 = await b.eval(active);
  check("the sung line is lit and in view", !!a1 && a1.i > 0 && a1.top > 20 && a1.top < 300, JSON.stringify(a1));
  await b.shot("lyrics-synced");

  const target = await b.eval(`(() => { const all = ${lines}; const el = all[all.length - 3]; el.click(); return +el.dataset.i; })()`);
  await b.sleep(1500);
  const a2 = await b.eval(active);
  const t2 = await b.eval(`${audio}.currentTime`);
  check("tap on a line jumps to it", !!a2 && a2.i >= target && t2 > 100, JSON.stringify({ target, a2, t2: Math.round(t2) }));

  check("the track menu is hidden while the text is open", await b.eval("getComputedStyle(document.getElementById('player-more-btn')).opacity === '0'"));

  // a swipe down from the top of the text puts it away
  await b.eval(`${audio}.currentTime = 1; true`);
  await b.sleep(900);
  const box = await b.eval("(() => { const r = document.getElementById('player-lyrics').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 80), top: document.getElementById('player-lyrics').scrollTop }; })()");
  const touch = (type, y) => b.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: box.x, y }] });
  await touch("touchStart", box.y);
  for (let i = 1; i <= 6; i++) { await touch("touchMove", box.y + i * 30); await b.sleep(30); }
  await touch("touchEnd");
  await b.sleep(900);
  check("swipe down puts the text away", await b.eval("!document.body.classList.contains('lyrics-open')") , JSON.stringify(box));
  check("the track menu is back", await b.eval("getComputedStyle(document.getElementById('player-more-btn')).opacity === '1'"));
  await b.click("#player-lyrics-btn");
  await b.sleep(600);

  await b.click("#player-lyrics-btn");
  await b.shot("lyrics-closing");
  await b.sleep(900);
  const closed = await b.eval(shown);
  check("second tap brings the cover back", closed.art === 1 && closed.lyrics === 0 && await b.eval("document.getElementById('player-lyrics').inert"), JSON.stringify(closed));
  await b.shot("lyrics-closed");

  await b.click("#player-lyrics-btn");
  // the second seed track is the same recording under another name, so the
  // real backend would still find its text — answer "nothing" for it here
  await b.eval(`(() => { const real = window.fetch; window.fetch = (u, o) => String(u).includes("/lyrics?") ? Promise.resolve(new Response('{"lines":[],"synced":false}', { headers: { "content-type": "application/json" } })) : real(u, o); return true; })()`);
  await b.click("#player-next-btn");
  await b.waitFor("document.getElementById('lyrics-note').textContent.includes('текста пока нет')", 30000, "empty state");
  check("a track without lyrics says so", (await b.eval(`${lines}.length`)) === 0);
  await b.shot("lyrics-empty");

  check("no page errors", b.errors.length === 0, b.errors.join(" | ").slice(0, 400));
} catch (err) {
  failed++;
  console.log("FAIL", err.message);
  await b.shot("lyrics-fail");
} finally {
  await b.close();
}
process.exit(failed ? 1 : 0);
