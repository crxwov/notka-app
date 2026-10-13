// ============================================================
// ВЫРАВНИВАНИЕ ГРОМКОСТИ: первые секунды трека измеряем, дальше подтягиваем или
// приглушаем до общего уровня. Работает через Web Audio, поэтому и там, где
// Telegram не даёт менять громкость. Включается в «Звук и загрузки».
// ============================================================
var loudness = (() => {
  const KEY = "notka_gain";
  const TARGET = 0.12, MIN = 0.45, MAX = 1.7;
  let ctx = null, gainNode = null, analyser = null, buf = null, timer = null, sumSq = 0, frames = 0, trackId = null;
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { cache = {}; }
  const sameOrigin = (() => { try { return !API_BASE_URL || new URL(API_BASE_URL, location.href).origin === location.origin; } catch (e) { return false; } })();
  const supported = sameOrigin && !!(window.AudioContext || window.webkitAudioContext);
  const enabled = () => !!Store.getSetting("loudness");
  function ensure() {
    if (ctx) return true;
    if (!supported) return false;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      const src = ctx.createMediaElementSource(audio);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      buf = new Float32Array(analyser.fftSize);
      gainNode = ctx.createGain();
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.003; limiter.release.value = 0.15;
      src.connect(analyser); analyser.connect(gainNode); gainNode.connect(limiter); limiter.connect(ctx.destination);
      return true;
    } catch (e) { ctx = null; return false; }
  }
  function setGain(g, fast) {
    if (!gainNode) return;
    gainNode.gain.setTargetAtTime(g, ctx.currentTime, fast ? 0.02 : 0.5);
  }
  function remember(id, g) {
    cache[id] = Math.round(g * 100) / 100;
    const keys = Object.keys(cache);
    if (keys.length > 400) delete cache[keys[0]];
    try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) { /* kept for this session */ }
  }
  function stop() { clearInterval(timer); timer = null; }
  function onPlaying(track) {
    stop();
    if (!enabled() || !track || !ensure()) { setGain(1, true); return; }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    trackId = track.id; sumSq = 0; frames = 0;
    if (cache[trackId]) { setGain(cache[trackId], true); return; }
    setGain(1, true);
    timer = setInterval(() => {
      if (audio.paused || audio.volume < userVolume * 0.99 || trackId !== (currentTrack && currentTrack.id)) return; // during a fade the level isn't the track's own
      analyser.getFloatTimeDomainData(buf);
      let s = 0;
      for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
      const rms = Math.sqrt(s / buf.length);
      if (rms < 0.006) return; // silence between notes isn't loudness
      sumSq += rms * rms; frames++;
      if (frames >= 45) { // about five seconds of real sound
        stop();
        const g = Math.max(MIN, Math.min(MAX, TARGET / Math.sqrt(sumSq / frames)));
        remember(trackId, g);
        setGain(g, false);
      }
    }, 120);
  }
  function reset() { stop(); }
  function refresh() { if (!enabled()) { stop(); setGain(1, false); } else if (!audio.paused && currentTrack) onPlaying(currentTrack); }
  return { supported, onPlaying, reset, refresh, enabled };
})();
audio.addEventListener("playing", () => loudness.onPlaying(currentTrack));
audio.addEventListener("loadstart", () => loudness.reset());

// «Плавный переход»: fade in at the start, fade out at the end
var volumeWorks = (() => { try { const p = document.createElement("audio"); p.volume = 0.5; return Math.abs(p.volume - 0.5) < 0.01; } catch (e) { return false; } })();
// the listener's own level (the computer's bar); a fade works under it
var userVolume = 1;
try { const v = parseFloat(localStorage.getItem("notka_volume")); if (v >= 0 && v <= 1) userVolume = v; } catch (e) { /* storage may be blocked */ }
function applyFade(t, dur) {
  if (!volumeWorks) return;
  const f = Store.getSetting("crossfade") || 0;
  if (!f || !dur) { if (audio.volume !== userVolume) audio.volume = userVolume; return; }
  const v = Math.max(0, Math.min(1, t / f, (dur - t) / f));
  audio.volume = Math.max(0.02, v) * userVolume;
}
function setUserVolume(v, remember) {
  userVolume = Math.max(0, Math.min(1, v));
  if (volumeWorks) audio.volume = userVolume;
  if (remember) { try { localStorage.setItem("notka_volume", String(userVolume)); } catch (e) { /* ignore */ } }
  $("mp-vol").value = String(Math.round(userVolume * 100));
  $("mp-vol").style.setProperty("--v", `${Math.round(userVolume * 100)}%`);
  $("mp-mute-btn").classList.toggle("is-muted", userVolume === 0);
  $("mp-mute-btn").setAttribute("aria-label", userVolume === 0 ? "Включить звук" : "Выключить звук");
}
var volumeBeforeMute = 0.8;
$("mp-vol").addEventListener("input", (e) => { setUserVolume(e.target.value / 100, true); if (userVolume > 0) volumeBeforeMute = userVolume; });
$("mp-mute-btn").addEventListener("click", () => {
  if (userVolume > 0) { volumeBeforeMute = userVolume; setUserVolume(0, true); } else setUserVolume(volumeBeforeMute || 0.8, true);
});
setUserVolume(userVolume, false);
$("mp-prev-btn").addEventListener("click", () => playAdjacent(-1));
$("mp-next-btn").addEventListener("click", () => playAdjacent(1));
$("mp-queue-btn").addEventListener("click", () => { renderQueueSheet(); openOverlay("queue-sheet"); });
$("mp-fav-btn").addEventListener("click", () => $("player-fav-btn").click());

