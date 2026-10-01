import { launch } from "./cdp.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "http://127.0.0.1:8099";
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "shots");
const results = [];
const check = (name, ok, extra = "") => { results.push([ok ? "PASS" : "FAIL", name, extra]); console.log(ok ? "PASS" : "FAIL", name, extra); };

const search = async (q) => (await (await fetch(`${BASE}/search?q=${encodeURIComponent(q)}`)).json()).results || [];
const kino = (await search("Группа крови Кино")).filter((t) => t.artist === "Кино").slice(0, 2);
if (kino.length < 2) throw new Error("need two seed tracks");
const missing = { id: "itunes:1888355855", source: "itunes", sourceId: "1888355855", title: "Purpose General", artist: "Yeat", duration: 205 };

const seed = {
  favorites: kino,
  playlists: [{ id: "pl_test", name: "Тестовый", trackIds: [kino[0].id], tracksCache: { [kino[0].id]: kino[0] } }],
  onboardingSeenV2: true,
};

const b = await launch({ dir });
const audio = "document.getElementById('audio')";
const text = (id) => b.eval(`document.getElementById(${JSON.stringify(id)}).textContent.trim()`);
const screen = () => b.eval("document.body.dataset.screen");
const toast = () => b.eval("document.getElementById('toast').classList.contains('show') ? document.getElementById('toast').textContent : ''");
const playing = `(!${audio}.paused && ${audio}.currentTime > 0.4)`;

async function boot(extra = "") {
  await b.goto(`${BASE}/app/${extra}`);
  await b.eval(`localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify(seed))}); true`);
  await b.goto(`${BASE}/app/${extra}`);
  await b.waitFor("document.body.dataset.screen !== 'splash'", 8000, "leave splash");
}

