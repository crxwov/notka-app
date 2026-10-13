// ============================================================
// PLAYLIST DETAIL
// ============================================================
var currentPlaylistId = null;

function openPlaylist(playlistId, keepStack) {
  const playlist = state.playlists.find((p) => p.id === playlistId);
  if (!playlist) return;
  currentPlaylistId = playlistId;
  $("playlist-title").textContent = playlist.name;
  const tracks = Store.getPlaylistTracks(playlistId);
  $("playlist-sub").textContent = playlist.description
    ? `${playlist.description} · ${pluralTracks(tracks.length)}`
    : pluralTracks(tracks.length);
  setCoverEl($("playlist-cover"), playlistCoverUrl(playlist), playlist.id);
  $("playlist-heart-btn").setAttribute("aria-pressed", Store.isPlaylistFavorited(playlistId) ? "true" : "false");

  const list = $("playlist-tracks-list");
  list.innerHTML = "";
  $("playlist-empty").hidden = tracks.length > 0;
  $("playlist-play-btn").disabled = !tracks.length;
  $("playlist-shuffle-btn").disabled = !tracks.length;
  tracks.forEach((track, i) => {
    list.appendChild(buildTrackRow(track, { index: i + 1, queue: tracks, context: playlist.name }));
  });
  updateSourceButtons();
  if (!keepStack) showScreen("playlist");
}

$("playlist-back-btn").addEventListener("click", goBack);
$("playlist-cover-edit-btn").addEventListener("click", async () => {
  if (!currentPlaylistId) return;
  const dataUrl = await pickAvatarImage();
  if (!dataUrl) return;
  Store.setPlaylistCover(currentPlaylistId, dataUrl);
  openPlaylist(currentPlaylistId, true);
  renderLibrary();
});
$("playlist-play-btn").addEventListener("click", () => {
  const tracks = Store.getPlaylistTracks(currentPlaylistId);
  if (!tracks.length) { showToast("Плейлист пуст"); return; }
  playOrToggle(`pl:${currentPlaylistId}`, tracks, $("playlist-title").textContent);
});
$("playlist-shuffle-btn").addEventListener("click", () => {
  const tracks = Store.getPlaylistTracks(currentPlaylistId);
  if (!tracks.length) { showToast("Плейлист пуст"); return; }
  shuffleOrToggle(`pl:${currentPlaylistId}`, tracks, $("playlist-title").textContent);
});
$("playlist-heart-btn").addEventListener("click", () => {
  if (!currentPlaylistId) return;
  const on = Store.togglePlaylistFavorited(currentPlaylistId);
  $("playlist-heart-btn").setAttribute("aria-pressed", on ? "true" : "false");
  haptic("light");
  showToast(on ? "Добавлено в избранные плейлисты" : "Убрано из избранных плейлистов");
});
$("playlist-empty-add-btn").addEventListener("click", () => openAddTracksScreen());