audio.addEventListener("timeupdate", () => {
  recordListening();
  syncLyrics();
  const dur = effectiveDuration();
  if (!dur || isScrubbing) return;
  applyFade(audio.currentTime, dur);
  if (nativeDurationIsWrong() && audio.currentTime >= dur - 0.35) {
    // Real content has ended even though the browser's own (doubled)
    // duration hasn't been reached — stop here instead of leaving the
    // track "playing" silently. Otherwise the "ended" event does this.
    finishCurrentTrack();
    return;
  }
  renderProgress((audio.currentTime / dur) * 100, audio.currentTime);
  $("player-time-total").textContent = formatDuration(dur);
  const now = Date.now();
  if (currentMixKey && !isStarting && now - lastMixSave > 8000) saveMixResume();
  if ("mediaSession" in navigator && navigator.mediaSession.setPositionState && now - lastPositionSync > 4000) {
    lastPositionSync = now;
    try { navigator.mediaSession.setPositionState({ duration: dur, position: Math.min(audio.currentTime, dur), playbackRate: 1 }); } catch (e) { /* ignore */ }
  }
});
audio.addEventListener("ended", finishCurrentTrack);
// Telegram freezes a page it has put away: «ended» may come late or not at all. On the way
// back the player is put in line with what the sound did.
document.addEventListener("visibilitychange", () => {
  if (document.hidden || !currentTrack || isStarting) return;
  if (audio.ended) finishCurrentTrack();
});

// Scrubbing: works both as a tap-to-seek and a drag-to-seek (pointer
// events cover mouse, touch and pen in one handler, which is what makes
// an actual drag work — a plain "click" listener only ever fires once
// per tap and never tracks movement).
function pctFromEvent(e) {
  const rect = progressTrack.getBoundingClientRect();
  return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
}
function renderScrubPosition(pct) {
  renderProgress(pct * 100, pct * effectiveDuration());
}
progressTrack.addEventListener("pointerdown", (e) => {
  if (!effectiveDuration()) return;
  isScrubbing = true;
  progressTrack.classList.add("is-scrubbing");
  progressTrack.setPointerCapture(e.pointerId);
  renderScrubPosition(pctFromEvent(e));
});
progressTrack.addEventListener("pointermove", (e) => {
  if (!isScrubbing) return;
  renderScrubPosition(pctFromEvent(e));
});
function endScrub(e) {
  if (!isScrubbing) return;
  isScrubbing = false;
  progressTrack.classList.remove("is-scrubbing");
  const dur = effectiveDuration();
  if (dur) audio.currentTime = pctFromEvent(e) * dur;
}
progressTrack.addEventListener("pointerup", endScrub);
progressTrack.addEventListener("pointercancel", () => { isScrubbing = false; progressTrack.classList.remove("is-scrubbing"); });
// the same seek from the mini player's bottom edge. A touch low in the
// strip (on the line itself) seeks at once; higher up it seeks only when
// dragged sideways, so a plain tap there still opens the player.
// how far from the strip's ends the dot sits at 0 % and 100 % (from the stylesheet: it differs between the phone's strip and the computer's bar)
var miniInset = () => parseFloat(getComputedStyle(miniScrub).getPropertyValue("--tl")) || 21;
var MINI_LINE_ZONE = 20; // px from the bottom edge that count as «on the line»
var miniGrab = null;
function miniPct(e) {
  const r = miniScrub.getBoundingClientRect();
  const inset = miniInset();
  return Math.min(1, Math.max(0, (e.clientX - r.left - inset) / Math.max(1, r.width - inset * 2)));
}
function miniStart() {
  if (!miniGrab || miniGrab.on) return;
  miniGrab.on = true;
  isScrubbing = true;
  miniScrub.classList.add("is-scrubbing");
  haptic("select");
}
miniScrub.addEventListener("pointerdown", (e) => {
  const r = miniScrub.getBoundingClientRect();
  miniGrab = { id: e.pointerId, x: e.clientX, on: false, dead: !effectiveDuration() };
  try { miniScrub.setPointerCapture(e.pointerId); } catch (err) { /* works without capture too */ }
  if (!miniGrab.dead && r.bottom - e.clientY <= MINI_LINE_ZONE) { miniStart(); renderScrubPosition(miniPct(e)); }
});
miniScrub.addEventListener("pointermove", (e) => {
  if (!miniGrab || miniGrab.dead || e.pointerId !== miniGrab.id) return;
  if (!miniGrab.on && Math.abs(e.clientX - miniGrab.x) > 8) miniStart();
  if (miniGrab.on) renderScrubPosition(miniPct(e));
});
miniScrub.addEventListener("pointerup", (e) => {
  const g = miniGrab;
  miniGrab = null;
  if (!g) return;
  miniScrub.classList.remove("is-scrubbing");
  if (!g.on) { $("mini-open-btn").click(); return; } // a plain tap above the line opens the player
  isScrubbing = false;
  const dur = effectiveDuration();
  if (dur) audio.currentTime = miniPct(e) * dur;
});
miniScrub.addEventListener("pointercancel", () => { miniGrab = null; isScrubbing = false; miniScrub.classList.remove("is-scrubbing"); });

progressTrack.addEventListener("keydown", (e) => {
  const dur = effectiveDuration();
  if (!dur) return;
  if (e.key === "ArrowRight") { audio.currentTime = Math.min(dur - 1, audio.currentTime + 5); e.preventDefault(); }
  if (e.key === "ArrowLeft") { audio.currentTime = Math.max(0, audio.currentTime - 5); e.preventDefault(); }
});

