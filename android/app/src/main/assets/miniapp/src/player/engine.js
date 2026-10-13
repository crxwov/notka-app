// ============================================================
// PLAYBACK
// ============================================================
var audio = $("audio");
var currentTrackId = null;
var currentTrack = null;
var currentQueue = [];
var originalQueue = [];
var currentQueueIndex = -1;
var mymixActive = false;
var currentMixKey = null; // which mix the queue is (see saveMixResume), null outside a mix
var currentContextLabel = "Нотка";
var isLoading = false;
var isStarting = false; // between a tap and the first sound of that track
var playToken = 0;
var resolveAbort = null;
var failStreak = 0;
var shuffleOn = false;
var queuedIds = new Set(); // tracks put in the queue by hand (see queueTrack)
var currentSource = null; // "fav" | "pl:<id>" | "album:<title>" | "artist:<name>" | "mix"

// A list's «Слушать» plays it in order; pressed again it pauses/resumes.
function playOrToggle(source, tracks, context) {
  if (currentSource === source && currentTrack) {
    if (shuffleOn) { shuffleOn = false; startFrom(source, tracks, context, false); return; }
    togglePlayPause();
    return;
  }
  startFrom(source, tracks, context, false);
}
// «Вперемешку»: shuffled from a random track; pressed again it goes back
// to the list's own order.
function shuffleOrToggle(source, tracks, context) {
  if (currentSource === source && currentTrack && shuffleOn) {
    shuffleOn = false;
    startFrom(source, tracks, context, false);
    showToast("По порядку");
    return;
  }
  startFrom(source, tracks, context, true);
}
function startFrom(source, tracks, context, shuffle) {
  if (!tracks.length) return;
  shuffleOn = shuffle;
  const first = shuffle ? tracks[Math.floor(Math.random() * tracks.length)] : tracks[0];
  playTrack(first, tracks, { context, source });
  syncModeButtons();
}
function updateSourceButtons() {
  [
    ["favorites-play-btn", "favorites-shuffle-btn", () => "fav"],
    ["playlist-play-btn", "playlist-shuffle-btn", () => `pl:${currentPlaylistId}`],
    ["album-play-btn", null, () => `album:${$("album-title").textContent}`],
    ["artist-play-btn", null, () => `artist:${$("artist-name").textContent}`],
  ].forEach(([playId, shuffleId, key]) => {
    const btn = $(playId);
    if (!btn) return;
    const current = !!currentTrack && currentSource === key();
    btn.classList.toggle("is-current", current);
    const label = current && !shuffleOn ? (audio.paused ? "Продолжить" : "Пауза") : "Слушать";
    btn.querySelector(".pill-label").textContent = label;
    btn.setAttribute("aria-label", label === "Слушать" ? "Слушать по порядку" : label);
    if (shuffleId) $(shuffleId).setAttribute("aria-pressed", current && shuffleOn ? "true" : "false");
  });
  const mix = $("mymix-card");
  if (mix) updateMymixCardUI();
}
var repeatMode = "off"; // off | all | one

function setLoading(on) {
  isLoading = on;
  document.body.classList.toggle("is-loading", on);
  refreshRowStates();
}

function setPlaying(on) {
  document.body.classList.toggle("is-playing", on);
  const label = on ? "Пауза" : "Включить";
  $("mp-play-btn").setAttribute("aria-label", label);
  $("player-play-btn").setAttribute("aria-label", label);
  if ("mediaSession" in navigator) navigator.mediaSession.playbackState = on ? "playing" : "paused";
  if (window.NotkaAndroid && window.NotkaAndroid.updatePlaybackState) {
    try { window.NotkaAndroid.updatePlaybackState(on); } catch (e) {}
  }
  // Closing the Mini App mid-song would silently kill the music.
  if (tg && tgAtLeast("6.2")) {
    try { on ? tg.enableClosingConfirmation() : tg.disableClosingConfirmation(); } catch (e) { /* ignore */ }
  }
  updateMymixCardUI();
  updateSourceButtons();
  syncPrism();
}

function updateMymixCardUI() {
  const card = $("mymix-card");
  if (!card) return;
  const current = mymixActive && !!currentTrack;
  card.classList.toggle("is-current", current);
  card.classList.toggle("playing", current && !audio.paused);
  $("mymix-sub").textContent = current
    ? `${currentTrack.title || "Без названия"} · ${currentTrack.artist || ""}`
    : mixResumeFor("mymix")
      ? `Продолжить: ${mixResumeFor("mymix").track.title || "Без названия"} · ${mixResumeFor("mymix").track.artist || ""}`
    : state.favorites.length || state.playlists.length
      ? "Похожее на твои любимые треки и плейлисты"
      : "Отметь треки сердцем — и микс подберёт похожее";
  $("mymix-play-btn").setAttribute("aria-label", mymixActive && currentTrack && !audio.paused ? "Пауза" : "Включить «Мой микс»");
}