// ---- playlist "…" menu ----
$("playlist-menu-btn").addEventListener("click", () => {
  const playlist = state.playlists.find((p) => p.id === currentPlaylistId);
  if (!playlist) return;
  $("menu-playlist-title").textContent = playlist.name;
  setCoverEl($("menu-playlist-cover"), playlistCoverUrl(playlist), playlist.id);
  openOverlay("playlist-menu-sheet");
});
$("playlist-menu-close").addEventListener("click", () => closeOverlay("playlist-menu-sheet"));
$("menu-share").addEventListener("click", async () => {
  closeOverlay("playlist-menu-sheet");
  const playlist = state.playlists.find((p) => p.id === currentPlaylistId);
  if (playlist) sharePlaylist(playlist);
});
$("menu-download").addEventListener("click", () => {
  closeOverlay("playlist-menu-sheet");
  const tracks = Store.getPlaylistTracks(currentPlaylistId);
  if (!tracks.length) { showToast("Плейлист пуст"); return; }
  downloadTracks(tracks);
});
$("menu-addtracks").addEventListener("click", () => {
  closeOverlay("playlist-menu-sheet");
  openAddTracksScreen();
});
$("menu-editlist").addEventListener("click", () => {
  closeOverlay("playlist-menu-sheet");
  openEditPlaylistScreen();
});
$("menu-details").addEventListener("click", () => {
  closeOverlay("playlist-menu-sheet");
  const playlist = state.playlists.find((p) => p.id === currentPlaylistId);
  if (!playlist) return;
  $("details-name-input").value = playlist.name;
  $("details-desc-input").value = playlist.description || "";
  openOverlay("details-modal");
});
$("details-cancel").addEventListener("click", () => closeOverlay("details-modal"));
$("details-save").addEventListener("click", () => {
  const playlist = state.playlists.find((p) => p.id === currentPlaylistId);
  if (!playlist) return;
  const name = $("details-name-input").value.trim();
  if (!name) { $("details-name-input").focus(); return; }
  playlist.name = name;
  playlist.description = $("details-desc-input").value.trim();
  persist();
  closeOverlay("details-modal");
  openPlaylist(currentPlaylistId, true);
  renderLibrary();
  showToast("Изменения сохранены");
});
$("menu-delete").addEventListener("click", () => {
  const playlist = state.playlists.find((p) => p.id === currentPlaylistId);
  closeOverlay("playlist-menu-sheet");
  if (!playlist) return;
  const index = state.playlists.indexOf(playlist);
  Store.deletePlaylist(currentPlaylistId);
  renderLibrary();
  haptic("warning");
  goBack();
  showToast(`Плейлист «${playlist.name}» удалён`, {
    action: "Вернуть",
    onAction: () => {
      Store.restorePlaylist(playlist, index);
      refreshCurrentScreen();
      haptic("success");
      showToast(`Плейлист «${playlist.name}» на месте`);
    },
  });
});
// ---------- sharing ----------
// t.me/<bot>?start=t_<src>_<id> opens the bot, which answers with a
// button that opens Нотка on that track (see bot/main.py).
var SOURCE_CODES = { youtube_music: "ym", soundcloud: "sc", youtube_web: "yw", itunes: "it" };
var CODE_SOURCES = Object.fromEntries(Object.entries(SOURCE_CODES).map(([k, v]) => [v, k]));
var botUsername = null;
async function getBotUsername() {
  if (botUsername) return botUsername;
  const res = await fetch(`${API_BASE_URL}/bot-info`);
  if (!res.ok) throw new Error("bot-info");
  botUsername = (await res.json()).username;
  return botUsername;
}
var shareState = null;
function openShare(title, link, text) {
  shareState = { link, text };
  $("share-title").textContent = title;
  $("share-link").textContent = link;
  openOverlay("share-modal");
}
async function shareTrack(track) {
  const code = SOURCE_CODES[track.source];
  const payload = code ? `t_${code}_${track.sourceId}` : "";
  if (!code || !/^[A-Za-z0-9_-]{1,64}$/.test(payload)) { showToast("Этим треком пока нельзя поделиться"); return; }
  try {
    const bot = await getBotUsername();
    openShare(`Поделиться «${track.title || "трек"}»`, `https://t.me/${bot}?start=${payload}`, `${track.title || ""} — ${track.artist || ""} в Нотке`);
  } catch (e) { showToast("Не получилось создать ссылку, попробуй ещё раз"); }
}
async function sharePlaylist(playlist) {
  const tracks = Store.getPlaylistTracks(playlist.id);
  if (!tracks.length) { showToast("В плейлисте нет треков"); return; }
  showToast("Готовим ссылку…");
  try {
    const [bot, res] = await Promise.all([
      getBotUsername(),
      fetch(`${API_BASE_URL}/shared`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: playlist.name, tracks }) }),
    ]);
    if (!res.ok) throw new Error("shared");
    const { id } = await res.json();
    openShare(`Поделиться «${playlist.name}»`, `https://t.me/${bot}?start=p_${id}`, `Плейлист «${playlist.name}» в Нотке`);
    eventNote("share", 1);
  } catch (e) { showToast("Не получилось создать ссылку, попробуй ещё раз"); }
}
async function shareInvite() {
  try {
    const bot = await getBotUsername();
    openShare("Пригласить друзей", `https://t.me/${bot}`, "Слушаю музыку прямо в Telegram — попробуй Нотку");
  } catch (e) { showToast("Не получилось создать ссылку, попробуй ещё раз"); }
}
$("share-send").addEventListener("click", () => {
  if (!shareState) return;
  const url = `https://t.me/share/url?url=${encodeURIComponent(shareState.link)}&text=${encodeURIComponent(shareState.text)}`;
  if (tg && tg.openTelegramLink) tg.openTelegramLink(url);
  else if (navigator.share) navigator.share({ title: "Нотка", text: shareState.text, url: shareState.link }).catch(() => {});
  else window.open(url, "_blank");
  closeOverlay("share-modal");
});
$("share-copy-link").addEventListener("click", async () => {
  if (!shareState) return;
  try {
    await navigator.clipboard.writeText(shareState.link);
    showToast("Ссылка скопирована");
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = shareState.link;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand && document.execCommand("copy");
    ta.remove();
    showToast(ok ? "Ссылка скопирована" : "Скопируй ссылку вручную");
  }
  haptic("light");
});
$("share-close").addEventListener("click", () => closeOverlay("share-modal"));

