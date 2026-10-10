// Очень длинное название трека не наезжает на кнопки: мини-плеер и большой плеер, телефон и компьютер, обычный вид и текст.
//   node tests/long_title.mjs   (нужен tests/serve_local.py и интернет)
import { launch } from "./cdp.mjs";
const BASE = "http://127.0.0.1:8099";
const LONG = "Очень длинное название трека которое совершенно не помещается в одну строку и должно аккуратно обрезаться многоточием (Remastered 2024 Deluxe Edition) feat. Кто-то Ещё";
const LONG_ARTIST = "Исполнитель с очень длинным именем, Второй Исполнитель, Третий Исполнитель, Четвёртый Исполнитель";
const found = ((await (await fetch(`${BASE}/search?q=${encodeURIComponent("Кино Группа крови")}`)).json()).results || []).filter((t) => t.artwork && t.source === "youtube_music");
let bad = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "PASS " : "FAIL ") + name + " " + extra); if (!ok) bad++; };
const rects = `(titleSel, others) => {
  const t = document.querySelector(titleSel).getBoundingClientRect();
  const hits = [];
  for (const s of others) {
    const el = document.querySelector(s);
    if (!el || el.offsetParent === null) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    if (t.left < r.right && t.right > r.left && t.top < r.bottom && t.bottom > r.top) hits.push(s);
  }
  return JSON.stringify(hits);
}`;
for (const [label, W, H, mobile, port] of [["phone", 390, 844, true, 9391], ["computer", 1440, 900, false, 9392]]) {
  const b = await launch({ dir: "C:/Users/leksik/Documents/Notka/tests/shots", port, width: W, height: H });
  await b.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile });
  await b.goto(`${BASE}/health`);
  await b.eval(`localStorage.clear(); localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify({ favorites: found.slice(0, 4), recent: [], playlists: [], onboardingSeenV2: true, settings: {} }))}); true`);
  await b.goto(`${BASE}/app/`);
  await b.waitFor("!!document.body && document.body.dataset.screen !== 'splash'", 8000, "x");
  await b.sleep(1000);
  await b.click("#mymix-play-btn");
  await b.waitFor("(() => { const a = document.getElementById('audio'); return !a.paused && a.currentTime > 0.3; })()", 60000, "playing");
  await b.eval(`document.getElementById('mp-title').textContent = ${JSON.stringify(LONG)}; document.getElementById('mp-artist').textContent = ${JSON.stringify(LONG_ARTIST)}; document.getElementById('player-title').textContent = ${JSON.stringify(LONG)}; document.getElementById('player-artist').textContent = ${JSON.stringify(LONG_ARTIST)}; true`);
  await b.sleep(300);
  const mini = JSON.parse(await b.eval(`(${rects})("#mp-title", ["#mp-play-btn", "#mp-prev-btn", "#mp-next-btn", "#mp-fav-btn", "#mp-queue-btn", "#mp-vol", "#mp-time-cur"])`));
  check(`${label}: the mini player title stays clear of the buttons`, mini.length === 0, JSON.stringify(mini));
  const miniArtist = JSON.parse(await b.eval(`(${rects})("#mp-artist", ["#mp-play-btn", "#mp-prev-btn", "#mp-next-btn", "#mp-fav-btn", "#mp-queue-btn", "#mp-vol", "#mp-time-cur"])`));
  check(`${label}: the mini player artist stays clear of the buttons`, miniArtist.length === 0, JSON.stringify(miniArtist));
  await b.eval("document.getElementById('mini-open-btn').click(); true");
  await b.sleep(900);
  const full = JSON.parse(await b.eval(`(${rects})("#player-title", ["#player-play-btn", "#player-prev-btn", "#player-next-btn", "#player-fav-btn", "#player-progress-track"])`));
  check(`${label}: the player title stays clear of the controls`, full.length === 0, JSON.stringify(full));
  const fullArtist = JSON.parse(await b.eval(`(${rects})("#player-artist", ["#player-play-btn", "#player-fav-btn", "#player-progress-track"])`));
  check(`${label}: the player artist stays clear of the controls`, fullArtist.length === 0, JSON.stringify(fullArtist));
  await b.eval("document.getElementById('player-lyrics-btn').click(); true");
  await b.sleep(1200);
  const lyr = JSON.parse(await b.eval(`(${rects})("#player-title", ["#player-play-btn", "#player-prev-btn", "#player-next-btn", "#player-fav-btn", "#player-progress-track", "#player-lyrics-btn", "#player-queue-btn"])`));
  check(`${label}: with the lyrics open the title stays clear too`, lyr.length === 0, JSON.stringify(lyr));
  await b.close?.();
}
console.log(bad ? "FAILED" : "ALL PASS");
process.exit(bad ? 1 : 0);
