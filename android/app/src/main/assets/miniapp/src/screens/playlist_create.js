// ============================================================
// Create-playlist modal
// ============================================================
var createPlaylistInput = $("create-playlist-input");
var createPlaylistThenAddTrack = null; // track to add right after creating, if any

function openCreatePlaylistModal(trackToAdd) {
  createPlaylistThenAddTrack = trackToAdd || null;
  createPlaylistInput.value = "";
  openOverlay("create-playlist-modal");
  setTimeout(() => createPlaylistInput.focus(), 60);
}
function confirmCreatePlaylist() {
  const name = createPlaylistInput.value.trim();
  if (!name) { createPlaylistInput.focus(); return; }
  const playlist = Store.createPlaylist(name);
  if (createPlaylistThenAddTrack) Store.addTrackToPlaylist(playlist.id, createPlaylistThenAddTrack);
  closeOverlay("create-playlist-modal");
  renderLibrary();
  haptic("success");
  showToast(createPlaylistThenAddTrack ? `Создан «${name}», трек добавлен` : `Плейлист «${name}» создан`);
  if (!createPlaylistThenAddTrack) openPlaylist(playlist.id);
}
$("create-playlist-cancel").addEventListener("click", () => closeOverlay("create-playlist-modal"));
$("create-playlist-confirm").addEventListener("click", confirmCreatePlaylist);
createPlaylistInput.addEventListener("keydown", (e) => { if (e.key === "Enter") confirmCreatePlaylist(); });

// ============================================================
// «Перенести плейлист»: a link from another service -> the backend reads
// the track list -> each track is found in Нотка's own search, a few at
// a time, and the playlist fills up as they are found.
// ============================================================
var importInput = $("import-input");
var importRun = 0; // bumped to drop a running import altogether
var importStopped = false; // «Остановить»: finish with what has been found
var importedPlaylistId = null;

function importStep(name) {
  ["link", "work", "done"].forEach((step) => { $(`import-step-${step}`).hidden = step !== name; });
}
function importError(text) {
  $("import-error").textContent = text || "";
  $("import-error").hidden = !text;
}
function openImport() {
  importInput.value = "";
  importError("");
  $("import-confirm").classList.remove("is-busy");
  importStep("link");
  openOverlay("import-modal");
  setTimeout(() => importInput.focus(), 60);
}
function closeImport() {
  importRun++;
  closeOverlay("import-modal");
}

var normText = (text) => (text || "").toLowerCase().replace(/ё/g, "е").replace(/\(.*?\)|\[.*?\]/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
// The found track must be the same song: its title holds the wanted one
// (or the other way round) and one of the artists matches. Among those,
// the one closest in length wins — that separates a live or remix take.
function pickMatch(wanted, results) {
  const title = normText(wanted.title);
  const artists = (wanted.artist || "").split(/,|&| feat\.? | ft\.? /i).map(normText).filter(Boolean);
  let best = null;
  results.forEach((t, order) => {
    const gotTitle = normText(t.title);
    if (!gotTitle || !(gotTitle.includes(title) || title.includes(gotTitle))) return;
    const gotArtist = normText(t.artist);
    if (artists.length && !artists.some((a) => gotArtist.includes(a) || a.includes(gotArtist))) return;
    const off = wanted.duration && t.duration ? Math.abs(wanted.duration - t.duration) : 15;
    const score = off + order * 0.5 + (gotTitle === title ? 0 : 4);
    if (!best || score < best.score) best = { track: t, score };
  });
  return best ? best.track : null;
}
async function findInNotka(wanted) {
  const query = `${wanted.artist ? wanted.artist.split(",")[0] + " " : ""}${wanted.title}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${API_BASE_URL}/search?q=${encodeURIComponent(query)}&limit=8`);
      if (res.ok) return pickMatch(wanted, (await res.json()).results || []);
    } catch (e) { /* one more try below */ }
  }
  return null;
}