function setMiniPlayerFor(track) {
  $("mp-title").textContent = track.title || "Без названия";
  $("mp-artist").textContent = track.artist || "Неизвестный исполнитель";
  setCoverEl($("mp-art"), track.artwork, track.id);
}

function setFullPlayerFor(track) {
  $("player-title").textContent = track.title || "Без названия";
  $("player-artist").textContent = track.artist || "Неизвестный исполнитель";
  setCoverEl($("player-art"), hiResArtwork(track.artwork), track.id);
  // the cassette theme wears the cover as its label
  const art = hiResArtwork(track.artwork);
  $("cassette-art").style.backgroundImage = art ? `url("${art.replace(/"/g, "%22")}")` : "";
  $("cassette-title").textContent = track.title || "Без названия";
  $("cassette-artist").textContent = track.artist || "";
  syncPlayerFav();
}
function syncPlayerFav() {
  const on = !!currentTrack && Store.isFavorite(currentTrack.id);
  $("player-fav-btn").setAttribute("aria-pressed", on ? "true" : "false");
  $("player-fav-btn").setAttribute("aria-label", on ? "Убрать из любимого" : "В любимое");
  $("mp-fav-btn").setAttribute("aria-pressed", on ? "true" : "false");
  $("mp-fav-btn").setAttribute("aria-label", on ? "Убрать из любимого" : "В любимое");
}

function setMediaSession(track) {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title || "Без названия",
      artist: track.artist || "",
      album: track.album || currentContextLabel || "Нотка",
      // the lock screen / notification wants a big, square image
      artwork: track.artwork
        ? [{ src: hiResArtwork(track.artwork), sizes: "544x544", type: "image/jpeg" }, { src: track.artwork, sizes: "120x120", type: "image/jpeg" }]
        : [],
    });
    if (window.NotkaAndroid && window.NotkaAndroid.updateTrack) {
      try {
        window.NotkaAndroid.updateTrack(track.title || "Нотка", track.artist || "", track.album || currentContextLabel || "Нотка", track.artwork || "", true);
      } catch (e) {}
    }
  } catch (e) { /* older WebViews */ }
}

if ("mediaSession" in navigator) {
  const ms = navigator.mediaSession;
  const safe = (action, fn) => { try { ms.setActionHandler(action, fn); } catch (e) { /* unsupported */ } };
  safe("play", () => { if (audio.src) audio.play().catch(() => {}); });
  safe("pause", () => audio.pause());
  safe("previoustrack", () => playAdjacent(-1));
  safe("nexttrack", () => playAdjacent(1));
  safe("seekto", (d) => { if (d && typeof d.seekTime === "number") audio.currentTime = d.seekTime; });
}