// ---- add-tracks screen (real backend search, used for "add to playlist") ----
var addTracksDebounce = null;
var addTracksToken = 0;
function openAddTracksScreen() {
  const input = $("add-tracks-search");
  input.value = "";
  $("add-tracks-list").innerHTML = "";
  showScreen("addTracks");
  setTimeout(() => input.focus(), 60);
}
function addTracksMessage(text) {
  $("add-tracks-list").innerHTML = `<li><p class="empty-note empty-center">${escapeHtml(text)}</p></li>`;
}
$("add-tracks-search").addEventListener("input", (e) => {
  clearTimeout(addTracksDebounce);
  const q = e.target.value;
  addTracksDebounce = setTimeout(async () => {
    const token = ++addTracksToken;
    const list = $("add-tracks-list");
    if (!q.trim()) { list.innerHTML = ""; return; }
    addTracksMessage("Ищем…");
    try {
      const res = await fetch(`${API_BASE_URL}/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (token !== addTracksToken) return;
      const tracks = data.results || [];
      if (!tracks.length) { addTracksMessage("Ничего не нашлось"); return; }
      list.innerHTML = "";
      tracks.forEach((t) => {
        const playlist = state.playlists.find((p) => p.id === currentPlaylistId);
        const added = !!(playlist && playlist.trackIds.includes(t.id));
        const add = (btn) => {
          if (!currentPlaylistId) return;
          const pl = state.playlists.find((p) => p.id === currentPlaylistId);
          if (pl && pl.trackIds.includes(t.id)) { showToast("Уже в плейлисте"); return; }
          Store.addTrackToPlaylist(currentPlaylistId, t);
          renderLibrary();
          haptic("success");
          if (btn) {
            btn.classList.add("is-added");
            btn.innerHTML = icon("i-check", 22);
            btn.setAttribute("aria-label", "Уже в плейлисте");
          }
          showToast("Добавлено в плейлист");
        };
        list.appendChild(buildTrackRow(t, { action: "add", added, onAction: add, onMain: add }));
      });
    } catch (err) {
      if (token !== addTracksToken) return;
      addTracksMessage("Не удалось получить результаты. Проверь интернет");
    }
  }, 350);
});
$("add-tracks-back-btn").addEventListener("click", () => { goBack(); openPlaylist(currentPlaylistId, true); });

// ---- edit-playlist screen: a shredder — drag a track into the slit to
// remove it, drag it up or down to reorder; ✕ carries it in for you ----
var editShredder = null;
function openEditPlaylistScreen() {
  showScreen("editPlaylist");
  // build after the screen is visible so the shredder can measure itself
  requestAnimationFrame(renderEditPlaylistList);
}
function editRow(t) {
  const row = document.createElement("div");
  row.className = "edit-row";
  // grip drawn inline (not from the sprite) so it survives the shred snapshot
  row.innerHTML = `<svg class="edit-grip" viewBox="0 0 14 20" aria-hidden="true"><g fill="currentColor"><circle cx="4" cy="4" r="1.6"/><circle cx="10" cy="4" r="1.6"/><circle cx="4" cy="10" r="1.6"/><circle cx="10" cy="10" r="1.6"/><circle cx="4" cy="16" r="1.6"/><circle cx="10" cy="16" r="1.6"/></g></svg>`;
  const art = document.createElement("span");
  art.className = "cover cover-sm";
  setCoverEl(art, t.artwork, t.id);
  const meta = document.createElement("span");
  meta.className = "row-meta";
  meta.innerHTML = `<span class="row-title">${escapeHtml(t.title || "Без названия")}</span><span class="row-sub">${escapeHtml(t.artist || "")}</span>`;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "icon-btn";
  btn.setAttribute("aria-label", `Убрать «${t.title || "трек"}» из плейлиста`);
  btn.innerHTML = icon("i-close", 22);
  btn.addEventListener("click", (e) => { e.stopPropagation(); if (editShredder) editShredder.shred(t.id); });
  row.appendChild(art);
  row.appendChild(meta);
  row.appendChild(btn);
  return row;
}
function renderEditPlaylistList() {
  if (editShredder) { editShredder.destroy(); editShredder = null; }
  const tracks = Store.getPlaylistTracks(currentPlaylistId);
  const host = $("edit-playlist-list");
  host.innerHTML = "";
  host.removeAttribute("style");
  $("edit-playlist-empty").hidden = tracks.length > 0;
  if (!tracks.length) return;
  const playlistId = currentPlaylistId;
  editShredder = new window.Shredder(host, {
    items: tracks.map((t) => ({ id: t.id, el: editRow(t), track: t })),
    gap: 8,
    fallHeight: 150,
    slitHeight: 4,
    stripWidth: 14,
    bin: `${icon("i-trash", 28)}<span class="bin-title">Убрать из плейлиста</span><span class="bin-sub bin-idle">Перетащи трек в щель</span><span class="bin-sub bin-drag">Отпусти — трек исчезнет</span>`,
    onShred: (item) => {
      Store.removeTrackFromPlaylist(playlistId, item.id);
      haptic("medium");
      renderLibrary();
      if (!Store.getPlaylistTracks(playlistId).length) $("edit-playlist-empty").hidden = false;
    },
    onReorder: (items) => {
      Store.reorderPlaylist(playlistId, items.map((it) => it.id));
      haptic("select");
      renderLibrary();
    },
  });
}
$("edit-playlist-back-btn").addEventListener("click", () => { goBack(); openPlaylist(currentPlaylistId, true); });

