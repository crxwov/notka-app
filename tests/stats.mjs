// «Статистика». Needs tests/serve_local.py running.
//   node tests/stats.mjs
import { launch } from "./cdp.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "http://127.0.0.1:8099";
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "shots");
let failed = 0;
const check = (name, ok, extra = "") => { if (!ok) failed++; console.log(ok ? "PASS" : "FAIL", name, extra); };

const search = async (q) => (await (await fetch(`${BASE}/search?q=${encodeURIComponent(q)}`)).json()).results || [];
const pick = async (q, n) => (await search(q)).filter((t) => t.artwork).slice(0, n);
const groups = await Promise.all([pick("Кино Группа крови", 3), pick("Miyagi", 2), pick("The Weeknd", 2), pick("Король и Шут", 2), pick("Daft Punk", 1)]);
const all = groups.flat();
if (all.length < 8) throw new Error("need seed tracks");

// the first group is heard the most; only the last two groups were heard today
const day = (back) => { const d = new Date(Date.now() - back * 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const listens = { seconds: 0, plays: 0, tracks: {}, artists: {}, days: { [day(0)]: { s: 0, p: 0, t: {}, a: {} }, [day(20)]: { s: 0, p: 0, t: {}, a: {} } } };
groups.forEach((g, gi) => g.forEach((t, ti) => {
  const plays = 12 - gi * 2 - ti, seconds = plays * 200;
  listens.seconds += seconds; listens.plays += plays;
  listens.tracks[t.id] = { track: t, plays, seconds };
  const a = listens.artists[t.artist] || (listens.artists[t.artist] = { seconds: 0, plays: 0 });
  a.seconds += seconds; a.plays += plays;
  const d = listens.days[gi >= 3 ? day(0) : day(20)];
  d.s += seconds; d.p += plays; d.t[t.id] = [plays, seconds];
  const da = d.a[t.artist] || (d.a[t.artist] = [0, 0]); da[0] += plays; da[1] += seconds;
}));
const seed = { favorites: all.slice(0, 2), playlists: [], onboardingSeenV2: true, listens };
const topArtist = Object.entries(listens.artists).sort((a, b) => b[1].seconds - a[1].seconds)[0][0];
const todayArtist = Object.entries(listens.days[day(0)].a).sort((a, b) => b[1][1] - a[1][1])[0][0];

const b = await launch({ dir });
const text = (id) => b.eval(`document.getElementById(${JSON.stringify(id)}).textContent.trim()`);
try {
  await b.goto(`${BASE}/app/`);
  await b.eval(`localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify(seed))}); true`);
  await b.goto(`${BASE}/app/`);
  await b.waitFor("document.body.dataset.screen !== 'splash'", 8000, "leave splash");

  await b.click("#home-avatar-btn");
  await b.click("#menu-stats");
  check("statistics opens from the profile", (await b.eval("document.body.dataset.screen")) === "stats");
  await b.sleep(1200);
  check("hero is the most listened artist", (await text("stats-hero-name")) === topArtist, await text("stats-hero-name"));
  check("minutes are counted", (await text("stats-num-minutes")).replace(/\D/g, "") === String(Math.round(listens.seconds / 60)), await text("stats-num-minutes"));
  check("tracks are counted", (await text("stats-num-tracks")) === String(all.length));
  check("artists shelf has faces", await b.eval("document.querySelectorAll('#stats-top-artists .shelf-card .cover img').length >= 3"));
  check("top tracks have covers", await b.eval("document.querySelectorAll('#stats-top-tracks .track-row .cover img').length === 3"));
  check("profile lists the account first, then statistics", await b.eval("(() => { const rows = [...document.querySelectorAll('#screen-profile .group-row')].map((r) => r.id); return rows[0] === 'menu-account' && rows[1] === 'menu-stats'; })()"));
  await b.sleep(6000); // artist photos arrive
  await b.shot("stats-1");
  for (const [i, y] of [[2, 620], [3, 1300], [4, 99999]]) {
    await b.eval(`document.getElementById('screen-stats').scrollTo(0, ${y}); true`);
    await b.sleep(1600);
    await b.shot("stats-" + i);
  }
  check("every part has come into view", await b.eval("[...document.querySelectorAll('#stats-body [data-reveal]')].filter((e) => !e.closest('[hidden]')).every((e) => e.classList.contains('is-seen'))"));
  await b.eval("document.getElementById('screen-stats').scrollTo(0, 0); true");

  await b.click('#stats-periods [data-period="7"]');
  await b.sleep(1000);
  check("week shows only this week's listening", (await text("stats-hero-name")) === todayArtist, await text("stats-hero-name"));
  await b.click('#stats-periods [data-period="30"]');
  await b.sleep(1000);
  check("month covers both days", (await text("stats-num-tracks")) === String(all.length), await text("stats-num-tracks"));

  await b.click("#stats-hero");
  await b.sleep(600);
  check("tap on the hero opens the artist", (await b.eval("document.body.dataset.screen")) === "artist");

  check("no page errors", b.errors.length === 0, b.errors.join(" | ").slice(0, 400));
} catch (err) {
  failed++;
  console.log("FAIL", err.message);
  await b.shot("stats-fail");
} finally {
  await b.close();
}
process.exit(failed ? 1 : 0);
