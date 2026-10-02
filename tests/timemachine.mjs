// «Машина времени» and the «Друг Нотки» badge. Needs tests/serve_local.py running.
//   node tests/timemachine.mjs
import { launch } from "./cdp.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "http://127.0.0.1:8099";
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "shots");
let failed = 0;
const check = (name, ok, extra = "") => { if (!ok) failed++; console.log(ok ? "PASS" : "FAIL", name, extra); };

const mk = (title, artist, vid) => ({ id: `youtube_music_${vid}`, source: "youtube_music", sourceId: vid, title, artist, duration: 240, artwork: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` });
const tr = [mk("Yellow", "Coldplay", "yKNxeF4KMsY"), mk("Creep", "Radiohead", "XFkzRNyygfk"), mk("Du Hast", "Rammstein", "W3q8Od5qJio"), mk("Кукушка", "Кино", "8w1U6x7gFJY")];
const key = (daysAgo) => { const d = new Date(Date.now() - daysAgo * 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const day = (ids) => ({ s: 1800, p: ids.length, t: Object.fromEntries(ids.map((id, i) => [id, [1, 600 - i * 100]])), a: {} });
const state = {
  favorites: [], onboardingSeenV2: true, recent: tr, playlists: [], settings: {},
  listens: { seconds: 9000, plays: 40, artists: {}, tracks: Object.fromEntries(tr.map((t) => [t.id, { track: t, plays: 3, seconds: 600 }])), days: { [key(7)]: day(tr.map((t) => t.id)), [key(31)]: day(tr.slice(0, 3).map((t) => t.id)), [key(2)]: day([tr[0].id]) } },
};

const b = await launch({ dir });
try {
  await b.goto(`${BASE}/app/`);
  await b.eval(`localStorage.clear(); localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify(state))}); true`);
  await b.goto(`${BASE}/app/`);
  await b.waitFor("document.body.dataset.screen !== 'splash'", 8000, "leave splash");
  await b.sleep(900);
  check("the cards come for the days that have enough in them", await b.eval("document.querySelectorAll('#home-time .shelf-card').length === 2 && !document.getElementById('home-time-block').hidden"));
  check("without Плюс they are veiled", await b.eval("document.querySelectorAll('#home-time .shelf-card.is-locked').length === 2"));
  await b.eval("document.getElementById('home-time-block').scrollIntoView({ block: 'center' }); true");
  await b.sleep(900);
  await b.shot("time-locked");
  await b.click("#home-time .shelf-card");
  await b.sleep(700);
  check("without Плюс a card leads to the Плюс page", (await b.eval("document.body.dataset.screen")) === "plus");
  check("no badge without Плюс", await b.eval("document.getElementById('friend-badge').hidden"));

  await b.eval(`localStorage.setItem("notka_plus_local", "1"); true`);
  await b.goto(`${BASE}/app/`);
  await b.waitFor("document.body.dataset.screen !== 'splash'", 8000, "leave splash");
  await b.sleep(900);
  check("with Плюс the veil is gone", await b.eval("document.querySelectorAll('#home-time .shelf-card.is-locked').length === 0"));
  await b.click("#home-time .shelf-card");
  await b.sleep(900);
  check("a card opens its day with the tracks", await b.eval("document.getElementById('time-sheet').classList.contains('open') && document.querySelectorAll('#time-list .track-row').length === 4 && document.getElementById('time-sheet-title').textContent === 'Неделю назад'"));
  await b.shot("time-sheet");
  await b.click("#time-close");
  await b.sleep(500);
  await b.click("#home-avatar-btn");
  await b.sleep(700);
  check("the badge shows in the profile with Плюс", await b.eval("!document.getElementById('friend-badge').hidden && document.getElementById('friend-badge').dataset.tier === 'new'"));
  await b.shot("friend-new");
  for (const [days, tier] of [[45, "gold"], [200, "veteran"]]) {
    await b.eval(`localStorage.setItem("notka_plus_since", String(Date.now() - ${days} * 86400000)); true`);
    await b.goto(`${BASE}/app/`);
    await b.waitFor("document.body.dataset.screen !== 'splash'", 8000, "leave splash");
    await b.click("#home-avatar-btn");
    await b.sleep(600);
    check(`after ${days} days the badge is «${tier}»`, await b.eval(`document.getElementById('friend-badge').dataset.tier === '${tier}'`));
    await b.shot(`friend-${tier}`);
  }
  check("no page errors", b.errors.length === 0, b.errors.join(" | ").slice(0, 400));
} catch (e) { failed++; console.log("FAIL", e.message); await b.shot("time-fail"); } finally { await b.close(); }
process.exit(failed ? 1 : 0);
