// ============================================================
// LIBRARY («Моё»)
// ============================================================
function renderLibrary() {
  if (isDesktop()) renderSidebar();
  $("library-fav-count").textContent = pluralTracks(state.favorites.length);
  const grid = $("playlists-grid");
  grid.innerHTML = "";
  $("playlists-empty-msg").hidden = state.playlists.length > 0;
  $("create-playlist-btn").hidden = state.playlists.length === 0;
  const ordered = state.playlists.slice().sort((a, b) => Number(Store.isPlaylistFavorited(b.id)) - Number(Store.isPlaylistFavorited(a.id)));
  ordered.forEach((playlist) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "playlist-card";
    const cover = document.createElement("span");
    cover.className = "cover";
    setCoverEl(cover, playlistCoverUrl(playlist), playlist.id);
    const name = document.createElement("span");
    name.className = "playlist-name";
    name.textContent = playlist.name;
    const count = document.createElement("span");
    count.className = "playlist-count";
    count.textContent = pluralTracks(playlist.trackIds.length);
    if (Store.isPlaylistFavorited(playlist.id)) cover.insertAdjacentHTML("beforeend", `<span class="fav-badge" aria-label="Избранный">${icon("i-heart-fill", 16)}</span>`);
    card.appendChild(cover);
    card.appendChild(name);
    card.appendChild(count);
    card.addEventListener("click", () => openPlaylist(playlist.id));
    grid.appendChild(card);
  });
  renderFollows();
}
function renderFollows() {
  const shelf = $("follows-shelf");
  shelf.innerHTML = "";
  $("follows-block").hidden = state.followedArtists.length === 0;
  state.followedArtists.forEach((name) => {
    const meta = state.followedMeta[name] || {};
    const card = document.createElement("button");
    card.type = "button";
    card.className = "shelf-card";
    const cover = document.createElement("span");
    cover.className = "cover";
    setCoverEl(cover, meta.photo, name);
    const t = document.createElement("span");
    t.className = "shelf-title";
    t.textContent = name;
    card.appendChild(cover);
    card.appendChild(t);
    card.addEventListener("click", () => openArtistScreen(name, [], { artistId: meta.artistId, source: meta.source }));
    shelf.appendChild(card);
  });
}

$("open-favorites-btn").addEventListener("click", () => showScreen("favorites"));
$("create-playlist-btn").addEventListener("click", () => openCreatePlaylistModal());
$("create-playlist-empty-btn").addEventListener("click", () => openCreatePlaylistModal());

// ============================================================
// FAVORITES
// ============================================================
function renderFavoritesScreen() {
  const list = $("favorites-list");
  list.innerHTML = "";
  $("favorites-count").textContent = pluralTracks(state.favorites.length);
  $("favorites-empty").hidden = state.favorites.length > 0;
  $("favorites-play-btn").disabled = !state.favorites.length;
  $("favorites-shuffle-btn").disabled = !state.favorites.length;
  state.favorites.forEach((track) => list.appendChild(buildTrackRow(track, { queue: state.favorites, context: "Любимые треки" })));
  updateSourceButtons();
}
$("favorites-back-btn").addEventListener("click", goBack);
$("favorites-play-btn").addEventListener("click", () => playOrToggle("fav", state.favorites, "Любимые треки"));
$("favorites-shuffle-btn").addEventListener("click", () => shuffleOrToggle("fav", state.favorites, "Любимые треки"));

