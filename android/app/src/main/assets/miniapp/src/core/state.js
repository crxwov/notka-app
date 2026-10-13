// ============================================================
// Local persistence (favorites + playlists). Client-side only
// for now — see README for why. Real accounts backend later.
// ============================================================
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error("empty");
    const parsed = JSON.parse(raw);
    return {
      favorites: parsed.favorites || [],
      playlists: parsed.playlists || [],
      settings: Object.assign({
        activityVisible: true,
        publicPlaylists: false,
        normalize: true,
        wifiOnlyDownloads: true,
        crossfade: 0,
        notifNews: true,
        notifNewMusic: true,
        notifPlaylistUpdates: false,
      }, parsed.settings || {}),
      followedArtists: parsed.followedArtists || [],
      playlistFlags: parsed.playlistFlags || {}, // { [playlistId]: { favorited: bool } }
      accountName: parsed.accountName || null,
      accountAvatar: parsed.accountAvatar || null,
      onboardingSeen: !!parsed.onboardingSeenV2,
      onboardingSeenV2: !!parsed.onboardingSeenV2, // kept under its own name, or the next save would forget it
      notifUnread: typeof parsed.notifUnread === "number" ? Math.min(parsed.notifUnread, 0) : 0,
      followedMeta: parsed.followedMeta || {},
      listens: parsed.listens || { seconds: 0, plays: 0, tracks: {}, artists: {} },
      sharedImports: parsed.sharedImports || {},
      recent: parsed.recent || [], // the last tracks played, newest first
      searchHistory: parsed.searchHistory || [], // what was searched and opened from search, newest first
      skipStats: parsed.skipStats || {}, // per artist: how often a track was turned away early (s) or heard on (p); this device only
      fresh: parsed.fresh || null, // { key, at, items } — «Новое от любимых исполнителей»
      events: parsed.events || null, // { progress, items } — see «События»
      syncTs: parsed.syncTs || {}, // when each shared key last changed on this device
      remoteListens: parsed.remoteListens || null, // the other devices' listening stats (see the account sync)
      listensResetPending: !!parsed.listensResetPending,
    };
  } catch (e) {
    return {
      favorites: [], playlists: [],
      settings: { activityVisible: true, publicPlaylists: false, normalize: true, wifiOnlyDownloads: true, crossfade: 0, notifNews: true, notifNewMusic: true, notifPlaylistUpdates: false },
      followedArtists: [], playlistFlags: {}, accountName: null, accountAvatar: null, onboardingSeen: false, notifUnread: 0,
      followedMeta: {}, listens: { seconds: 0, plays: 0, tracks: {}, artists: {} }, sharedImports: {},
    };
  }
}
var state = loadState();
state.events = state.events || { progress: {}, items: [] };
state.searchHistory = state.searchHistory || [];
state.skipStats = state.skipStats || {};
function ownsItem(item) { return state.events.items.includes(item); }
// Only what a row needs to be shown and played again.
function slimTrack(t) {
  return { id: t.id, source: t.source, sourceId: t.sourceId, title: t.title, artist: t.artist, duration: t.duration, artwork: t.artwork, album: t.album, albumId: t.albumId, artistId: t.artistId };
}
// Listening stats are the one part of the state that grows on its own;
// keep the most-played tracks and let the long tail go.
function trimListens(keep) {
  // per-day records serve «Неделя», «Месяц» and the «Машина времени»: three months of them,
  // and from the ninth day back only the most-played of each day is kept
  const days = state.listens.days;
  if (days) {
    const oldest = dayKey(Date.now() - 100 * 86400000);
    const thin = dayKey(Date.now() - 9 * 86400000);
    Object.keys(days).forEach((key) => {
      if (key < oldest) { delete days[key]; return; }
      if (key < thin) {
        const day = days[key];
        const top = (obj, n) => Object.fromEntries(Object.entries(obj || {}).sort((a, b) => b[1][1] - a[1][1]).slice(0, n));
        if (Object.keys(day.t).length > 15) day.t = top(day.t, 15);
        if (Object.keys(day.a).length > 8) day.a = top(day.a, 8);
      }
    });
  }
  const entries = Object.entries(state.listens.tracks);
  if (entries.length <= keep) return;
  entries.sort((a, b) => b[1].plays - a[1].plays || b[1].seconds - a[1].seconds);
  state.listens.tracks = Object.fromEntries(entries.slice(0, keep));
}
var storageFullWarned = false;
function persist(quiet) {
  stampChanges();
  trimListens(300);
  if (!quiet) scheduleSync();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    // most likely the storage quota: drop what is cheapest to lose and retry
    trimListens(40);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e2) {
      console.warn("Could not persist state", e2);
      if (!storageFullWarned) {
        storageFullWarned = true;
        showToast("Память Нотки на этом устройстве заполнена — новые изменения не сохранятся");
      }
    }
  }
}