try {
  // ---------- T1: loads ----------
  await boot();
  check("T1 app opens on Home", (await screen()) === "home");
  await b.shot("01-home");

  // ---------- T2: tap plays, through /prepare ----------
  await b.click("#home-favorites-list .track-row:nth-child(1) .row-main");
  await b.waitFor(playing, 40000, "first track playing");
  check("T2 track plays", true, await text("mp-title"));
  check("T2 uses /prepare, not /resolve", b.requests.some((u) => u.includes("/prepare?")) && !b.requests.some((u) => u.includes("/resolve?")));
  await b.sleep(1500);
  check("T2 next track prepared ahead", b.requests.filter((u) => u.includes("/prepare?")).length >= 2);

  // ---------- T4: end of a track moves on to the next ----------
  await b.eval(`${audio}.currentTime = ${audio}.duration - 1.5; true`);
  await b.waitFor(`${audio}.src.includes(${JSON.stringify(kino[1].sourceId)}) && ${playing}`, 40000, "auto-next");
  check("T4 next track starts by itself", true, await text("mp-title"));

  // ---------- T3: after the last track, ▶ starts it again ----------
  await b.eval(`${audio}.currentTime = ${audio}.duration - 1.5; true`);
  await b.waitFor(`${audio}.paused && ${audio}.src.includes(${JSON.stringify(kino[1].sourceId)})`, 15000, "queue finished");
  await b.sleep(400);
  const rewound = await b.eval(`${audio}.currentTime`);
  check("T3 queue end rewinds the track", rewound < 1, `currentTime=${rewound.toFixed(2)}`);
  await b.click("#mp-play-btn");
  await b.sleep(3000);
  const after = await b.eval(`({ paused: ${audio}.paused, t: ${audio}.currentTime })`);
  check("T3 ▶ after the last track plays again", !after.paused && after.t > 1.5, JSON.stringify(after));

  // ---------- T8: a broken stream reconnects at the same second ----------
  await b.eval(`${audio}.currentTime = 40; true`);
  await b.sleep(1200);
  await b.eval(`${audio}.dispatchEvent(new Event("error")); true`);
  await b.sleep(5000);
  const rec = await b.eval(`({ paused: ${audio}.paused, t: ${audio}.currentTime })`);
  check("T8 stream error reconnects and continues", !rec.paused && rec.t > 39, JSON.stringify(rec));

  // ---------- T5: Back returns to the right artist ----------
  await b.click('.tab[data-tab="search"]');
  await b.eval(`(() => { const i = document.getElementById("search-input"); i.value = "Travis Scott"; i.dispatchEvent(new Event("input")); return true; })()`);
  await b.waitFor("!document.getElementById('search-state-results').hidden && document.querySelectorAll('#search-state-results .track-row').length > 3", 40000, "search results");
  await b.shot("02-search");
  await b.click('#search-tabs [data-tab="artists"]');
  const firstArtist = await b.eval("document.querySelector('#search-state-results .row-title').textContent");
  await b.click("#search-state-results .track-row .row-main");
  await b.waitFor("document.body.dataset.screen === 'artist' && document.querySelectorAll('#artist-tracks .track-row').length > 0", 40000, "artist A loaded");
  const artistA = await text("artist-name");
  check("T5 artist A opens with tracks", true, `${artistA} (row: ${firstArtist})`);
  await b.shot("03-artist");
  // player -> "…" -> go to the playing track's artist (Кино) = artist B
  await b.click("#mini-open-btn");
  await b.click("#player-more-btn");
  await b.click("#menu-track-artist-link");
  await b.waitFor("document.body.dataset.screen === 'artist' && document.getElementById('artist-name').textContent === 'Кино' && document.querySelectorAll('#artist-tracks .track-row').length > 0", 40000, "artist B loaded");
  check("T5 artist B opens", true, await text("artist-name"));
  await b.click("#artist-back-btn");
  check("T5 back -> player", (await screen()) === "player");
  await b.click("#player-back-btn");
  await b.waitFor(`document.body.dataset.screen === 'artist' && document.getElementById('artist-name').textContent === ${JSON.stringify(artistA)} && document.querySelectorAll('#artist-tracks .track-row').length > 0`, 40000, "back to artist A").then(
    () => check("T5 back again shows artist A, not B", true, artistA),
    async () => check("T5 back again shows artist A, not B", false, await text("artist-name")),
  );

  // ---------- T9: album from the shelf -> its artist link is a full page ----------
  const shelf = await b.eval("document.querySelectorAll('#artist-albums .shelf-card').length");
  if (shelf) {
    await b.click("#artist-albums .shelf-card");
    await b.waitFor("document.body.dataset.screen === 'album' && document.querySelectorAll('#album-tracks .track-row').length > 0", 40000, "album loaded");
    const albumTitle = await text("album-title");
    await b.shot("04-album");
    await b.click("#album-artist-link");
    await b.waitFor("document.body.dataset.screen === 'artist' && document.getElementById('artist-listeners').textContent !== 'Загрузка…'", 40000, "album artist loaded");
    const n = await b.eval("document.querySelectorAll('#artist-tracks .track-row').length");
    check("T9 artist opened from an album has tracks", n > 0, `${await text("artist-name")}: ${n} rows (album «${albumTitle}»)`);
    await b.click("#artist-back-btn");
    await b.waitFor(`document.body.dataset.screen === 'album' && document.getElementById('album-title').textContent === ${JSON.stringify(albumTitle)}`, 20000, "back to album").then(
      () => check("T9 back returns to that album", true), () => check("T9 back returns to that album", false));
  } else check("T9 artist has an album shelf", false);

  // ---------- T6: delete a playlist, take it back ----------
  await boot();
  await b.click('.tab[data-tab="library"]');
  await b.click("#playlists-grid .playlist-card");
  await b.click("#playlist-menu-btn");
  await b.click("#menu-delete");
  await b.sleep(500);
  const gone = await b.eval("document.querySelectorAll('#playlists-grid .playlist-card').length");
  const undo = await b.eval("!!document.querySelector('#toast .toast-action')");
  check("T6 playlist deleted, toast offers «Вернуть»", gone === 0 && undo && (await screen()) === "library", await toast());
  await b.shot("05-undo-toast");
  await b.click("#toast .toast-action");
  const back = await b.eval("document.querySelectorAll('#playlists-grid .playlist-card').length");
  const stored = await b.eval("JSON.parse(localStorage.getItem('notka_state_v2')).playlists.length");
  check("T6 «Вернуть» restores it (screen + storage)", back === 1 && stored === 1, `cards=${back} stored=${stored}`);

  // ---------- T7: profile / account / sound / about ----------
  await b.click('.tab[data-tab="home"]');
  await b.click("#home-avatar-btn");
  const rows = await b.eval("[...document.querySelectorAll('#screen-profile .group-label')].map((e) => e.textContent.trim())");
  check("T7 profile has no «Выйти» / «Уведомления»", !rows.includes("Выйти") && !rows.includes("Уведомления"), rows.join(" · "));
  await b.shot("06-profile");
  await b.click("#menu-account");
  check("T7 account has no Premium card", !(await b.eval("document.getElementById('screen-account').textContent.includes('Premium')")));
  const switches = await b.eval("[...document.querySelectorAll('#screen-account .switch')].map((s) => s.getAttribute('aria-checked'))");
  check("T7 «скоро» switches are shown off", switches.every((s) => s === "false"), switches.join(","));
  await b.shot("07-account");
  await b.click("#account-stats-row");
  check("T7 stats screen opens", (await screen()) === "stats", (await text("stats-lede")).slice(0, 80));
  await b.click("#stats-back-btn");
  await b.click("#account-back-btn");
  await b.click("#menu-sound");
  check("T7 sound screen has no kbps claims", !(await b.eval("document.getElementById('screen-sound').textContent.includes('kbps')")));
  await b.shot("08-sound");
  await b.click("#sound-back-btn");
  await b.click("#menu-about");
  check("T7 about text", (await b.eval("document.querySelector('.about-text').textContent")).startsWith("Нотка — музыка прямо в Telegram"));
  await b.shot("09-about");

  // ---------- T10: a track that isn't available says so ----------
  seed.favorites = [missing];
  await boot();
  await b.click("#home-favorites-list .track-row .row-main");
  await b.waitFor("document.getElementById('toast').classList.contains('show') && !document.body.classList.contains('is-loading')", 40000, "failure toast");
  check("T10 unavailable track gives the honest message", (await toast()) === "Трек не найден в официальном каталоге", await toast());

  // ---------- T11: a shared link skips the intro and plays ----------
  seed.favorites = kino;
  delete seed.onboardingSeenV2;
  const t0 = Date.now();
  await b.goto(`${BASE}/app/?t=ym_${kino[0].sourceId}`);
  await b.eval(`localStorage.removeItem("notka_state_v2"); true`);
  await b.goto(`${BASE}/app/?t=ym_${kino[0].sourceId}`);
  await b.waitFor(`document.body.dataset.screen === 'player' && ${playing}`, 40000, "deep link playing");
  check("T11 shared link opens the player and plays", true, `${await text("player-title")} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await b.shot("10-deeplink-player");
} catch (e) {
  check("ABORTED", false, e.message);
  try { await b.shot("zz-abort"); } catch (e2) { /* ignore */ }
} finally {
  const errs = b.errors.filter((e) => !/telegram-web-app|Telegram\.WebView|favicon/i.test(e));
  console.log("\nconsole errors:", errs.length);
  errs.slice(0, 15).forEach((e) => console.log("  ", e));
  console.log(`\n${results.filter((r) => r[0] === "PASS").length} passed, ${results.filter((r) => r[0] === "FAIL").length} failed`);
  await b.close();
  process.exit(0);
}
