}

function withShuffledTail(queue, current) {
  const rest = queue.filter((t) => t.id !== current.id);
  return [current, ...shuffled(rest)];
}

function togglePlayPause() {
  if (!audio.getAttribute("src")) {
    if (currentTrack && !isLoading) playTrack(currentTrack, currentQueue, { keepQueue: true });
    return;
  }
  haptic("light");
  if (audio.paused) audio.play().catch((e) => console.error(e));
  else audio.pause();
}

// Плейлист, любимое, альбом, исполнитель не кончаются: по порядку идут сначала, вперемешку
// перемешиваются заново. «Мой микс» дополняется похожими сам; поиск и «Недавнее» просто останавливаются.
function loopFinishedQueue() {
  if (!currentTrack || !currentSource || currentSource === "mix" || originalQueue.length < 2) return false;
  let next;
  if (shuffleOn) {
    next = shuffled(originalQueue);
    if (next[0].id === currentTrack.id) next.push(next.shift()); // тот же трек подряд не ставим
  } else {
    next = originalQueue.slice();
  }
  currentQueue = next;
  playTrack(next[0], next, { keepQueue: true });
  renderQueueSheet();
  return true;
}

function playAdjacent(delta, opts) {
  opts = opts || {};
  if (!currentQueue.length || currentQueueIndex < 0) return;
  if (delta > 0 && currentQueueIndex >= currentQueue.length - 1 && repeatMode !== "all" && loopFinishedQueue()) return;
  let nextIndex = currentQueueIndex + delta;
  if (nextIndex >= currentQueue.length && repeatMode === "all") nextIndex = 0;
  if (nextIndex < 0 && delta < 0 && audio.currentTime > 3) { audio.currentTime = 0; return; }
  if (nextIndex < 0 || nextIndex >= currentQueue.length) {
    if (!opts.auto) showToast(delta > 0 ? "Это последний трек" : "Это первый трек");
    return;
  }
  if (delta > 0 && !opts.auto && currentTrack && audio.currentTime >= 0) {
    track("skip", { id: currentTrack.id, heard: Math.round(audio.currentTime || 0), dur: Math.round(audio.duration || currentTrack.duration || 0) });
    noteListened(currentTrack, audio.currentTime || 0);
  }
  playTrack(currentQueue[nextIndex], currentQueue, { keepQueue: true });
}

audio.addEventListener("play", () => setPlaying(true));
audio.addEventListener("pause", () => setPlaying(false));
audio.addEventListener("waiting", () => { if (!audio.paused) setLoading(true); });
audio.addEventListener("playing", () => setLoading(false));

// The stream broke mid-track (the network changed, the connection
// dropped). Reconnect once from the same second; if that fails too, say
// so instead of sitting silent. Failures at the start of a track are
// playTrack's own business.
var streamRetryAt = 0;
audio.addEventListener("error", () => {
  if (!currentTrack || isStarting || !audio.getAttribute("src")) return;
  const giveUp = () => {
    setLoading(false);
    setPlaying(false);
    haptic("error");
    showToast("Связь прервалась. Нажми ▶, когда интернет вернётся");
  };
  if (Date.now() - streamRetryAt < 20000) { giveUp(); return; }
  streamRetryAt = Date.now();
  const token = playToken;
  const position = audio.currentTime || 0;
  const stream = audio.getAttribute("src");
  setLoading(true);
  setTimeout(() => {
    if (token !== playToken) return;
    audio.src = stream;
    audio.addEventListener("loadedmetadata", () => { try { audio.currentTime = position; } catch (e) { /* starts over */ } }, { once: true });
    audio.play().then(() => setLoading(false)).catch(() => { if (token === playToken) giveUp(); });
  }, 1500);
});

$("mp-play-btn").addEventListener("click", (e) => { e.stopPropagation(); togglePlayPause(); });
$("mini-open-btn").addEventListener("click", () => { if (currentTrack) showScreen("player"); });
$("player-play-btn").addEventListener("click", togglePlayPause);
$("player-back-btn").addEventListener("click", goBack);
$("player-more-btn").addEventListener("click", () => { if (currentTrack) openTrackMenu(currentTrack); });
$("player-queue-btn").addEventListener("click", () => { renderQueueSheet(); openOverlay("queue-sheet"); });

