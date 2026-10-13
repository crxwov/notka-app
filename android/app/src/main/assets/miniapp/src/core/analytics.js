// ---- small product events: which searches find nothing, what is skipped, what fails ----
// They go to the server in batches, tied to a keyed hash and not to a name, and the switch
// in «Аккаунт» turns them off. Only the names of things, never the text of anything private.
var eventQueue = [];
var eventsFlushing = false;
function track(name, props) {
  try {
    if (state.settings.analyticsOff) return;
    if (!tgInitRaw && !localStorage.getItem("notka_auth_token")) return;
    eventQueue.push({ e: name, t: Date.now(), p: props || {} });
    if (eventQueue.length >= 25) flushEvents();
  } catch (e) { /* never in the way */ }
}
async function flushEvents() {
  const tok = localStorage.getItem("notka_auth_token");
  if (eventsFlushing || !eventQueue.length || (!tgInitRaw && !tok) || state.settings.analyticsOff) return;
  eventsFlushing = true;
  const batch = eventQueue.splice(0, 50);
  try {
    const headers = { "content-type": "application/json" };
    if (tgInitRaw) headers["X-Telegram-Init-Data"] = tgInitRaw;
    if (tok) headers["X-Auth-Token"] = tok;
    const res = await fetch(`${API_BASE_URL}/analytics`, {
      method: "POST",
      headers,
      body: JSON.stringify({ d: syncDeviceId, events: batch }),
      keepalive: true,
    });
    if (res.status >= 500) eventQueue.unshift(...batch.slice(0, 25));
  } catch (e) {
    eventQueue.unshift(...batch.slice(0, 25));
  } finally {
    eventsFlushing = false;
  }
}
setInterval(flushEvents, 30000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushEvents(); });

var Store = {
  isFavorite(id) { return state.favorites.some((t) => t.id === id); },
  toggleFavorite(track) {
    const idx = state.favorites.findIndex((t) => t.id === track.id);
    if (idx >= 0) state.favorites.splice(idx, 1);
    else { state.favorites.unshift(track); eventNote("fav", 1, true); }
    persist();
    return this.isFavorite(track.id);
  },
  createPlaylist(name) {
    const playlist = { id: `pl_${Date.now()}`, name, trackIds: [], tracksCache: {} };
    state.playlists.unshift(playlist);
    persist();
    return playlist;
  },
  deletePlaylist(id) {
    const idx = state.playlists.findIndex((p) => p.id === id);
    if (idx >= 0) state.playlists.splice(idx, 1);
    persist();
  },
  restorePlaylist(playlist, index) {
    if (state.playlists.some((p) => p.id === playlist.id)) return;
    state.playlists.splice(Math.min(index, state.playlists.length), 0, playlist);
    persist();
  },
  addTrackToPlaylist(playlistId, track) {
    eventNote("playlist", 1);
    const playlist = state.playlists.find((p) => p.id === playlistId);
    if (!playlist) return;
    if (!playlist.trackIds.includes(track.id)) playlist.trackIds.push(track.id);
    playlist.tracksCache = playlist.tracksCache || {};
    playlist.tracksCache[track.id] = track;
    persist();
  },
  getPlaylistTracks(playlistId) {
    const playlist = state.playlists.find((p) => p.id === playlistId);
    if (!playlist) return [];
    const cache = playlist.tracksCache || {};
    return playlist.trackIds.map((id) => cache[id]).filter(Boolean);
  },
  reorderPlaylist(playlistId, trackIds) {
    const playlist = state.playlists.find((p) => p.id === playlistId);
    if (!playlist) return;
    const keep = new Set(playlist.trackIds);
    playlist.trackIds = trackIds.filter((id) => keep.has(id));
    persist();
  },
  removeTrackFromPlaylist(playlistId, trackId) {
    const playlist = state.playlists.find((p) => p.id === playlistId);
    if (!playlist) return;
    playlist.trackIds = playlist.trackIds.filter((id) => id !== trackId);
    if (playlist.tracksCache) delete playlist.tracksCache[trackId];
    persist();
  },
  renamePlaylist(id, name) {
    const playlist = state.playlists.find((p) => p.id === id);
    if (!playlist) return;
    playlist.name = name;
    persist();
  },
  isPlaylistFavorited(id) { return !!(state.playlistFlags[id] && state.playlistFlags[id].favorited); },
  togglePlaylistFavorited(id) {
    state.playlistFlags[id] = state.playlistFlags[id] || {};
    state.playlistFlags[id].favorited = !state.playlistFlags[id].favorited;
    persist();
    return state.playlistFlags[id].favorited;
  },
  isArtistFollowed(name) { return state.followedArtists.includes(name); },
  toggleArtistFollow(name, meta) {
    const idx = state.followedArtists.indexOf(name);
    if (idx >= 0) { state.followedArtists.splice(idx, 1); delete state.followedMeta[name]; }
    else { state.followedArtists.push(name); state.followedMeta[name] = meta || {}; }
    persist();
    return state.followedArtists.includes(name);
  },
  getSetting(key) { return state.settings[key]; },
  setSetting(key, value) { state.settings[key] = value; persist(); },
  getAccountName() { return state.accountName; },
  setAccountName(name) { state.accountName = name; persist(); },
  getAccountAvatar() { return state.accountAvatar; },
  setAccountAvatar(dataUrl) { state.accountAvatar = dataUrl; persist(); },
  getPlaylistCover(id) {
    const playlist = state.playlists.find((p) => p.id === id);
    return playlist ? playlist.cover || null : null;
  },
  setPlaylistCover(id, dataUrl) {
    const playlist = state.playlists.find((p) => p.id === id);
    if (!playlist) return;
    playlist.cover = dataUrl;
    persist();
  },
  markOnboardingSeen() { state.onboardingSeen = true; state.onboardingSeenV2 = true; persist(); },
  isOnboardingSeen() { return state.onboardingSeen; },
};

