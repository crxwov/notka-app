// ============================================================
// Add-to-playlist sheet
// ============================================================
var addToPlaylistTrack = null;
function playlistCoverUrl(playlist) {
  if (playlist.cover) return playlist.cover;
  const first = Store.getPlaylistTracks(playlist.id).find((t) => t.artwork);
  return first ? first.artwork : null;
}
function renderAddToPlaylistSheet() {
  const list = $("add-to-playlist-list");
  list.innerHTML = "";
  if (!state.playlists.length) {
    list.innerHTML = `<p class="sheet-note">Своих плейлистов пока нет. Создай первый.</p>`;
    return;
  }
  state.playlists.forEach((p) => {
    const inList = addToPlaylistTrack && p.trackIds.includes(addToPlaylistTrack.id);
    const row = document.createElement("button");
    row.type = "button";
    row.className = "sheet-row";
    row.setAttribute("aria-pressed", inList ? "true" : "false");
    const cover = document.createElement("span");
    cover.className = "cover cover-xs";
    setCoverEl(cover, playlistCoverUrl(p), p.id);
    const name = document.createElement("span");
    name.textContent = p.name;
    row.appendChild(cover);
    row.appendChild(name);
    if (inList) row.insertAdjacentHTML("beforeend", `<span class="row-check">${icon("i-check", 22)}</span>`);
    row.addEventListener("click", () => {
      if (!addToPlaylistTrack) return;
      if (p.trackIds.includes(addToPlaylistTrack.id)) { showToast(`Уже в «${p.name}»`); return; }
      Store.addTrackToPlaylist(p.id, addToPlaylistTrack);
      haptic("success");
      showToast(`Добавлено в «${p.name}»`);
      renderAddToPlaylistSheet();
      renderLibrary();
      if (currentPlaylistId === p.id && currentScreen === "playlist") openPlaylist(p.id, true);
    });
    list.appendChild(row);
  });
}
function openAddToPlaylistSheet(track) {
  addToPlaylistTrack = track;
  renderAddToPlaylistSheet();
  openOverlay("add-to-playlist-sheet");
}
$("add-to-playlist-new").addEventListener("click", () => {
  closeOverlay("add-to-playlist-sheet");
  openCreatePlaylistModal(addToPlaylistTrack);
});
$("add-to-playlist-close").addEventListener("click", () => closeOverlay("add-to-playlist-sheet"));

// ============================================================
// TRACK MENU SHEET
// ============================================================
var trackMenuTrack = null;
function openTrackMenu(track) {
  trackMenuTrack = track;
  $("menu-track-title").textContent = track.title || "";
  $("menu-track-artist").textContent = track.artist || "";
  setCoverEl($("menu-track-cover"), track.artwork, track.id);
  syncTrackMenuFav();
  openOverlay("track-menu-sheet");
}
function syncTrackMenuFav() {
  const on = !!trackMenuTrack && Store.isFavorite(trackMenuTrack.id);
  $("menu-track-fav-label").textContent = on ? "Убрать из любимого" : "В любимое";
  $("menu-track-fav").querySelector("use").setAttribute("href", on ? "#i-heart-fill" : "#i-heart");
}
$("track-menu-close").addEventListener("click", () => closeOverlay("track-menu-sheet"));
$("menu-track-fav").addEventListener("click", () => {
  if (!trackMenuTrack) return;
  const on = Store.toggleFavorite(trackMenuTrack);
  haptic(on ? "success" : "light");
  closeOverlay("track-menu-sheet");
  showToast(on ? "Добавлено в любимое" : "Убрано из любимого");
  syncPlayerFav();
  refreshCurrentScreen();
});
$("menu-track-next").addEventListener("click", () => {
  closeOverlay("track-menu-sheet");
  if (trackMenuTrack) queueTrack(trackMenuTrack, false);
});
$("menu-track-queue").addEventListener("click", () => {
  closeOverlay("track-menu-sheet");
  if (trackMenuTrack) queueTrack(trackMenuTrack, true);
});
$("menu-track-share").addEventListener("click", () => {
  closeOverlay("track-menu-sheet");
  if (trackMenuTrack) shareTrack(trackMenuTrack);
});
$("menu-track-download").addEventListener("click", () => {
  closeOverlay("track-menu-sheet");
  if (trackMenuTrack) downloadTracks([trackMenuTrack]);
});
$("menu-track-addplaylist").addEventListener("click", () => {
  closeOverlay("track-menu-sheet");
  if (trackMenuTrack) openAddToPlaylistSheet(trackMenuTrack);
});
$("menu-track-artist-link").addEventListener("click", () => {
  closeOverlay("track-menu-sheet");
  if (trackMenuTrack) {
    openArtistScreen(trackMenuTrack.artist, currentQueue.length ? currentQueue : [trackMenuTrack], {
      artistId: trackMenuTrack.artistId,
      source: trackMenuTrack.source,
    });
  }
});
$("menu-track-album-link").addEventListener("click", () => {
  closeOverlay("track-menu-sheet");
  if (trackMenuTrack) {
    if (trackMenuTrack.albumId) openAlbumById(trackMenuTrack.source, trackMenuTrack.albumId, trackMenuTrack.album, trackMenuTrack.artist);
    else openAlbumScreen(trackMenuTrack);
  }
});