async function runImport() {
  const url = importInput.value.trim();
  if (!url) { importInput.focus(); return; }
  const run = ++importRun;
  importStopped = false;
  importError("");
  $("import-confirm").classList.add("is-busy");
  let data = null, problem = null;
  try {
    const res = await fetch(`${API_BASE_URL}/import?url=${encodeURIComponent(url)}`);
    if (res.ok) data = await res.json();
    else {
      let code = null;
      try { code = (await res.json()).error.code; } catch (e) { /* no readable reason */ }
      problem = code === "INVALID_SOURCE_URL"
        ? "Это не похоже на ссылку на плейлист. Подойдут Spotify, Яндекс Музыка, Apple Music, Deezer, SoundCloud и YouTube Music."
        : "Не получилось прочитать плейлист. Проверь, что он открыт для всех по ссылке.";
    }
  } catch (e) {
    problem = "Нет связи с Ноткой. Попробуй ещё раз.";
  }
  if (run !== importRun) return;
  $("import-confirm").classList.remove("is-busy");
  if (!data) { importError(problem); haptic("error"); return; }

  const wanted = data.tracks;
  const found = new Array(wanted.length).fill(null);
  const tried = new Array(wanted.length).fill(false);
  let done = 0;
  $("import-name").textContent = data.name || "Плейлист";
  $("import-total").textContent = String(wanted.length);
  const progress = (now) => {
    $("import-done").textContent = String(done);
    $("import-bar-fill").style.transform = `scaleX(${done / wanted.length})`;
    if (now) $("import-now").textContent = now;
  };
  progress("Ищу треки в Нотке…");
  importStep("work");

  // a few searches at a time: faster than one by one, gentle on the sources
  let next = 0;
  const worker = async () => {
    while (run === importRun && !importStopped && next < wanted.length) {
      const i = next++;
      const item = wanted[i];
      found[i] = item.track || await findInNotka(item);
      if (run !== importRun) return;
      tried[i] = true;
      done++;
      progress(`${item.artist ? item.artist + " — " : ""}${item.title}`);
    }
  };
  // a long playlist needs many searches: more of them at a time (a thousand at three at a time takes minutes)
  const lanes = wanted.length > 150 ? 6 : 3;
  await Promise.all(Array.from({ length: lanes }, () => worker()));
  if (run !== importRun) return; // the window was closed: nothing is created

  // stopped half-way: what was found so far is still kept
  const tracks = found.filter(Boolean);
  const missed = wanted.filter((item, i) => tried[i] && !found[i]);
  if (!tracks.length) {
    importStep("link");
    importError("Ни одного трека из этого плейлиста найти не удалось.");
    openOverlay("import-modal");
    return;
  }
  const playlist = Store.createPlaylist(data.name || "Перенесённый плейлист");
  const seen = new Set();
  tracks.forEach((t) => { if (!seen.has(t.id)) { seen.add(t.id); Store.addTrackToPlaylist(playlist.id, t); } });
  importedPlaylistId = playlist.id;
  track("import", { svc: String(data.service || "").slice(0, 16), total: wanted.length, found: tracks.length });
  renderLibrary();
  haptic("success");
  $("import-result-title").textContent = `«${playlist.name}» в Нотке`;
  $("import-result-note").textContent = missed.length || done < wanted.length
    ? `Перенесено ${pluralTracks(seen.size)} из ${wanted.length}. Не нашлись:`.replace(" Не нашлись:", done < wanted.length ? " Перенос остановлен." + (missed.length ? " Не нашлись:" : "") : " Не нашлись:")
    : `Перенесены все ${pluralTracks(seen.size)}.`;
  $("import-missed").innerHTML = missed.map((item) => `<li>${escapeHtml(item.artist ? item.artist + " — " : "")}${escapeHtml(item.title)}</li>`).join("");
  importStep("done");
  openOverlay("import-modal");
}

$("import-open-btn").addEventListener("click", openImport);
$("import-cancel").addEventListener("click", closeImport);
$("import-confirm").addEventListener("click", runImport);
importInput.addEventListener("keydown", (e) => { if (e.key === "Enter") runImport(); });
importInput.addEventListener("input", () => importError(""));
// «Остановить» keeps what has been found: the loop ends and the playlist is made
$("import-stop").addEventListener("click", () => { importStopped = true; $("import-now").textContent = "Останавливаю…"; });
$("import-open-playlist").addEventListener("click", () => {
  closeOverlay("import-modal");
  if (importedPlaylistId) openPlaylist(importedPlaylistId);
});

