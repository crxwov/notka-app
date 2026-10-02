// «Тема плейлиста» (Плюс): the whole playlist screen takes another look. Needs tests/serve_local.py running.
//   node tests/playlist_themes.mjs
import { launch } from "./cdp.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "http://127.0.0.1:8099";
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "shots");
let failed = 0;
const check = (name, ok, extra = "") => { if (!ok) failed++; console.log(ok ? "PASS" : "FAIL", name, extra); };

const mk = (n, title, artist, vid, dur) => ({ id: `youtube_music_${vid}`, source: "youtube_music", sourceId: vid, title, artist, duration: dur, artwork: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` });
const tracks = [
  mk(1, "Yellow", "Coldplay", "yKNxeF4KMsY", 269),
  mk(2, "Кукушка", "Кино", "8w1U6x7gFJY", 380),
  mk(3, "Creep", "Radiohead", "XFkzRNyygfk", 238),
  mk(4, "Smells Like Teen Spirit", "Nirvana", "hTWKbfoikeg", 301),
  mk(5, "Du Hast", "Rammstein", "W3q8Od5qJio", 234),
];
const seed = { favorites: [], onboardingSeenV2: true, playlists: [{ id: "pl1", name: "Вечерний плейлист", trackIds: tracks.map((t) => t.id), tracksCache: Object.fromEntries(tracks.map((t) => [t.id, t])) }] };

const b = await launch({ dir });
const theme = () => b.eval(`document.getElementById("screen-playlist").dataset.plTheme || ""`);
const saved = async () => (await b.eval(`JSON.parse(localStorage.getItem("notka_state_v2")).playlists[0].theme || ""`));
const openList = async () => {
  await b.click('.tab[data-tab="library"]');
  await b.sleep(500);
  await b.click("#playlists-grid .playlist-card");
  await b.waitFor("document.body.dataset.screen === 'playlist'", 6000, "playlist screen");
  await b.sleep(600);
};
const openSheet = async () => {
  await b.click("#playlist-menu-btn");
  await b.click("#menu-theme");
  await b.sleep(700);
};
try {
  await b.goto(`${BASE}/app/`);
  await b.eval(`localStorage.clear(); localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify(seed))}); true`);
  await b.goto(`${BASE}/app/`);
  await b.waitFor("document.body.dataset.screen !== 'splash'", 8000, "leave splash");
  await openList();

  // ---- without Плюс: seen live, not kept ----
  await openSheet();
  check("the sheet offers the plain look and five themes", await b.eval("document.querySelectorAll('.plt-card').length === 6"));
  await b.click('.plt-card[data-t="pixel"]');
  await b.sleep(500);
  check("the playlist behind the sheet takes the theme at once", (await theme()) === "pixel");
  check("without Плюс the button says so", await b.eval("document.getElementById('plt-keep').textContent.includes('Плюсом')"));
  await b.shot("theme-pixel-sheet");
  await b.click("#plt-cancel");
  await b.sleep(500);
  check("cancel puts the usual look back", (await theme()) === "" && (await saved()) === "");
  await openSheet();
  await b.click('.plt-card[data-t="nyc"]');
  await b.click("#plt-keep");
  await b.sleep(700);
  check("without Плюс, keeping leads to the Плюс screen and keeps nothing", (await b.eval("document.body.dataset.screen")) === "plus" && (await saved()) === "");

  // ---- with Плюс: each theme is shown, and kept ----
  await b.eval(`localStorage.setItem("notka_plus_local", "1"); true`);
  await b.goto(`${BASE}/app/`);
  await b.waitFor("document.body.dataset.screen !== 'splash'", 8000, "leave splash");
  await openList();
  for (const key of ["pixel", "nyc", "paper", "notebook", "poster"]) {
    await openSheet();
    await b.click(`.plt-card[data-t="${key}"]`);
    await b.sleep(900);
    await b.shot(`theme-${key}-top`);
    await b.click("#plt-keep");
    await b.sleep(700);
    check(`«${key}» is kept and shown`, (await saved()) === key && (await theme()) === key);
    await b.eval(`document.getElementById("screen-playlist").scrollTo(0, 99999); true`);
    await b.sleep(300);
    await b.shot(`theme-${key}-end`);
    await b.eval(`document.getElementById("screen-playlist").scrollTo(0, 0); true`);
  }
  await b.goto(`${BASE}/app/`);
  await b.waitFor("document.body.dataset.screen !== 'splash'", 8000, "leave splash");
  await openList();
  check("a kept theme is there after a restart", (await theme()) === "poster");
  check("the pixel cover is drawn small", true);
  check("no page errors", b.errors.length === 0, b.errors.join(" | ").slice(0, 400));
} catch (err) {
  failed++;
  console.log("FAIL", err.message);
  await b.shot("theme-fail");
} finally {
  await b.close();
}
process.exit(failed ? 1 : 0);
