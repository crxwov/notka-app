// ============================================================
// PROGRESS + SCRUBBING
// ============================================================
var progressTrack = $("player-progress-track");
var progressFill = $("player-progress-fill");
var progressThumb = $("player-progress-thumb");
var miniProgress = $("mp-progress");
var miniScrub = $("mp-scrub");
var miniTimeCur = $("mp-time-cur");
var miniTimeTot = $("mp-time-tot");

var isScrubbing = false;

// ---- a theme can be touched. A tap pauses or plays. A record or a
// disc is turned by the finger: a full turn is a quarter of a minute of
// music. A cassette is wound by a drag across it: its width is a minute.
var artWrap = document.querySelector(".player-art-wrap");
var TURN_SECONDS = 15, CASSETTE_SECONDS = 60;
var artGrab = null;
var artTheme = () => document.body.dataset.playerTheme || "standard";
artWrap.addEventListener("pointerdown", (e) => {
  if (artTheme() === "standard" || document.body.classList.contains("lyrics-open") || !currentTrack) return;
  if (e.target.closest("#theme-try, #player-lyrics")) return;
  const el = artTheme() === "cassette" ? playerCassette : $("player-art");
  const r = el.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  artGrab = { id: e.pointerId, x: e.clientX, y: e.clientY, cx, cy, width: r.width, moved: false, turned: 0, angle: Math.atan2(e.clientY - cy, e.clientX - cx), from: audio.currentTime || 0, to: null, tick: 0 };
  try { artWrap.setPointerCapture(e.pointerId); } catch (err) { /* the gesture still works without capture */ }
});
artWrap.addEventListener("pointermove", (e) => {
  if (!artGrab || e.pointerId !== artGrab.id) return;
  const g = artGrab;
  if (!g.moved) {
    if (Math.hypot(e.clientX - g.x, e.clientY - g.y) < 8) return;
    g.moved = true;
    isScrubbing = true;
    document.body.classList.add("art-held");
  }
  const dur = effectiveDuration();
  let shift;
  if (artTheme() === "cassette") {
    const dx = e.clientX - g.x;
    shift = (dx / g.width) * CASSETTE_SECONDS;
    playerCassette.style.setProperty("--reel-rot", `${dx * 4}deg`);
  } else {
    const angle = Math.atan2(e.clientY - g.cy, e.clientX - g.cx);
    let step = angle - g.angle;
    if (step > Math.PI) step -= 2 * Math.PI;
    if (step < -Math.PI) step += 2 * Math.PI;
    g.angle = angle;
    g.turned += (step * 180) / Math.PI;
    shift = (g.turned / 360) * TURN_SECONDS;
    artWrap.style.setProperty("--scrub", `${g.turned}deg`);
    // a soft click under the finger every sixth of a turn
    const tick = Math.round(g.turned / 60);
    if (tick !== g.tick) { g.tick = tick; haptic("select"); }
  }
  if (dur) {
    g.to = Math.max(0, Math.min(dur - 0.5, g.from + shift));
    renderProgress((g.to / dur) * 100, g.to);
  }
});
var endArtGrab = (e) => {
  if (!artGrab || (e && e.pointerId !== artGrab.id)) return;
  const g = artGrab;
  artGrab = null;
  document.body.classList.remove("art-held");
  artWrap.style.removeProperty("--scrub");
  playerCassette.style.removeProperty("--reel-rot");
  if (!g.moved) { if (!e || e.type === "pointerup") togglePlayPause(); return; }
  isScrubbing = false;
  if (g.to != null && e && e.type === "pointerup") { try { audio.currentTime = g.to; } catch (err) { /* not seekable yet */ } }
};
artWrap.addEventListener("pointerup", endArtGrab);
artWrap.addEventListener("pointercancel", endArtGrab);

