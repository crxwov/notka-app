// ============================================================
// ONE ACCOUNT, ALL DEVICES. Inside Telegram the favourites, playlists,
// settings and listening stats also live on the server under the user's
// Telegram account, so the phone and the computer show the same.
//  - the ordinary keys: each has its own time of last change, the newer wins
//    (the first time a device joins, the lists are united, nothing is lost);
//  - the stats add up: every device keeps its own counter, the whole is the sum.
// ============================================================
var SYNC_KEYS = ["favorites", "playlists", "settings", "followedArtists", "followedMeta", "playlistFlags", "accountName", "accountAvatar", "recent", "sharedImports", "onboardingSeenV2", "searchHistory"];
var SYNC_JOINED_KEY = "notka_sync_joined_v1";
var syncSnap = {};
state.syncTs = state.syncTs || {};
function snapOf(key) { return JSON.stringify(state[key] === undefined ? null : state[key]); }
SYNC_KEYS.forEach((k) => { syncSnap[k] = snapOf(k); });
// what changed since the last look gets a time stamp
function stampChanges() {
  const now = Date.now();
  SYNC_KEYS.forEach((k) => {
    const j = snapOf(k);
    if (syncSnap[k] !== j) { syncSnap[k] = j; state.syncTs[k] = now; }
  });
}
var syncDeviceId = (() => {
  try {
    let id = localStorage.getItem("notka_device_id");
    if (!id) { id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36); localStorage.setItem("notka_device_id", id); }
    return id;
  } catch (e) { return "tmp" + Math.random().toString(36).slice(2, 8); }
})();

// «Недавнее» from two devices: all the tracks, the most recently played first
function mergeRecent(a, b) {
  const best = new Map();
  [...(a || []), ...(b || [])].forEach((t, i) => {
    if (!t || !t.id) return;
    const at = t.at || 0;
    const cur = best.get(t.id);
    if (!cur || at > (cur.t.at || 0)) best.set(t.id, { t, i });
  });
  return [...best.values()]
    .sort((x, y) => (y.t.at || 0) - (x.t.at || 0) || x.i - y.i)
    .slice(0, 20)
    .map((x) => x.t);
}

var listensRev = 0, listensViewRev = -1, listensViewCache = null;
function mergeListens(a, b) {
  const out = { seconds: (a.seconds || 0) + (b.seconds || 0), plays: (a.plays || 0) + (b.plays || 0), tracks: {}, artists: {}, days: {} };
  [a, b].forEach((src) => {
    Object.entries(src.tracks || {}).forEach(([id, x]) => {
      const t = out.tracks[id] || (out.tracks[id] = { track: x.track, plays: 0, seconds: 0 });
      t.plays += x.plays || 0; t.seconds += x.seconds || 0;
      if (!t.track && x.track) t.track = x.track;
    });
    Object.entries(src.artists || {}).forEach(([name, x]) => {
      const t = out.artists[name] || (out.artists[name] = { seconds: 0, plays: 0 });
      t.seconds += x.seconds || 0; t.plays += x.plays || 0;
      if (!t.artistId && x.artistId) { t.artistId = x.artistId; t.source = x.source; }
    });
    Object.entries(src.days || {}).forEach(([key, d]) => {
      const day = out.days[key] || (out.days[key] = { s: 0, p: 0, t: {}, a: {} });
      day.s = Math.round((day.s + (d.s || 0)) * 10) / 10; day.p += d.p || 0;
      Object.entries(d.t || {}).forEach(([id, v]) => { const x = day.t[id] || (day.t[id] = [0, 0]); x[0] += v[0] || 0; x[1] = Math.round((x[1] + (v[1] || 0)) * 10) / 10; });
      Object.entries(d.a || {}).forEach(([name, v]) => { const x = day.a[name] || (day.a[name] = [0, 0]); x[0] += v[0] || 0; x[1] = Math.round((x[1] + (v[1] || 0)) * 10) / 10; });
    });
  });
  return out;
}
// what every screen reads: this device's stats plus the other devices'
function listensView() {
  const other = state.remoteListens;
  if (!other) return state.listens;
  if (listensViewRev === listensRev && listensViewCache) return listensViewCache;
  listensViewCache = mergeListens(state.listens, other);
  listensViewRev = listensRev;
  return listensViewCache;
}

