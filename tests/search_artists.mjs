// Artists in search: real photos, no made-up track counts.
// Needs tests/serve_local.py running.   node tests/search_artists.mjs
import { launch } from "./cdp.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "http://127.0.0.1:8099";
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "shots");
let failed = 0;
const check = (name, ok, extra = "") => { if (!ok) failed++; console.log(ok ? "PASS" : "FAIL", name, extra); };

const api = await (await fetch(`${BASE}/artists?q=${encodeURIComponent("Miyagi")}`)).json();
check("artist search answers with photos", api.results.length > 0 && api.results.every((a) => a.id && a.name) && api.results.some((a) => a.photo), JSON.stringify(api.results.slice(0, 2)).slice(0, 200));

const b = await launch({ dir });
try {
  await b.goto(`${BASE}/app/`);
  await b.eval(`localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify({ favorites: [], playlists: [], onboardingSeenV2: true }))}); true`);
  await b.goto(`${BASE}/app/`);
  await b.waitFor("document.body.dataset.screen !== 'splash'", 8000, "leave splash");
  await b.click('.tab[data-tab="search"]');
  await b.eval(`(() => { const i = document.getElementById("search-input"); i.value = "Miyagi"; i.dispatchEvent(new Event("input")); return true; })()`);
  await b.waitFor("!document.getElementById('search-state-results').hidden && document.querySelectorAll('#search-state-results .track-row').length > 3", 40000, "search results");
  await b.click('#search-tabs [data-tab="artists"]');
  await b.sleep(1500);
  const rows = await b.eval(`[...document.querySelectorAll('#search-state-results .track-row')].map((r) => ({ title: r.querySelector('.row-title').textContent, sub: r.querySelector('.row-sub').textContent, img: !!r.querySelector('.cover img') }))`);
  check("artists are listed", rows.length > 0, String(rows.length));
  check("the first artist has a photo", rows[0] && rows[0].img, JSON.stringify(rows[0]));
  check("most artists have a picture, not a sphere", rows.filter((r) => r.img).length >= Math.ceil(rows.length * 0.8), `${rows.filter((r) => r.img).length}/${rows.length}`);
  check("no track counts are shown", rows.every((r) => !/\d/.test(r.sub)), JSON.stringify(rows.map((r) => r.sub).slice(0, 3)));
  await b.shot("search-artists");
  await b.click("#search-state-results .track-row .row-main");
  await b.sleep(800);
  check("tap opens the artist page", (await b.eval("document.body.dataset.screen")) === "artist");
  check("no page errors", b.errors.length === 0, b.errors.join(" | ").slice(0, 400));
} catch (err) {
  failed++;
  console.log("FAIL", err.message);
  await b.shot("search-artists-fail");
} finally {
  await b.close();
}
process.exit(failed ? 1 : 0);