// ---- свайп по плееру: влево — следующий трек, вправо — предыдущий
var playerScreen = $("screen-player");
var swipe = null;
var swipeTargets = () => [document.querySelector(".player-art-wrap"), document.querySelector(".player-meta")];
playerScreen.addEventListener("pointerdown", (e) => {
  if (!currentTrack || e.pointerType === "mouse" && e.button !== 0) return;
  if (document.body.classList.contains("quote-picking") || openOverlays.length) return;
  if (e.target.closest("button, input, a, textarea, #player-progress-track, .scrub-times, .theme-try")) return;
  // у винила, диска и кассеты палец на самой обложке крутит и перематывает, свайп тут не нужен
  if (artTheme() !== "standard" && !document.body.classList.contains("lyrics-open")) {
    const el = artTheme() === "cassette" ? playerCassette : $("player-art");
    const r = el.getBoundingClientRect();
    if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) return;
  }
  swipe = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, locked: false, t: performance.now() };
});
playerScreen.addEventListener("pointermove", (e) => {
  if (!swipe || e.pointerId !== swipe.id) return;
  const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
  if (!swipe.locked) {
    if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) { swipe = null; return; } // это вертикальный жест: текст, закрытие
    if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    swipe.locked = true;
    try { playerScreen.setPointerCapture(e.pointerId); } catch (err) { /* works without capture */ }
  }
  swipe.dx = dx;
  const k = Math.max(-1, Math.min(1, dx / 220));
  swipeTargets().forEach((el) => { if (!el) return; el.style.transition = "none"; el.style.transform = `translateX(${dx * 0.55}px)`; el.style.opacity = String(1 - Math.abs(k) * 0.55); });
});
var endSwipe = (e) => {
  if (!swipe || (e && e.pointerId !== swipe.id)) return;
  const s = swipe;
  swipe = null;
  if (!s.locked) return;
  const speed = Math.abs(s.dx) / Math.max(1, performance.now() - s.t);
  const go = e && e.type === "pointerup" && (Math.abs(s.dx) > 80 || (Math.abs(s.dx) > 40 && speed > 0.5));
  swipeTargets().forEach((el) => { if (!el) return; el.style.transition = ""; el.style.transform = ""; el.style.opacity = ""; });
  if (!go) return;
  haptic("light");
  const dir = s.dx < 0 ? 1 : -1;
  const token0 = playToken;
  playAdjacent(dir);
  // новый трек въезжает с той стороны, куда ушёл прежний
  if (playToken !== token0) {
    swipeTargets().forEach((el) => {
      if (!el) return;
      el.classList.remove("swipe-in-left", "swipe-in-right");
      void el.offsetWidth;
      el.classList.add(dir > 0 ? "swipe-in-right" : "swipe-in-left");
      setTimeout(() => el.classList.remove("swipe-in-left", "swipe-in-right"), 450);
    });
  }
};
playerScreen.addEventListener("pointerup", endSwipe);
playerScreen.addEventListener("pointercancel", endSwipe);
var lastPositionSync = 0;

// Telegram's in-app WebView frequently misjudges the *real* length of
// these tracks (in testing it consistently reported roughly double the
// true length for this container format) — audio.duration then says
// e.g. 9:04 for a track that's actually 4:32, so playback goes silent
// at 4:32 while the displayed timer, progress bar and "ended" event all
// keep waiting for a duration that will never really be reached. The
// backend already knows the true length from the track's own metadata
// (track.duration, in seconds), so trust that over the browser's guess
// — and if both are known, trust whichever is *shorter*, since real
// content can only ever be that long.
// True when the WebView's own duration is the doubled one described
// above. A small difference is not that bug: the audio behind a catalog
// track can honestly run a few seconds longer than its listed length,
// and cutting it at the listed length would clip the ending.
function nativeDurationIsWrong() {
  const meta = currentTrack && currentTrack.duration;
  const native = audio.duration;
  return !!(meta && native && isFinite(native) && native > meta * 1.5);
}
function effectiveDuration() {
  const meta = currentTrack && currentTrack.duration;
  const native = audio.duration;
  if (native && isFinite(native) && !nativeDurationIsWrong()) return native;
  return meta || 0;
}