// the signed launch data: from the bridge, and when that script did not load, from the
// address Telegram opened the page with (#tgWebAppData=...), which carries the same string
var tgInitRaw = (() => {
  try {
    return (tg && tg.initData) || new URLSearchParams(window.location.hash.slice(1)).get("tgWebAppData") || "";
  } catch (e) { return ""; }
})();
var syncOn = () => !!tgInitRaw || !!localStorage.getItem("notka_auth_token");
// what the sync is doing, for the account screen: idle | ok | auth | big | net
var syncStatus = { code: "idle", at: 0 };
function setSyncStatus(code) {
  syncStatus = { code, at: Date.now() };
  try { if (typeof currentScreen !== "undefined" && currentScreen === "account") renderAccountScreen(); } catch (e) { /* not drawn yet */ }
}
var syncBusy = false, syncAgain = false, syncTimer = 0, syncDeadAt = 0, syncLastAt = 0;
function scheduleSync(ms) {
  if (!syncOn() || Date.now() < syncDeadAt) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, ms || 12000);
}
async function postSync(payload) {
  const headers = { "content-type": "application/json" };
  if (tgInitRaw) headers["X-Telegram-Init-Data"] = tgInitRaw;
  const token = localStorage.getItem("notka_auth_token");
  if (token) headers["X-Auth-Token"] = token;
  const res = await fetch(`${API_BASE_URL}/sync`, {
    method: "POST",
    headers: headers,
    body: JSON.stringify(payload),
  });
  if (res.status === 401) { syncDeadAt = Date.now() + 20 * 60 * 1000; const e = new Error("sync auth"); e.syncCode = "auth"; throw e; }
  if (res.status === 413) { syncDeadAt = Date.now() + 2 * 3600 * 1000; const e = new Error("sync big"); e.syncCode = "big"; throw e; }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
// the first time this device joins the account: lists are united, not replaced
function unionIntoLocal(remote) {
  const r = remote.shared || {};
  const byId = (list) => new Map((list || []).map((x) => [x.id, x]));
  if (Array.isArray(r.favorites)) {
    const have = byId(state.favorites);
    const extra = r.favorites.filter((t) => t && !have.has(t.id));
    state.favorites = state.favorites.concat(extra);
  }
  if (Array.isArray(r.playlists)) {
    const have = byId(state.playlists);
    r.playlists.forEach((p) => {
      if (!p || !p.id) return;
      const mine = have.get(p.id);
      if (!mine) { state.playlists.push(p); return; }
      const ids = new Set(mine.trackIds || []);
      (p.trackIds || []).forEach((id) => { if (!ids.has(id)) { (mine.trackIds = mine.trackIds || []).push(id); } });
      mine.tracksCache = Object.assign({}, p.tracksCache || {}, mine.tracksCache || {});
    });
  }
  if (Array.isArray(r.followedArtists)) {
    const have = new Set(state.followedArtists);
    r.followedArtists.forEach((n) => { if (!have.has(n)) state.followedArtists.push(n); });
    state.followedMeta = Object.assign({}, r.followedMeta || {}, state.followedMeta || {});
  }
  if (Array.isArray(r.recent)) state.recent = mergeRecent(state.recent, r.recent);
  if (Array.isArray(r.searchHistory) && !(state.searchHistory || []).length) state.searchHistory = r.searchHistory;
  if (r.settings && typeof r.settings === "object") state.settings = Object.assign({}, state.settings, r.settings);
  if (!state.accountName && r.accountName) state.accountName = r.accountName;
  if (!state.accountAvatar && r.accountAvatar) state.accountAvatar = r.accountAvatar;
  if (r.playlistFlags) state.playlistFlags = Object.assign({}, r.playlistFlags, state.playlistFlags || {});
  if (r.sharedImports) state.sharedImports = Object.assign({}, r.sharedImports, state.sharedImports || {});
  const now = Date.now();
  SYNC_KEYS.forEach((k) => { state.syncTs[k] = now; syncSnap[k] = snapOf(k); });
}
function applyRemote(res) {
  let changed = false;
  const shared = res.shared || {}, ts = res.ts || {};
  SYNC_KEYS.forEach((k) => {
    if (!(k in shared)) return;
    if (k === "recent" && Array.isArray(shared.recent)) {
      // the history of both devices: united. If this one had plays the account lacks, it goes back up.
      const merged = mergeRecent(state.recent, shared.recent);
      const same = JSON.stringify(merged.map((t) => t.id)) === JSON.stringify(shared.recent.map((t) => t.id));
      if (JSON.stringify(merged) !== JSON.stringify(state.recent)) { state.recent = merged; syncSnap.recent = snapOf("recent"); changed = true; }
      state.syncTs.recent = same ? Math.max(ts.recent || 0, state.syncTs.recent || 0) : Date.now();
      if (!same) setTimeout(() => scheduleSync(1500), 0);
      return;
    }
    if ((ts[k] || 0) > (state.syncTs[k] || 0)) {
      state[k] = shared[k];
      state.syncTs[k] = ts[k];
      syncSnap[k] = snapOf(k);
      changed = true;
    }
  });
  // the other devices' stats
  let other = null;
  Object.entries(res.devices || {}).forEach(([id, d]) => {
    if (id === syncDeviceId || !d || !d.listens) return;
    other = other ? mergeListens(other, d.listens) : mergeListens({}, d.listens);
  });
  const hadOther = !!state.remoteListens;
  state.remoteListens = other;
  listensRev++;
  persist(true);
  return changed || (!!other !== hadOther);
}
async function syncNow() {
  if (!syncOn() || Date.now() < syncDeadAt) return;
  if (syncBusy) { syncAgain = true; return; }
  syncBusy = true;
  try {
    let joined = false;
    try { joined = localStorage.getItem(SYNC_JOINED_KEY) === "1"; } catch (e) { /* treated as joined: no union */ joined = true; }
    if (!joined) {
      const remote = await postSync({ shared: {}, ts: {}, device: { id: syncDeviceId, listens: state.listens } });
      unionIntoLocal(remote);
      try { localStorage.setItem(SYNC_JOINED_KEY, "1"); } catch (e) { /* once more next time */ }
    }
    stampChanges();
    const shared = {}, ts = {};
    SYNC_KEYS.forEach((k) => { shared[k] = state[k] === undefined ? null : state[k]; ts[k] = state.syncTs[k] || 0; });
    const reset = !!state.listensResetPending;
    const res = await postSync({ shared, ts, device: { id: syncDeviceId, listens: state.listens }, clear_listens: reset });
    if (reset) state.listensResetPending = false;
    syncLastAt = Date.now();
    setSyncStatus("ok");
    if (applyRemote(res)) {
      if (typeof refreshCurrentScreen === "function") refreshCurrentScreen();
      if (typeof renderLibrary === "function") renderLibrary();
      if (typeof renderSidebar === "function" && document.body.classList.contains("is-desktop")) renderSidebar();
    }
  } catch (e) {
    // offline or the server is busy: the next change or the next visit tries again
    setSyncStatus((e && e.syncCode) || "net");
  } finally {
    syncBusy = false;
    if (syncAgain) { syncAgain = false; scheduleSync(2000); }
  }
}
if (syncOn()) {
  setTimeout(syncNow, 1200);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") { if (Date.now() - syncLastAt > 20000) syncNow(); }
    else syncNow();
  });
  setInterval(() => { if (document.visibilityState === "visible" && Date.now() - syncLastAt > 90000) syncNow(); }, 30000);
}

