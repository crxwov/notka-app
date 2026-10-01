// Home shelves («Недавнее», «Новое от твоих исполнителей») and «О Нотке».
// Needs tests/serve_local.py running.   node tests/home.mjs
import { launch } from "./cdp.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "http://127.0.0.1:8099";
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "shots");
let failed = 0;
const check = (name, ok, extra = "") => { if (!ok) failed++; console.log(ok ? "PASS" : "FAIL", name, extra); };
const get = async (url) => (await (await fetch(BASE + url)).json()).results || [];

const followedArtists = [], followedMeta = {};
for (const q of ["The Weeknd", "Miyagi", "Скриптонит", "ANNA ASTI"]) {
  const a = (await get(`/artists?q=${encodeURIComponent(q)}&limit=1`))[0];
  if (a) { followedArtists.push(a.name); followedMeta[a.name] = { artistId: a.id, source: a.source, photo: a.photo }; }
}
const tracks = (await get(`/search?q=${encodeURIComponent("Группа крови Кино")}`)).filter((t) => t.artist === "Кино").slice(0, 2);
if (followedArtists.length < 2 || tracks.length < 2) throw new Error("need seed data");
const seed = { favorites: tracks, playlists: [], onboardingSeenV2: true, followedArtists, followedMeta };

const b = await launch({ dir });
const audio = "document.getElementById('audio')";
try {
  await b.goto(`${BASE}/app/`);
  await b.eval(`localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify(seed))}); true`);
  await b.goto(`${BASE}/app/`);
  await b.waitFor("document.body.dataset.screen !== 'splash'", 8000, "leave splash");

  check("«Недавнее» is hidden before anything was played", await b.eval("document.getElementById('home-recent-block').hidden"));
  // while the artists are being asked there is a shimmer; with a warm backend the releases may already be in
  await b.waitFor("!document.getElementById('home-fresh-block').hidden", 5000, "new releases block");
  check("new releases show a shimmer or the releases, never an empty block", await b.eval("document.querySelectorAll('#home-fresh .shelf-skel').length === 3 || document.querySelectorAll('#home-fresh .shelf-card').length > 0"));
  await b.waitFor("document.querySelectorAll('#home-fresh .shelf-card').length > 0 || document.getElementById('home-fresh-block').hidden", 90000, "new releases");
  const fresh = await b.eval("[...document.querySelectorAll('#home-fresh .shelf-card')].map((c) => c.querySelector('.shelf-title').textContent + ' | ' + c.querySelector('.shelf-sub').textContent)");
  const year = new Date().getFullYear();
  check("new releases are listed, recent years only", fresh.length > 0 && fresh.length === (await b.eval("[...document.querySelectorAll('#home-fresh .fresh-tag')].filter((t) => +t.textContent >= " + (year - 1) + ").length")), JSON.stringify(fresh));

  await b.click("#home-favorites-list .track-row:nth-child(1) .row-main");
  await b.waitFor(`(!${audio}.paused && ${audio}.currentTime > 0.4)`, 40000, "first track playing");
  await b.click("#home-favorites-list .track-row:nth-child(2) .row-main");
  await b.waitFor(`(!${audio}.paused && ${audio}.currentTime > 0.4 && ${audio}.src.includes(${JSON.stringify(tracks[1].sourceId)}))`, 40000, "second track playing");
  const recent = await b.eval("[...document.querySelectorAll('#home-recent .shelf-card .shelf-title')].map((e) => e.textContent)");
  check("«Недавнее» lists what was played, newest first", recent.length === 2 && recent[0] === tracks[1].title, JSON.stringify(recent));
  await b.eval("document.getElementById('screen-home').scrollTo(0, 99999); true");
  await b.sleep(1500);
  await b.shot("home");
  check("home blocks have come into view", await b.eval("[...document.querySelectorAll('#screen-home [data-reveal]')].filter((e) => !e.hidden).every((e) => e.classList.contains('is-seen'))"));

  await b.goto(`${BASE}/app/`);
  await b.waitFor("document.body.dataset.screen !== 'splash'", 8000, "leave splash");
  await b.sleep(500);
  check("both shelves are there after reopening, without loading again", await b.eval("document.querySelectorAll('#home-recent .shelf-card').length === 2 && document.querySelectorAll('#home-fresh .shelf-card').length > 0"));
  await b.click("#home-fresh .shelf-card");
  await b.sleep(700);
  check("a new release opens its album", (await b.eval("document.body.dataset.screen")) === "album");

  await b.goto(`${BASE}/app/`);
  await b.waitFor("document.body.dataset.screen !== 'splash'", 8000, "leave splash");
  await b.click("#home-avatar-btn");
  await b.click("#menu-about");
  await b.sleep(600);
  check("«О Нотке» shows what Нотка can do", await b.eval("document.querySelectorAll('#screen-about .bento-card').length === 8"));
  await b.sleep(900);
  await b.shot("about-1");
  await b.eval("document.getElementById('screen-about').scrollTo(0, 99999); true");
  await b.sleep(1500);
  await b.shot("about-2");
  check("every part of «О Нотке» has come into view", await b.eval("[...document.querySelectorAll('#screen-about [data-reveal]')].every((e) => e.classList.contains('is-seen'))"));
  check("no page errors", b.errors.length === 0, b.errors.join(" | ").slice(0, 400));
} catch (err) {
  failed++;
  console.log("FAIL", err.message);
  await b.shot("home-fail");
} finally {
  await b.close();
}
process.exit(failed ? 1 : 0);
