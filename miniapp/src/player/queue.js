// ---- sleep timer ----
var sleepAt = 0;          // ms timestamp, 0 = off
var sleepAfterTrack = false;
var sleepTimer = null;
function sleepLeftText() {
  if (sleepAfterTrack) return "после трека";
  const min = Math.max(1, Math.ceil((sleepAt - Date.now()) / 60000));
  return `${min} мин`;
}
function syncSleepUI() {
  const on = !!sleepAt || sleepAfterTrack;
  $("sleep-off").hidden = !on;
  $("sleep-row-status").hidden = !on;
  if (on) $("sleep-row-status").textContent = sleepLeftText();
  $("sleep-status").textContent = on
    ? (sleepAfterTrack ? "Музыка остановится, когда закончится этот трек." : `Музыка остановится через ${sleepLeftText()}.`)
    : "Музыка сама остановится, когда выйдет время.";
}
function stopBySleep() {
  sleepAt = 0;
  sleepAfterTrack = false;
  clearInterval(sleepTimer);
  audio.pause();
  syncSleepUI();
  showToast("Таймер сна: музыка остановлена. Спокойной ночи");
}
function setSleep(value) {
  clearInterval(sleepTimer);
  sleepAt = 0;
  sleepAfterTrack = false;
  if (value === "track") sleepAfterTrack = true;
  else if (value) {
    sleepAt = Date.now() + Number(value) * 60000;
    sleepTimer = setInterval(() => {
      if (Date.now() >= sleepAt) stopBySleep();
      else syncSleepUI();
    }, 15000);
  }
  syncSleepUI();
}
document.querySelectorAll("#sleep-timer-sheet [data-min]").forEach((btn) => {
  btn.addEventListener("click", () => {
    setSleep(btn.dataset.min);
    haptic("success");
    closeOverlay("sleep-timer-sheet");
    showToast(btn.dataset.min === "track" ? "Остановлю музыку после этого трека" : `Таймер сна: ${btn.dataset.min} мин`);
  });
});
$("sleep-off").addEventListener("click", () => { setSleep(0); closeOverlay("sleep-timer-sheet"); showToast("Таймер выключен"); });
syncSleepUI();

// ---- downloads (Telegram saves the file to the device) ----
function downloadUrl(track) {
  return new URL(`${API_BASE_URL}/download?source=${encodeURIComponent(track.source)}&id=${encodeURIComponent(track.sourceId)}`, location.href).href;
}
function fileNameFor(track) {
  return `${(track.artist || "").trim()} - ${(track.title || "track").trim()}`.replace(/^ - /, "").replace(/[\\/:*?"<>|]+/g, " ").slice(0, 120) + (track.source === "soundcloud" ? ".mp3" : ".m4a");
}
function downloadTracks(tracks) {
  const list = tracks.slice();
  const canTg = !!(tg && tg.downloadFile && tgAtLeast("8.0"));
  if (list.length > 1) showToast(canTg ? `Telegram спросит про каждый файл: ${pluralTracks(list.length)}` : `Скачиваем ${pluralTracks(list.length)}`);
  else showToast("Готовим файл…");
  const next = () => {
    const t = list.shift();
    if (!t) return;
    if (canTg) {
      try { tg.downloadFile({ url: downloadUrl(t), file_name: fileNameFor(t) }, () => setTimeout(next, 300)); }
      catch (e) { showToast("Не получилось скачать"); }
    } else {
      const a = document.createElement("a");
      a.href = downloadUrl(t);
      a.download = fileNameFor(t);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(next, 1200);
    }
  };
  next();
}
$("player-prev-btn").addEventListener("click", () => playAdjacent(-1));
$("player-next-btn").addEventListener("click", () => playAdjacent(1));
$("player-fav-btn").addEventListener("click", () => {
  if (!currentTrack) return;
  const isFav = Store.toggleFavorite(currentTrack);
  haptic(isFav ? "success" : "light");
  syncPlayerFav();
  refreshCurrentScreen();
});

// ---- queue: shuffle + repeat live here ----
function syncModeButtons() {
  if (typeof updateSourceButtons === "function") updateSourceButtons();
  const sh = $("queue-shuffle-btn");
  sh.setAttribute("aria-pressed", shuffleOn ? "true" : "false");
  const rp = $("queue-repeat-btn");
  rp.setAttribute("aria-pressed", repeatMode !== "off" ? "true" : "false");
  rp.classList.toggle("is-one", repeatMode === "one");
  rp.setAttribute("aria-label", repeatMode === "off" ? "Повтор: выключен" : repeatMode === "all" ? "Повтор: вся очередь" : "Повтор: один трек");
}
$("queue-shuffle-btn").addEventListener("click", () => {
  shuffleOn = !shuffleOn;
  if (currentTrack) {
    currentQueue = shuffleOn ? withShuffledTail(originalQueue, currentTrack) : originalQueue.slice();
    currentQueueIndex = currentQueue.findIndex((t) => t.id === currentTrack.id);
  }
  haptic("select");
  syncModeButtons();
  renderQueueSheet();
  showToast(shuffleOn ? "Перемешали очередь" : "Обычный порядок");
});
$("queue-repeat-btn").addEventListener("click", () => {
  repeatMode = repeatMode === "off" ? "all" : repeatMode === "all" ? "one" : "off";
  haptic("select");
  syncModeButtons();
  showToast(repeatMode === "off" ? "Повтор выключен" : repeatMode === "all" ? "Повтор всей очереди" : "Повтор одного трека");
});
syncModeButtons();

// «Играть следующим» / «В конец очереди»: добавленное встаёт сразу после играющего,
// в том порядке, в каком его добавляли (второе «следующим» идёт после первого).
function queueTrack(track, atEnd) {
  if (!track) return;
  if (!currentTrack || !currentQueue.length) {
    queuedIds.clear();
    playTrack(track, [track], { context: "Очередь" });
    return;
  }
  if (track.id === currentTrack.id) { showToast("Этот трек уже играет"); return; }
  const had = currentQueue.findIndex((t) => t.id === track.id);
  if (had >= 0) currentQueue.splice(had, 1); // not twice in the queue
  currentQueueIndex = currentQueue.findIndex((t) => t.id === currentTrack.id);
  let pos;
  if (atEnd) pos = currentQueue.length;
  else {
    pos = currentQueueIndex + 1;
    while (pos < currentQueue.length && queuedIds.has(currentQueue[pos].id)) pos++;
  }
  currentQueue.splice(pos, 0, track);
  queuedIds.add(track.id);
  preparedId = null;
  prepareNextTrack();
  renderQueueSheet();
  haptic("success");
  showToast(atEnd ? "Добавлено в конец очереди" : "Сыграет следующим");
}

function renderQueueSheet() {
  const list = $("queue-list");
  if (!list) return;
  list.innerHTML = "";
  if (!currentQueue.length) { list.innerHTML = `<li><p class="empty-note empty-center">Очередь пуста</p></li>`; return; }
  currentQueue.forEach((t, i) => {
    const row = buildTrackRow(t, {
      action: "none",
      onMain: () => playTrack(currentQueue[i], currentQueue, { keepQueue: true }),
    });
    if (i < currentQueueIndex) row.style.opacity = "0.55";
    list.appendChild(row);
  });
}

