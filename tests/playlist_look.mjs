// «Стиль обложки» плейлиста (Плюс). Needs tests/serve_local.py running.
//   node tests/playlist_look.mjs
import { launch } from "./cdp.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "http://127.0.0.1:8099";
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "shots");
let failed = 0;
const check = (name, ok, extra = "") => { if (!ok) failed++; console.log(ok ? "PASS" : "FAIL", name, extra); };

const track = { id: "youtube_music_aaa", source: "youtube_music", sourceId: "aaa", title: "Песня", artist: "Артист", duration: 200, artwork: null };
const seed = { favorites: [], onboardingSeenV2: true, playlists: [{ id: "pl1", name: "Мой плейлист", trackIds: [track.id], tracksCache: { [track.id]: track } }] };

const b = await launch({ dir });
const openList = async () => {
  await b.click('.tab[data-tab="library"]');
  await b.sleep(500);
  await b.click("#playlists-grid .playlist-card");
  await b.waitFor("document.body.dataset.screen === 'playlist'", 6000, "playlist screen");
};
const state = () => b.eval(`JSON.parse(localStorage.getItem("notka_state_v2")).playlists[0]`);
const coverIsStyled = () => b.eval(`(() => { const img = document.querySelector("#playlist-cover img"); return !!img && img.src.startsWith("data:image/svg+xml"); })()`);
try {
  await b.goto(`${BASE}/app/`);
  await b.eval(`localStorage.clear(); localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify(seed))}); true`);
  await b.goto(`${BASE}/app/`);
  await b.waitFor("document.body.dataset.screen !== 'splash'", 8000, "leave splash");
  await openList();

  // ---- without Плюс: it can be tried, not kept ----
  await b.click("#playlist-menu-btn");
  await b.click("#menu-coverlook");
  await b.sleep(500);
  check("the sheet offers six drawings and ten colors", await b.eval("document.querySelectorAll('.cover-look-opt').length === 6 && document.querySelectorAll('.cover-look-hue').length === 10"));
  check("the preview is drawn", await b.eval("(() => { const i = document.querySelector('#cover-look-preview img'); return !!i && i.src.startsWith('data:image/svg+xml'); })()"));
  await b.click('.cover-look-opt[data-pattern="vinyl"]');
  await b.click('.cover-look-hue[data-hue="190"]');
  check("choosing marks the drawing and the color", await b.eval("document.querySelector('.cover-look-opt.is-on').dataset.pattern === 'vinyl' && document.querySelector('.cover-look-hue.is-on').dataset.hue === '190'"));
  check("without Плюс the button says so", await b.eval("document.getElementById('cover-look-apply').textContent.includes('Плюсом')"));
  await b.shot("cover-look-sheet");
  await b.click("#cover-look-apply");
  await b.sleep(500);
  check("without Плюс it leads to the Плюс screen and keeps nothing", (await b.eval("document.body.dataset.screen")) === "plus" && !(await state()).look);

  // ---- with Плюс: it is kept, shown, and goes away when Плюс does ----
  await b.eval(`localStorage.setItem("notka_plus_local", "1"); true`);
  await b.click('.tab[data-tab="home"]');
  await b.sleep(400);
  await openList();
  await b.click("#playlist-menu-btn");
  await b.click("#menu-coverlook");
  await b.sleep(400);
  await b.click('.cover-look-opt[data-pattern="rings"]');
  check("with Плюс the button just applies", await b.eval("document.getElementById('cover-look-apply').textContent === 'Применить'"));
  await b.click("#cover-look-apply");
  await b.sleep(500);
  check("the look is stored", /^rings:\d+$/.test((await state()).look || ""), JSON.stringify((await state()).look));
  check("the playlist shows the drawn cover", await coverIsStyled());
  await b.shot("cover-look-applied");
  await b.eval(`localStorage.setItem("notka_plus_local", "0"); true`);
  await b.goto(`${BASE}/app/`);
  await b.waitFor("document.body.dataset.screen !== 'splash'", 8000, "leave splash");
  check("without Плюс the drawn cover is not worn", !(await b.eval(`(() => { return [...document.querySelectorAll('img')].some((i) => i.src.startsWith('data:image/svg+xml')); })()`)));
  check("no page errors", b.errors.length === 0, b.errors.join(" | ").slice(0, 400));
} catch (err) {
  failed++;
  console.log("FAIL", err.message);
  await b.shot("cover-look-fail");
} finally {
  await b.close();
}
process.exit(failed ? 1 : 0);