// Если трек не играет, ищем ему замену: тот же трек от другой загрузки (другой источник, тот же исполнитель, та же длина)
var altTried = new Set();
async function findEquivalent(track) {
  try {
    const q = `${track.artist || ""} ${track.title || ""}`.trim();
    if (!q) return null;
    const res = await fetch(`${API_BASE_URL}/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const norm = (s) => String(s || "").toLowerCase().replace(/\(.*?\)|\[.*?\]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    const t0 = norm(track.title), a0 = norm(track.artist);
    const firstWord = (s) => s.split(" ")[0] || "";
    return (data.results || []).find((c) => c.id !== track.id && c.sourceId !== track.sourceId
      && norm(c.title) === t0
      && (!a0 || norm(c.artist).includes(firstWord(a0)) || a0.includes(firstWord(norm(c.artist))))
      && (!track.duration || !c.duration || Math.abs(c.duration - track.duration) <= 10)) || null;
  } catch (e) { return null; }
}

async function playTrack(track, queue, opts) {
  opts = opts || {};
  // leaving a mix for something else: keep its place
  if (currentMixKey && !opts.keepQueue && opts.mixKey !== currentMixKey) saveMixResume();
  const token = ++playToken;
  if (resolveAbort) resolveAbort.abort();
  resolveAbort = typeof AbortController !== "undefined" ? new AbortController() : null;

  currentTrackId = track.id;
  currentTrack = track;
  if (!opts.keepQueue) {
    queuedIds.clear();
    originalQueue = queue && queue.length ? queue.slice() : [track];
    currentQueue = shuffleOn ? withShuffledTail(originalQueue, track) : originalQueue.slice();
  }
  currentQueueIndex = currentQueue.findIndex((t) => t.id === track.id);
  if (!opts.keepQueue) {
    mymixActive = !!opts.mymix;
    currentSource = opts.source || null;
    currentMixKey = opts.mixKey || null;
  }
  // Where this track is playing "from" — shown in the full-player header
  // ("Мой микс" / an album or playlist name / "Поиск"…). When neither is
  // given (skipping to the next track in the same queue, say) we simply
  // keep showing whatever context was already on screen.
  if (opts.mymix) currentContextLabel = opts.context || "Мой микс";
  else if (opts.context) currentContextLabel = opts.context;
  else if (track.album && currentQueue.length <= 1) currentContextLabel = track.album;
  $("player-context").textContent = currentContextLabel === "Поиск" ? "Из поиска" : currentContextLabel;

  audio.pause();
  setPlaying(false);
  setLoading(true);
  isStarting = true;
  setMiniPlayerFor(track);
  setFullPlayerFor(track);
  setMediaSession(track);
  updateDock();
  renderQueueSheet();
  lightForTrack(track);
  loadLyrics();
  resetProgress(track);
  extendMixIfNeeded();
  haptic("light");

  try {
    // The backend downloads the track (or finds it already on disk) and
    // only then says "ready" — so a track that can't be played comes
    // back as an error with a reason, not as a silent player.
    const res = await fetch(`${API_BASE_URL}/prepare?${prepareQuery(track)}`, resolveAbort ? { signal: resolveAbort.signal } : undefined);
    if (token !== playToken) return;
    if (!res.ok) {
      let code = null;
      try {
        const body = await res.json();
        code = body && body.error && body.error.code;
      } catch (e) { /* body wasn't JSON — fall through with code=null */ }
      const err = new Error(`HTTP ${res.status}`);
      err.code = code;
      throw err;
    }
    // Played through our own backend, not the source's direct link:
    // those links are tied to the IP that resolved them (this computer),
    // so a phone hitting them over the internet gets cut off mid-stream.
    audio.src = `${API_BASE_URL}/stream?${trackQuery(track)}`;
    if (opts.startAt > 2) audio.addEventListener("loadedmetadata", () => { try { audio.currentTime = opts.startAt; } catch (e) { /* starts over */ } }, { once: true });
    await audio.play();
    if (token !== playToken) return;
    rememberRecent(track);
    track_play(track, opts);
    failStreak = 0;
    isStarting = false;
    setLoading(false);
    setPlaying(true);
    prepareNextTrack();
  } catch (err) {
    if (token !== playToken || (err && err.name === "AbortError")) return;
    console.error(err);
    track("play_error", { id: track.id, code: (err && err.code) || "net", retried: !!opts.retried });
    // a source answers «no» now and then for one request: the same track once more,
    // before it is given up on and skipped
    if (!opts.retried && !(err && err.code === "TRACK_NOT_FOUND")) {
      await new Promise((r) => setTimeout(r, 1200));
      if (token !== playToken) return;
      playTrack(track, currentQueue, { keepQueue: true, retried: true, altTried: opts.altTried, startAt: opts.startAt });
      return;
    }
    isStarting = false;
    setLoading(false);
    setPlaying(false);
    haptic("error");
    // выбранная запись не играет (источник отказал): пробуем равноценную с тем же названием и исполнителем
    if (!opts.altTried && !altTried.has(track.id)) {
      altTried.add(track.id);
      const alt = await findEquivalent(track);
      if (token !== playToken) return;
      if (alt) {
        const swap = (arr) => { const i = arr.findIndex((t) => t.id === track.id); if (i >= 0) arr[i] = alt; };
        swap(currentQueue); swap(originalQueue);
        playTrack(alt, currentQueue, { keepQueue: true, altTried: true });
        return;
      }
    }
    const hasNext = currentQueueIndex >= 0 && currentQueueIndex < currentQueue.length - 1;
    if (hasNext && failStreak < 3) {
      failStreak++;
      showToast(`«${track.title || "Трек"}» недоступен, включаем следующий`);
      setTimeout(() => { if (token === playToken) playAdjacent(1, { auto: true }); }, 900);
      return;
    }
    failStreak = 0;
    mymixActive = false;
    updateMymixCardUI();
    showToast(err && err.code === "TRACK_NOT_FOUND" ? "Трек не найден в официальном каталоге" : "Не удалось включить трек");
  }
}

function track_play(t, opts) {
  track("play", { id: t.id, a: (t.artist || "").slice(0, 60), src: String((opts && opts.source) || currentSource || "").slice(0, 20), ctx: String(currentContextLabel || "").slice(0, 30) });
}

function trackQuery(track) {
  return `source=${encodeURIComponent(track.source)}&id=${encodeURIComponent(track.sourceId)}`;
}
// the same, with what the server needs to remember how the track sounds (once, in the background)
function prepareQuery(track) {
  return `${trackQuery(track)}&title=${encodeURIComponent((track.title || "").slice(0, 160))}&artist=${encodeURIComponent((track.artist || "").slice(0, 160))}&duration=${Math.round(track.duration || 0)}`;
}

// While a track plays, the backend gets the next one ready, so the
// switch between tracks doesn't wait for a download.
var preparedId = null;
function prepareNextTrack() {
  const next = currentQueue[currentQueueIndex + 1];
  if (!next || next.id === preparedId) return;
  preparedId = next.id;
  fetch(`${API_BASE_URL}/prepare?${prepareQuery(next)}`).catch(() => {});