function renderProgress(pct, seconds) {
  const p = Math.max(0, Math.min(100, pct));
  progressFill.style.width = `${p}%`;
  progressThumb.style.left = `${p}%`;
  miniScrub.style.setProperty("--mp", (p / 100).toFixed(4));
  playerCassette.style.setProperty("--p", (p / 100).toFixed(3)); // the tape moves from reel to reel
  progressTrack.setAttribute("aria-valuenow", String(Math.round(p)));
  progressTrack.setAttribute("aria-valuetext", formatDuration(seconds));
  $("player-time-current").textContent = formatDuration(seconds);
  if (document.body.classList.contains("is-desktop")) {
    miniTimeCur.textContent = formatDuration(seconds);
    miniTimeTot.textContent = formatDuration(effectiveDuration());
  }
}
function resetProgress(track) {
  renderProgress(0, 0);
  $("player-time-total").textContent = formatDuration(track.duration) || "0:00";
}

function finishCurrentTrack() {
  if (currentTrack) { track("complete", { id: currentTrack.id }); noteListened(currentTrack, 9999); }
  audio.pause();
  renderProgress(0, 0);
  if (sleepAfterTrack) { stopBySleep(); return; }
  if (repeatMode === "one" && currentTrack) {
    audio.currentTime = 0;
    audio.play().catch((e) => console.error(e));
    return;
  }
  const hasNext = currentQueueIndex >= 0 && currentQueueIndex < currentQueue.length - 1;
  if (hasNext || (repeatMode === "all" && currentQueue.length)) { playAdjacent(1, { auto: true }); return; }
  if (loopFinishedQueue()) return;
  // The queue is over: rewind, so ▶ plays this track again from the top.
  try { audio.currentTime = 0; } catch (e) { /* not seekable yet */ }
  updateMymixCardUI();
}

// listening stats: seconds actually heard, a "play" after 30s (or half a short track)
var statLast = null;
var statHeard = 0;
var statCounted = false;
var statSavedAt = 0;
function recordListening() {
  const t = audio.currentTime;
  if (statLast != null && !audio.paused && currentTrack) {
    const d = t - statLast;
    if (d > 0 && d < 2) {
      const L = state.listens;
      listensRev++;
      L.seconds += d;
      statHeard += d;
      eventNote("listen", d / 60, true);
      const hour = new Date().getHours();
      if (hour >= 22 || hour < 5) eventNote("night", d / 60, true);
      const key = currentTrack.artist || "Неизвестный исполнитель";
      const a = L.artists[key] || (L.artists[key] = { seconds: 0, plays: 0 });
      a.seconds += d;
      if (!a.artistId && currentTrack.artistId) { a.artistId = currentTrack.artistId; a.source = currentTrack.source; }
      // the same, per day — for «Неделя» and «Месяц»
      const days = L.days || (L.days = {});
      const today = dayKey(Date.now());
      const day = days[today] || (days[today] = { s: 0, p: 0, t: {}, a: {} });
      const dt = day.t[currentTrack.id] || (day.t[currentTrack.id] = [0, 0]);
      const da = day.a[key] || (day.a[key] = [0, 0]);
      day.s = Math.round((day.s + d) * 10) / 10;
      dt[1] = Math.round((dt[1] + d) * 10) / 10;
      da[1] = Math.round((da[1] + d) * 10) / 10;
      const tr = L.tracks[currentTrack.id] || (L.tracks[currentTrack.id] = { track: slimTrack(currentTrack), plays: 0, seconds: 0 });
      tr.seconds += d;
      const need = Math.min(30, (effectiveDuration() || 60) / 2);
      if (!statCounted && statHeard >= need) { statCounted = true; L.plays += 1; tr.plays += 1; a.plays += 1; day.p += 1; dt[0] += 1; da[0] += 1; }
      if (Date.now() - statSavedAt > 10000) { statSavedAt = Date.now(); persist(); }
    }
  }
  statLast = t;
}
audio.addEventListener("loadstart", () => { statLast = null; statHeard = 0; statCounted = false; });
audio.addEventListener("seeking", () => { statLast = null; });