// «Текст»: the lyrics take the cover's place in the player. They are
// fetched only while that view is open; when a source has timings, the
// line being sung is lit and kept in view, and a tap on a line jumps to it.
var lyricsBox = $("player-lyrics");
var lyricsList = $("lyrics-lines");
var lyricsCache = new Map(); // track id -> { lines, synced }
var lyricsOpen = false;
var lyricsTrackId = null; // whose text is on screen (or being fetched)
var lyricsData = null;
var lyricsActive = -1;
var lyricsTouchedAt = 0;

function renderLyrics(data) {
  $("lyrics-skeleton").hidden = true;
  lyricsData = data;
  lyricsActive = -1;
  lyricsList.innerHTML = "";
  lyricsList.classList.toggle("is-synced", !!data.synced);
  $("lyrics-note").textContent = data.lines.length ? "" : "Для этого трека текста пока нет.";
  document.body.classList.toggle("has-lyrics", data.lines.length > 0);
  const frag = document.createDocumentFragment();
  data.lines.forEach((line, i) => {
    const li = document.createElement("li");
    li.className = "lyrics-line";
    li.textContent = line.text;
    li.dataset.i = i;
    frag.appendChild(li);
  });
  lyricsList.appendChild(frag);
  lyricsBox.scrollTop = 0;
  syncLyrics(true, true);
}

var lyricsFetchTimer = 0;
var lyricsAbort = null;
async function loadLyrics() {
  const track = currentTrack;
  if (!lyricsOpen || !track || lyricsTrackId === track.id) return;
  lyricsTrackId = track.id;
  // flipping through tracks: what was still being asked for the passed one is dropped, and the old
  // text's scroll stops, so only the track that stays costs a request and a redraw
  clearTimeout(lyricsFetchTimer);
  if (lyricsAbort) { lyricsAbort.abort(); lyricsAbort = null; }
  cancelAnimationFrame(lyricsGlide);
  if (lyricsCache.has(track.id)) { renderLyrics(lyricsCache.get(track.id)); return; }
  if (!track.title) { renderLyrics({ lines: [], synced: false }); return; }
  lyricsData = null;
  document.body.classList.remove("has-lyrics");
  endQuotePick();
  lyricsList.innerHTML = "";
  $("lyrics-note").textContent = "";
  $("lyrics-skeleton").hidden = false;
  lyricsBox.scrollTop = 0;
  let data = null;
  // wait a moment: a quick flip to the next track makes this one's request pointless
  await new Promise((resolve) => { lyricsFetchTimer = setTimeout(resolve, 350); });
  if (lyricsTrackId !== track.id) return;
  const abort = new AbortController();
  lyricsAbort = abort;
  try {
    const q = `title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist || "")}`
      + (track.duration ? `&duration=${Math.round(track.duration)}` : "") + `&${trackQuery(track)}`;
    const res = await fetch(`${API_BASE_URL}/lyrics?${q}`, { signal: abort.signal });
    if (res.ok) data = await res.json();
  } catch (e) { /* shown as "couldn't load" below */ }
  if (lyricsAbort === abort) lyricsAbort = null;
  if (lyricsTrackId !== track.id) return;
  $("lyrics-skeleton").hidden = true;
  if (!data || !Array.isArray(data.lines)) {
    lyricsTrackId = null; // opening the text again retries
    $("lyrics-note").textContent = "Не получилось загрузить текст. Попробуй ещё раз чуть позже.";
    return;
  }
  lyricsCache.set(track.id, data);
  renderLyrics(data);
}

