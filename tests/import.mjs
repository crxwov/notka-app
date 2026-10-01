// «Перенести плейлист». Needs tests/serve_local.py running and the internet.
//   node tests/import.mjs
import { launch } from "./cdp.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "http://127.0.0.1:8099";
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "shots");
let failed = 0;
const check = (name, ok, extra = "") => { if (!ok) failed++; console.log(ok ? "PASS" : "FAIL", name, extra); };

const b = await launch({ dir });
const text = (id) => b.eval(`document.getElementById(${JSON.stringify(id)}).textContent.trim()`);
const type = (value) => b.eval(`(() => { const i = document.getElementById("import-input"); i.value = ${JSON.stringify(value)}; i.dispatchEvent(new Event("input")); return true; })()`);
const visible = (id) => b.eval(`!document.getElementById(${JSON.stringify(id)}).hidden`);
try {
  await b.goto(`${BASE}/app/`);
  await b.eval(`localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify({ favorites: [], playlists: [], onboardingSeenV2: true }))}); true`);
  await b.goto(`${BASE}/app/`);
  await b.waitFor("document.body.dataset.screen !== 'splash'", 8000, "leave splash");
  await b.click('.tab[data-tab="library"]');
  await b.click("#import-open-btn");
  await b.shot("import-1-link");

  await type("https://vk.com/music/playlist/1_2");
  await b.click("#import-confirm");
  await b.waitFor("!document.getElementById('import-error').hidden", 15000, "error for a wrong link");
  check("a link from an unknown service is explained", (await text("import-error")).includes("не похоже на ссылку"), await text("import-error"));

  // an album from Yandex Music: 11 tracks to find
  await type("https://music.yandex.ru/album/3389008");
  check("typing clears the error", !(await visible("import-error")));
  await b.click("#import-confirm");
  await b.waitFor("!document.getElementById('import-step-work').hidden", 30000, "progress step");
  check("the playlist's name and size are shown", (await text("import-name")) === "Amnesiac" && (await text("import-total")) === "11", `${await text("import-name")} / ${await text("import-total")}`);
  await b.waitFor("+document.getElementById('import-done').textContent >= 3", 60000, "some progress");
  await b.shot("import-2-work");
  await b.waitFor("!document.getElementById('import-step-done').hidden", 180000, "import finished");
  await b.shot("import-3-done");
  const note = await text("import-result-note");
  const made = await b.eval(`(() => { const s = JSON.parse(localStorage.getItem("notka_state_v2")); const p = s.playlists[0]; return p ? { name: p.name, n: p.trackIds.length, artists: [...new Set(p.trackIds.map((id) => p.tracksCache[id].artist))] } : null; })()`);
  check("a playlist with the found tracks is created", !!made && made.name === "Amnesiac" && made.n >= 9, JSON.stringify(made) + " | " + note);
  check("the tracks are by the right artist", !!made && made.artists.every((a) => /radiohead/i.test(a)), made && JSON.stringify(made.artists));
  await b.click("#import-open-playlist");
  await b.sleep(700);
  check("«Открыть плейлист» opens it", (await b.eval("document.body.dataset.screen")) === "playlist");
  await b.shot("import-4-playlist");

  // a YouTube playlist needs no searching: its tracks are ready as they are
  await b.click('.tab[data-tab="library"]');
  await b.click("#import-open-btn");
  await type("https://music.youtube.com/playlist?list=PL7Rr_OMj-DOYXP7j3tpAyUKfM5Lv5lf8q");
  await b.click("#import-confirm");
  await b.waitFor("!document.getElementById('import-step-done').hidden", 90000, "youtube import finished");
  const yt = await b.eval(`JSON.parse(localStorage.getItem("notka_state_v2")).playlists.map((p) => p.trackIds.length)`);
  check("a YouTube playlist comes over whole", yt.length === 2 && Math.max(...yt) > 100, JSON.stringify(yt) + " | " + (await text("import-result-note")));
  check("no page errors", b.errors.length === 0, b.errors.join(" | ").slice(0, 400));
} catch (err) {
  failed++;
  console.log("FAIL", err.message);
  await b.shot("import-fail");
} finally {
  await b.close();
}
process.exit(failed ? 1 : 0);