// The text glides: the new line rises to its place along an eased curve (not the
// browser's stock smooth scroll, which starts and stops abruptly), and the
// lines around it fade and grow by their distance from the sung one.
var lyricsGlide = 0;
function glideLyrics(to, instant) {
  cancelAnimationFrame(lyricsGlide);
  const from = lyricsBox.scrollTop, dist = to - from;
  if (instant || Math.abs(dist) < 2) { lyricsBox.scrollTop = to; return; }
  const ms = clamp(520 + Math.abs(dist) * 0.55, 620, 1150);
  const t0 = performance.now();
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const startedTouch = lyricsTouchedAt;
  const step = (now) => {
    if (lyricsTouchedAt !== startedTouch) return; // a hand took over: leave the text alone
    const k = Math.min(1, (now - t0) / ms);
    lyricsBox.scrollTop = from + dist * ease(k);
    if (k < 1) lyricsGlide = requestAnimationFrame(step);
  };
  lyricsGlide = requestAnimationFrame(step);
}
function syncLyrics(jump, instant) {
  if (!lyricsOpen || !lyricsData || !lyricsData.synced || currentScreen !== "player") return;
  const lines = lyricsData.lines;
  const t = audio.currentTime + 0.25; // light a line a touch early, as the ear expects
  let i = -1;
  while (i + 1 < lines.length && lines[i + 1].t <= t) i++;
  if (i === lyricsActive && !jump) return;
  lyricsActive = i;
  const items = lyricsList.children;
  for (let k = 0; k < items.length; k++) {
    items[k].classList.toggle("is-active", k === i);
    items[k].classList.toggle("is-past", k < i);
    // how bright a line is depends on how far it is from the sung one
    const d = k - i;
    const lo = k === i ? 1 : d < 0 ? Math.max(0.2, 0.42 + d * 0.06) : Math.max(0.26, 0.58 - d * 0.08);
    items[k].style.setProperty("--lo", lo.toFixed(2));
    items[k].style.setProperty("--bl", `${Math.min(2.2, Math.abs(d) * 0.55).toFixed(1)}px`);
  }
  // don't pull the text away from someone who is scrolling it by hand or picking lines
  if (quotePicking || (!jump && Date.now() - lyricsTouchedAt < 3000)) return;
  const top = i < 0 ? 0 : Math.max(0, items[i].offsetTop - lyricsBox.clientHeight * 0.3);
  glideLyrics(top, instant);
}

function setLyricsOpen(on) {
  lyricsOpen = on;
  document.body.classList.toggle("lyrics-open", on);
  lyricsBox.inert = !on;
  if (!on) { endQuotePick(); lyricsActive = -1; }
  $("player-lyrics-btn").setAttribute("aria-pressed", on ? "true" : "false");
  syncPrism();
  if (on) { loadLyrics(); syncLyrics(true, true); }
}
$("player-lyrics-btn").addEventListener("click", () => { haptic("light"); setLyricsOpen(!lyricsOpen); });
["touchstart", "wheel"].forEach((type) => lyricsBox.addEventListener(type, () => { lyricsTouchedAt = Date.now(); }, { passive: true }));

// A swipe down on the text puts it away — when the text is at its very
// top, so that the same gesture further down just scrolls it. The text
// follows the finger and either leaves or settles back.
var lyricsPull = null;
lyricsBox.addEventListener("touchstart", (e) => {
  lyricsPull = lyricsOpen && lyricsBox.scrollTop <= 0 && e.touches.length === 1 ? { y: e.touches[0].clientY, dy: 0 } : null;
}, { passive: true });
lyricsBox.addEventListener("touchmove", (e) => {
  if (!lyricsPull) return;
  lyricsPull.dy = e.touches[0].clientY - lyricsPull.y;
  if (lyricsPull.dy <= 0 || lyricsBox.scrollTop > 0) { lyricsPull.dy = 0; lyricsBox.style.transform = ""; lyricsBox.style.opacity = ""; return; }
  lyricsBox.style.transition = "none";
  lyricsBox.style.transform = `translateY(${lyricsPull.dy * 0.6}px)`;
  lyricsBox.style.opacity = String(Math.max(0.25, 1 - lyricsPull.dy / 320));
}, { passive: true });
var endLyricsPull = () => {
  if (!lyricsPull) return;
  const far = lyricsPull.dy > 80;
  lyricsPull = null;
  lyricsBox.style.transition = "";
  lyricsBox.style.transform = "";
  lyricsBox.style.opacity = "";
  if (far) { haptic("light"); setLyricsOpen(false); }
};
lyricsBox.addEventListener("touchend", endLyricsPull);
lyricsBox.addEventListener("touchcancel", endLyricsPull);
lyricsList.addEventListener("click", (e) => {
  const li = e.target.closest(".lyrics-line");
  if (li && quotePicking) { toggleQuoteLine(li); return; }
  if (!li || !lyricsData || !lyricsData.synced) return;
  try { audio.currentTime = lyricsData.lines[+li.dataset.i].t; } catch (err) { return; }
  lyricsTouchedAt = 0;
  haptic("light");
  syncLyrics(true);
});

$("queue-sheet-close").addEventListener("click", () => closeOverlay("queue-sheet"));
$("player-sleep-btn").addEventListener("click", () => { closeOverlay("track-menu-sheet"); openOverlay("sleep-timer-sheet"); });
$("sleep-timer-close").addEventListener("click", () => closeOverlay("sleep-timer-sheet"));
