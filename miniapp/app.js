(() => {
  const API_BASE_URL =
    window.NOTKA_CONFIG && window.NOTKA_CONFIG.API_BASE_URL !== undefined
      ? window.NOTKA_CONFIG.API_BASE_URL
      : "http://localhost:8080";
  const STORAGE_KEY = "notka_state_v2";
  const playerCassette = document.querySelector(".player-art-wrap .cassette");
  const BG_COLOR = "#1A0B16";

  // ============================================================
  // Telegram WebApp integration (safe no-op outside Telegram)
  // ============================================================
  const tg = window.Telegram && window.Telegram.WebApp;
  const tgAtLeast = (v) => !!(tg && tg.isVersionAtLeast && tg.isVersionAtLeast(v));
  if (tg) {
    try {
      tg.ready();
      tg.expand();
      if (tgAtLeast("6.1")) {
        tg.setHeaderColor(BG_COLOR);
        tg.setBackgroundColor(BG_COLOR);
      }
      if (tgAtLeast("7.10") && tg.setBottomBarColor) tg.setBottomBarColor(BG_COLOR);
      // A downward drag inside a long list must scroll the list, not
      // collapse the whole Mini App (and the music with it).
      if (tgAtLeast("7.7") && tg.disableVerticalSwipes) tg.disableVerticalSwipes();
    } catch (e) {
      console.warn("Telegram WebApp init failed", e);
    }
  }
  // On a computer Telegram opens a Mini App in a small window; ask for the
  // whole screen (Bot API 8.0). Older clients just keep the window, which
  // the layout handles too.
  // On a computer the Mini App opens on the whole screen. That mode has no
  // window buttons and covers the Windows taskbar, so it is made livable:
  //  - the side panel has «свернуть в окно» and «закрыть», Esc and F11 too;
  //  - when the window loses focus (Alt+Tab, the Win key, another program)
  //    it steps back to a window by itself, so the taskbar and other
  //    programs are reachable, and widens again when focus is back;
  //  - leaving it by the button is remembered: then it stays a window.
  const MOBILE_OR_WEB = ["android", "android_x", "ios", "weba", "webk"];
  const onComputerClient = !!(tg && tg.platform && !MOBILE_OR_WEB.includes(tg.platform));
  const canFullscreen = !!(onComputerClient && tgAtLeast("8.0") && tg.requestFullscreen && tg.exitFullscreen);
  const FULLSCREEN_KEY = "notka_fullscreen_v2";
  let wantFullscreen = true;
  try { wantFullscreen = localStorage.getItem(FULLSCREEN_KEY) !== "0"; } catch (e) { /* storage may be blocked */ }
  let steppedBack = false; // we left fullscreen only because focus went elsewhere
  let fullscreenFailed = false;
  let lastFullscreenAt = Date.now(); // the window itself blinks focus while it changes mode
  let enterTries = 0;
  function enterFullscreen() {
    if (!canFullscreen || fullscreenFailed || tg.isFullscreen) return;
    lastFullscreenAt = Date.now();
    enterTries++;
    try { tg.requestFullscreen(); } catch (e) { fullscreenFailed = true; }
  }
  function setFullscreen(on) {
    if (!canFullscreen) return;
    wantFullscreen = on;
    steppedBack = false;
    lastFullscreenAt = Date.now();
    try { localStorage.setItem(FULLSCREEN_KEY, on ? "1" : "0"); } catch (e) { /* ignore */ }
    try { on ? tg.requestFullscreen() : tg.exitFullscreen(); } catch (e) { /* ignore */ }
  }
  if (canFullscreen) {
    if (wantFullscreen) {
      enterFullscreen();
      // a client may not have been ready the first time, or wants a touch first
      setTimeout(() => { if (wantFullscreen && !tg.isFullscreen && enterTries < 3) enterFullscreen(); }, 1200);
      window.addEventListener("pointerdown", function once() {
        window.removeEventListener("pointerdown", once, true);
        if (wantFullscreen && !tg.isFullscreen && !steppedBack) enterFullscreen();
      }, true);
    }
    if (tg.onEvent) tg.onEvent("fullscreenFailed", () => { fullscreenFailed = true; });
    if (tg.onEvent) tg.onEvent("fullscreenChanged", () => { lastFullscreenAt = Date.now(); });
    let blurTimer = 0;
    window.addEventListener("blur", () => {
      clearTimeout(blurTimer);
      blurTimer = setTimeout(() => {
        if (document.hasFocus() || !wantFullscreen || !tg.isFullscreen) return;
        if (Date.now() - lastFullscreenAt < 2500) return; // that was the mode change, not the listener leaving
        steppedBack = true;
        lastFullscreenAt = Date.now();
        try { tg.exitFullscreen(); } catch (e) { /* ignore */ }
      }, 300);
    });
    window.addEventListener("focus", () => {
      clearTimeout(blurTimer);
      if (steppedBack && wantFullscreen) { steppedBack = false; enterFullscreen(); }
    });
  } else if (onComputerClient && tg.requestFullscreen === undefined) {
    // an old Telegram on a computer: say so once instead of silently staying small
    window.addEventListener("load", () => {
      let told = false;
      try { told = localStorage.getItem("notka_fs_told") === "1"; localStorage.setItem("notka_fs_told", "1"); } catch (e) { /* ignore */ }
      if (!told) setTimeout(() => showToast("Полный экран работает в новом Telegram. Обнови Telegram Desktop"), 2500);
    });
  }
  // Окно Нотки на компьютере не в фокусе (игра, браузер, другая программа): через 4 секунды замораживаем
  // фоновый свет и анимации, чтобы музыка в фоне не отбирала кадры у соседних программ. Вернулся мышью
  // или фокусом: всё оживает сразу. Звук и ход трека не затрагиваются.
  if (onComputerClient) {
    const root = document.documentElement;
    let idleTimer = 0;
    const setIdle = (on) => {
      if (root.classList.contains("app-idle") === on) return;
      root.classList.toggle("app-idle", on);
      document.dispatchEvent(new CustomEvent("notka:idle", { detail: { idle: on } }));
    };
    const arm = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => { if (!document.hasFocus()) setIdle(true); }, 4000); };
    window.addEventListener("blur", arm);
    window.addEventListener("focus", () => { clearTimeout(idleTimer); setIdle(false); });
    document.addEventListener("pointermove", () => { if (root.classList.contains("app-idle")) { setIdle(false); arm(); } }, { passive: true });
  }
  // who is listening: Telegram's own object, and when a client leaves it empty, the same
  // thing read from the launch parameters in the address (initData carries the user too)
  const tgUser = (() => {
    const direct = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
    if (direct) return direct;
    try {
      const fromData = (raw) => { const u = new URLSearchParams(raw || "").get("user"); return u ? JSON.parse(u) : null; };
      const hash = new URLSearchParams(window.location.hash.slice(1)).get("tgWebAppData");
      return fromData(tg && tg.initData) || fromData(hash) || null;
    } catch (e) { return null; }
  })();
  const hasTgBack = !!(tg && tg.BackButton && tgAtLeast("6.1"));
  if (hasTgBack) document.body.classList.add("tg-back");

  function haptic(kind) {
    if (!tg || !tg.HapticFeedback || !tgAtLeast("6.1")) return;
    try {
      if (kind === "success" || kind === "error" || kind === "warning") tg.HapticFeedback.notificationOccurred(kind);
      else if (kind === "select") tg.HapticFeedback.selectionChanged();
      else tg.HapticFeedback.impactOccurred(kind || "light");
    } catch (e) { /* haptics are a nicety */ }
  }

  // слабые телефоны: сами замеряем плавность и при тормозах выключаем дорогое размытие фона.
  // Режим хранится на устройстве: "auto" (по замеру), "lite" (включён вручную), "full" (выключен вручную).
  function perfGuard() {
    const root = document.documentElement;
    const KEY = "notka_perf";
    const MODE_KEY = "notka_perf_mode";
    const read = (k) => { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } };
    const write = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage may be blocked */ } };
    let mode = read(MODE_KEY) || "auto";
    if (mode === "lite" || (mode === "auto" && read(KEY) === "lite")) root.classList.add("perf-lite");
    let probing = false;
    let tries = 0;
    function probe() {
      if (mode !== "auto" || probing || root.classList.contains("perf-lite") || tries >= 3) return;
      if (document.hidden) { setTimeout(probe, 4000); return; }
      probing = true;
      tries += 1;
      const dts = [];
      let last = 0;
      const tick = (t) => {
        // кадр после паузы вкладки (или свёрнутого окна) не считаем: он не про тормоза
        if (last && t - last < 250) dts.push(t - last);
        last = t;
        if (dts.length < 60) { requestAnimationFrame(tick); return; }
        probing = false;
        dts.sort((a, b) => a - b);
        // медиана дольше 26 мс: меньше ~38 кадров в секунду
        if (dts[dts.length >> 1] > 26) {
          root.classList.add("perf-lite");
          write(KEY, "lite");
          document.dispatchEvent(new CustomEvent("notka:perf", { detail: { lite: true, auto: true } }));
        } else if (tries < 3) {
          setTimeout(probe, 15000); // повторный замер уже под нагрузкой (плеер, список, свет)
        }
      };
      requestAnimationFrame(tick);
    }
    setTimeout(probe, 3000);
    probe.isLite = () => root.classList.contains("perf-lite");
    probe.mode = () => mode;
    probe.set = (lite) => {
      mode = lite ? "lite" : "full";
      write(MODE_KEY, mode);
      write(KEY, lite ? "lite" : "");
      root.classList.toggle("perf-lite", !!lite);
    };
    return probe;
  }
  const perfProbe = perfGuard();

  // --- keyboard-safe viewport height ---
  // 100dvh doesn't reliably shrink when Telegram's in-app WebView opens the
  // on-screen keyboard (it's meant to track the *browser chrome*, not a
  // software keyboard sitting on top of the page), which left inputs like
  // the search box covered. Telegram's own tg.viewportHeight does track the
  // keyboard, so we mirror it into a --tg-vh custom property (the classic
  // "1% of real viewport height" trick) and let the CSS in styles.css use
  // calc(var(--tg-vh, 1dvh) * 100) instead of a bare 100dvh.
  function applyTgViewportHeight() {
    const h = tg && tg.viewportHeight ? tg.viewportHeight : window.innerHeight;
    document.documentElement.style.setProperty("--tg-vh", `${h / 100}px`);
  }
  applyTgViewportHeight();
  if (tg && tg.onEvent) tg.onEvent("viewportChanged", applyTgViewportHeight);
  window.addEventListener("resize", applyTgViewportHeight);

  // --- safe areas (Telegram fullscreen mode reports its own insets) ---
  function applySafeAreas() {
    if (!tg || !tg.safeAreaInset) return;
    const s = tg.safeAreaInset || {};
    const c = tg.contentSafeAreaInset || {};
    const top = (s.top || 0) + (c.top || 0);
    const bottom = (s.bottom || 0) + (c.bottom || 0);
    const root = document.documentElement.style;
    if (top) root.setProperty("--sat", `${top}px`);
    if (bottom) root.setProperty("--sab", `${bottom}px`);
    // Some Android phones (Samsung One UI) let the web view run under the system navigation bar and report no inset:
    // the view is then as tall as the whole screen, so keep the dock clear of the bar by hand.
    if (!bottom && tg.platform === "android") {
      const full = window.screen && window.screen.height && window.innerHeight >= window.screen.height - 1;
      if (full) root.setProperty("--sab", "24px");
    }
  }
  applySafeAreas();
  window.addEventListener("resize", applySafeAreas);
  if (tg && tg.onEvent) {
    tg.onEvent("safeAreaChanged", applySafeAreas);
    tg.onEvent("contentSafeAreaChanged", applySafeAreas);
  }

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
  const state = loadState();
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
  let storageFullWarned = false;
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

  // ============================================================
  // ONE ACCOUNT, ALL DEVICES. Inside Telegram the favourites, playlists,
  // settings and listening stats also live on the server under the user's
  // Telegram account, so the phone and the computer show the same.
  //  - the ordinary keys: each has its own time of last change, the newer wins
  //    (the first time a device joins, the lists are united, nothing is lost);
  //  - the stats add up: every device keeps its own counter, the whole is the sum.
  // ============================================================
  const SYNC_KEYS = ["favorites", "playlists", "settings", "followedArtists", "followedMeta", "playlistFlags", "accountName", "accountAvatar", "recent", "sharedImports", "onboardingSeenV2", "searchHistory"];
  const SYNC_JOINED_KEY = "notka_sync_joined_v1";
  const syncSnap = {};
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
  const syncDeviceId = (() => {
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

  let listensRev = 0, listensViewRev = -1, listensViewCache = null;
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
  const tgInitRaw = (() => {
    try {
      return (tg && tg.initData) || new URLSearchParams(window.location.hash.slice(1)).get("tgWebAppData") || "";
    } catch (e) { return ""; }
  })();
  const syncOn = () => !!tgInitRaw;
  // what the sync is doing, for the account screen: idle | ok | auth | big | net
  let syncStatus = { code: "idle", at: 0 };
  function setSyncStatus(code) {
    syncStatus = { code, at: Date.now() };
    try { if (typeof currentScreen !== "undefined" && currentScreen === "account") renderAccountScreen(); } catch (e) { /* not drawn yet */ }
  }
  let syncBusy = false, syncAgain = false, syncTimer = 0, syncDeadAt = 0, syncLastAt = 0;
  function scheduleSync(ms) {
    if (!syncOn() || Date.now() < syncDeadAt) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncNow, ms || 12000);
  }
  async function postSync(payload) {
    const res = await fetch(`${API_BASE_URL}/sync`, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Telegram-Init-Data": tgInitRaw },
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

  // ---- small product events: which searches find nothing, what is skipped, what fails ----
  // They go to the server in batches, tied to a keyed hash and not to a name, and the switch
  // in «Аккаунт» turns them off. Only the names of things, never the text of anything private.
  const eventQueue = [];
  let eventsFlushing = false;
  function track(name, props) {
    try {
      if (state.settings.analyticsOff || !tgInitRaw) return;
      eventQueue.push({ e: name, t: Date.now(), p: props || {} });
      if (eventQueue.length >= 25) flushEvents();
    } catch (e) { /* never in the way */ }
  }
  // the same call under a name no local variable takes: playTrack(track, …) hides «track», and its
  // error branch (retry, other version, next track) used to die on «track is not a function»
  const sendEvent = (name, props) => track(name, props);
  async function flushEvents() {
    if (eventsFlushing || !eventQueue.length || !tgInitRaw || state.settings.analyticsOff) return;
    eventsFlushing = true;
    const batch = eventQueue.splice(0, 50);
    try {
      const res = await fetch(`${API_BASE_URL}/analytics`, {
        method: "POST",
        headers: { "content-type": "application/json", "X-Telegram-Init-Data": tgInitRaw },
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

  const Store = {
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
    addTrackToPlaylist(playlistId, track, toStart) {
      eventNote("playlist", 1);
      const playlist = state.playlists.find((p) => p.id === playlistId);
      if (!playlist) return;
      if (!playlist.trackIds.includes(track.id)) {
        if (toStart) playlist.trackIds.unshift(track.id); else playlist.trackIds.push(track.id);
      }
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

  // ============================================================
  // Custom avatar/cover picker — lets the person set their own photo
  // (from the device's gallery/camera via Telegram's file picker) as a
  // profile or playlist avatar. Images are downscaled + re-encoded to a
  // small JPEG before being stored, so a multi-megapixel phone photo
  // doesn't blow up localStorage (which has a small quota).
  // ============================================================
  function resizeImageFile(file, maxSize) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("Не удалось прочитать изображение"));
        img.onload = () => {
          const side = Math.min(img.width, img.height);
          const sx = (img.width - side) / 2;
          const sy = (img.height - side) / 2;
          const size = Math.min(maxSize, side);
          const canvas = document.createElement("canvas");
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  const avatarFileInput = document.getElementById("avatar-file-input");
  let avatarPickResolve = null;
  if (avatarFileInput) {
    avatarFileInput.addEventListener("change", async () => {
      const file = avatarFileInput.files && avatarFileInput.files[0];
      avatarFileInput.value = "";
      if (!file || !avatarPickResolve) return;
      const resolve = avatarPickResolve;
      avatarPickResolve = null;
      try {
        resolve(await resizeImageFile(file, 480));
      } catch (e) {
        console.error(e);
        showToast("Не удалось загрузить фото");
        resolve(null);
      }
    });
  }
  function pickAvatarImage() {
    return new Promise((resolve) => {
      if (!avatarFileInput) { resolve(null); return; }
      avatarPickResolve = resolve;
      avatarFileInput.click();
    });
  }

  // ============================================================
  // Helpers
  // ============================================================
  const $ = (id) => document.getElementById(id);

  function hashString(str) {
    let h = 0;
    const s = String(str || "");
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  // Covers without artwork get a small piece of the light, tinted by
  // the item's name so neighbouring rows don't all look identical.
  // The colours are the light's variables, not fixed values, so such a cover
  // follows the theme and the playing track's light; the name only moves the
  // highlight around.
  function fallbackCover(seed) {
    const n = hashString(seed);
    const x = 22 + (n % 5) * 14;
    const y = 20 + (Math.floor(n / 5) % 4) * 12;
    return `radial-gradient(circle at ${x}% ${y}%, var(--c-core) 0 8%, var(--c-warm) 36%, var(--c-mid) 64%, var(--c-deep) 100%)`;
  }

  function setCoverEl(el, url, seed) {
    if (!el) return;
    el.innerHTML = "";
    el.style.background = "";
    if (url) {
      const img = document.createElement("img");
      img.src = url;
      img.alt = "";
      img.loading = "lazy";
      img.onerror = () => { img.remove(); el.style.background = fallbackCover(seed); };
      el.appendChild(img);
    } else {
      el.style.background = fallbackCover(seed);
    }
  }

  // opts.action / opts.onAction add a button to the toast (an undo)
  function showToast(text, opts) {
    opts = opts || {};
    const toast = $("toast");
    toast.textContent = text;
    toast.classList.toggle("has-action", !!opts.action);
    if (opts.action) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "toast-action";
      btn.textContent = opts.action;
      btn.addEventListener("click", () => {
        toast.classList.remove("show");
        if (opts.onAction) opts.onAction();
      });
      toast.appendChild(btn);
    }
    toast.classList.add("show");
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => toast.classList.remove("show"), opts.action ? 6000 : 2400);
  }

  function pluralTracks(n) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return `${n} трек`;
    if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return `${n} трека`;
    return `${n} треков`;
  }

  function formatDuration(seconds) {
    if (!seconds && seconds !== 0) return "";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function shuffled(list) {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function icon(name, size) {
    const s = size || 22;
    return `<svg width="${s}" height="${s}" aria-hidden="true"><use href="#${name}"/></svg>`;
  }

  // ============================================================
  // THE LIGHT — painted with the playing track's own palette.
  // Up to three distinct colors are pulled from the artwork and
  // spread over the orb's layers; a grey or b/w cover gives a
  // silvery light, a neon one a neon light. The artwork itself also
  // lies under the light, heavily blurred, so the whole screen
  // carries the cover's mood.
  // ============================================================
  const paletteCache = new Map();
  const lightArt = $("light-art");
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // Larger artwork for big surfaces: YouTube Music thumbnails come as
  // 120px ("=w120-h120-…"); the same URL serves any size.
  function hiResArtwork(url) {
    if (!url) return url;
    if (/googleusercontent\.com|ggpht\.com/.test(url)) return url.replace(/=w\d+-h\d+/, "=w544-h544");
    return url;
  }

  function rgbToHsl(r, g, b) {
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (d === 0) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    let h;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return [(h * 60 + 360) % 360, s, l];
  }
  const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  const hsl = (h, s, l) => `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;

  function paletteFromPixels(data) {
    const BINS = 18;
    const bins = Array.from({ length: BINS }, () => ({ w: 0, x: 0, y: 0, s: 0, l: 0 }));
    const vbins = Array.from({ length: BINS }, () => ({ w: 0, x: 0, y: 0, s: 0, l: 0 }));
    // by area: what actually fills the cover (a small loud accent does not decide the mood)
    const abins = Array.from({ length: BINS }, () => ({ w: 0, x: 0, y: 0, s: 0, l: 0 }));
    let total = 0, chroma = 0, vivid = 0, gx = 0, gy = 0, sumL = 0;
    const lights = [];
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      const [h, s, l] = rgbToHsl(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255);
      total++;
      sumL += l;
      lights.push([h, s, l]);
      if (s < 0.2 || l < 0.1 || l > 0.92) continue;
      chroma++;
      {
        const wa = (s + 0.2) * Math.sqrt(1 - Math.abs(2 * l - 1));
        const ab = abins[Math.floor(h / (360 / BINS)) % BINS];
        const ra = (h * Math.PI) / 180;
        ab.w += wa; ab.x += Math.cos(ra) * wa; ab.y += Math.sin(ra) * wa; ab.s += s * wa; ab.l += l * wa;
      }
      // saturation squared: a small vivid accent beats a large muted area
      const w = s * s * Math.sqrt(1 - Math.abs(2 * l - 1));
      const bi = Math.floor(h / (360 / BINS)) % BINS;
      const b = bins[bi];
      const rad = (h * Math.PI) / 180;
      b.w += w; b.x += Math.cos(rad) * w; b.y += Math.sin(rad) * w; b.s += s * w; b.l += l * w;
      if (s > 0.45 && l > 0.18 && l < 0.82) {
        vivid++;
        const v = vbins[bi];
        v.w += w; v.x += Math.cos(rad) * w; v.y += Math.sin(rad) * w; v.s += s * w; v.l += l * w;
      }
      gx += Math.cos(rad) * w; gy += Math.sin(rad) * w;
    }
    if (!total) return null;
    const avgL = lights.reduce((a, p) => a + p[2], 0) / total;

    // Mostly black-and-white artwork with one strong accent: the accent
    // leads, the darks stay dark.
    if (chroma / total < 0.08 && vivid / total >= 0.015) {
      const v = vbins.filter((b) => b.w > 0).sort((a, b) => b.w - a.w)[0];
      const h = (Math.atan2(v.y, v.x) * 180 / Math.PI + 360) % 360;
      const s = v.s / v.w, l = v.l / v.w;
      // softened: a cover's loudest colour is calmed, not copied
      return {
        core: hsl(h, clamp(s * 0.6, 0.34, 0.55), 0.88),
        warm: hsl(h, clamp(s * 0.74, 0.4, 0.62), clamp(l, 0.54, 0.64)),
        mid: hsl(h, clamp(s * 0.68, 0.34, 0.56), 0.42),
        deep: hsl(h, 0.3, 0.22),
      };
    }

    // Mostly grey / black-and-white artwork: a silvery light in its tone.
    if (chroma / total < 0.08) {
      const h = gx || gy ? (Math.atan2(gy, gx) * 180 / Math.PI + 360) % 360 : 260;
      return {
        core: hsl(h, 0.22, 0.92),
        warm: hsl(h, 0.12, clamp(avgL + 0.2, 0.55, 0.72)),
        mid: hsl(h, 0.1, clamp(avgL, 0.4, 0.55)),
        deep: hsl(h, 0.16, 0.28),
      };
    }

    const colors = abins
      .filter((b) => b.w > 0)
      .map((b) => ({ w: b.w, h: (Math.atan2(b.y, b.x) * 180 / Math.PI + 360) % 360, s: b.s / b.w, l: b.l / b.w }))
      .sort((a, b) => b.w - a.w);
    const picks = [colors[0]];
    for (const c of colors) {
      if (picks.length >= 3) break;
      if (c.w < colors[0].w * 0.12) break;
      if (picks.every((p) => hueDist(p.h, c.h) >= 30)) picks.push(c);
    }
    const [a, b = { ...a, h: (a.h + 24) % 360, s: a.s * 0.9 }, c3] = picks;
    // the darkest chromatic tones of the cover become the deep layer
    const darks = lights.filter((p) => p[1] > 0.15 && p[2] < 0.45).sort((p, q) => p[2] - q[2]).slice(0, Math.max(6, Math.floor(total * 0.15)));
    let deepH = c3 ? c3.h : b.h, deepS = c3 ? c3.s : b.s;
    if (darks.length >= 6) {
      let dx = 0, dy = 0, ds = 0;
      darks.forEach((p) => { const r = (p[0] * Math.PI) / 180; dx += Math.cos(r); dy += Math.sin(r); ds += p[1]; });
      deepH = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
      deepS = ds / darks.length;
    }
    // the vibe: how light the cover is as a whole, and how colourful. A dark, moody cover gives
    // a deep, quiet light; a light, airy one a light and gentle light; a loud one is calmed.
    const tone = clamp(sumL / total, 0.16, 0.8);
    const vivid2 = clamp(a.s, 0.2, 1);
    const calm = vivid2 > 0.75 ? 0.72 : vivid2 > 0.5 ? 0.8 : 0.9; // the louder the cover, the more it is calmed
    const warmL = clamp(0.5 + (tone - 0.5) * 0.75, 0.45, 0.68);
    return {
      core: hsl(a.h, clamp(a.s * 0.55, 0.26, 0.5), clamp(0.77 + tone * 0.17, 0.8, 0.92)),
      warm: hsl(a.h, clamp(a.s * calm, 0.26, 0.62), warmL),
      mid: hsl(b.h, clamp(b.s * calm * 0.95, 0.24, 0.58), clamp(warmL - 0.1, 0.36, 0.56)),
      deep: hsl(deepH, clamp(deepS * 0.78, 0.24, 0.56), clamp(0.13 + tone * 0.28, 0.16, 0.34)),
    };
  }

  function paletteFromArtwork(url) {
    if (!url) return Promise.resolve(null);
    if (paletteCache.has(url)) return Promise.resolve(paletteCache.get(url));
    return new Promise((resolve) => {
      const img = new Image();
      let done = false;
      const finish = (val, remember) => { if (done) return; done = true; if (remember) paletteCache.set(url, val); resolve(val); };
      const timer = setTimeout(() => finish(null, false), 6000);
      img.crossOrigin = "anonymous";
      img.onload = () => {
        clearTimeout(timer);
        try {
          const size = 32;
          const canvas = document.createElement("canvas");
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(img, 0, 0, size, size);
          finish(paletteFromPixels(ctx.getImageData(0, 0, size, size).data), true);
        } catch (e) {
          finish(null, true); // cross-origin artwork without CORS headers — retrying won't help
        }
      };
      img.onerror = () => { clearTimeout(timer); finish(null, false); };
      img.src = url;
    });
  }

  function applyPalette(p) {
    // on :root so the dock's glass picks up the same colors as the light
    const s = document.documentElement.style;
    s.setProperty("--c-core", p.core);
    s.setProperty("--c-warm", p.warm);
    s.setProperty("--c-mid", p.mid);
    s.setProperty("--c-deep", p.deep);
    prismPalette = p;
    if (prism) prism.setGradient([p.deep, p.mid, p.warm, p.core]);
    paintGround(p.deep);
  }
  // the lowest layer: the light's deep colour darkened (the same mix as the style sheet's), also for
  // the strips Telegram draws around the app and the browser's bar
  let groundPainted = "";
  let groundProbe = null;
  function paintGround(deep) {
    let color;
    const root = document.documentElement;
    if (root.classList.contains("minimal")) color = "#121212";
    else if (document.body.dataset.atmo && document.body.dataset.atmo !== "none") color = getComputedStyle(document.body).getPropertyValue("--bg").trim() || BG_COLOR;
    else {
      // any CSS colour (the cover's palette is "hsl(...)"): the browser turns it into rgb()
      if (!groundProbe) { groundProbe = document.createElement("i"); groundProbe.style.display = "none"; document.body.appendChild(groundProbe); }
      groundProbe.style.color = "";
      groundProbe.style.color = String(deep);
      const m = getComputedStyle(groundProbe).color.match(/[\d.]+/g);
      if (!m || m.length < 3) return;
      const base = [10, 7, 9];
      color = "#" + [0, 1, 2].map((k) => Math.round(+m[k] * 0.3 + base[k] * 0.7).toString(16).padStart(2, "0")).join("");
    }
    if (color === groundPainted) return;
    groundPainted = color;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", color);
    if (!tg) return;
    try {
      if (tgAtLeast("6.1")) { tg.setHeaderColor(color); tg.setBackgroundColor(color); }
      if (tgAtLeast("7.10") && tg.setBottomBarColor) tg.setBottomBarColor(color);
    } catch (e) { /* the colours of Telegram's own strips are a nicety */ }
  }

  // ---- rays in the player (PrismaticBurst port) ----
  let prism = null;
  let prismUnavailable = false;
  let prismPalette = null;
  function ensurePrism() {
    if (prism || prismUnavailable || !window.Prism) return prism;
    prism = window.Prism.create($("player-prism"), { intensity: 0.75, speed: 0.3, animationType: "rotate3d", scale: 0.4 });
    if (!prism) { prismUnavailable = true; return null; }
    prism.onGiveUp = () => { prism = null; prismUnavailable = true; $("player-prism").classList.remove("is-on"); };
    const cs = getComputedStyle(document.documentElement);
    const p = prismPalette || { deep: cs.getPropertyValue("--c-deep").trim(), mid: cs.getPropertyValue("--c-mid").trim(), warm: cs.getPropertyValue("--c-warm").trim(), core: cs.getPropertyValue("--c-core").trim() };
    prism.setGradient([p.deep, p.mid, p.warm, p.core]);
    return prism;
  }
  function placePrism() {
    if (!prism) return;
    const canvas = $("player-prism").getBoundingClientRect();
    const art = $("player-art").getBoundingClientRect();
    const x = art.left + art.width / 2 - canvas.left;
    const y = art.top + art.height / 2 - canvas.top;
    prism.setOrigin(x, y);
    const el = $("player-prism");
    el.style.setProperty("--px", `${x}px`);
    el.style.setProperty("--py", `${y}px`);
    el.style.setProperty("--pr", `${Math.max(art.width, art.height) / 2 + 24}px`);
  }
  function syncPrism() {
    // the rays burst from behind the cover — with the lyrics open there is no cover
    // …and only the standard player has the square cover they are drawn around
    const on = currentScreen === "player" && document.body.classList.contains("is-playing") && !document.body.classList.contains("lyrics-open")
      && (document.body.dataset.playerTheme || "standard") === "standard" && !isMinimal();
    if (on) {
      if (!ensurePrism()) return;
      requestAnimationFrame(placePrism);
      prism.start();
      $("player-prism").classList.add("is-on");
    } else if (prism) {
      prism.stop();
      $("player-prism").classList.remove("is-on");
    }
  }
  window.addEventListener("resize", () => requestAnimationFrame(placePrism));

  // the warm brand hues a cover without usable colours is given (the constant was lost in a move, and the function threw)
  const BRAND_HUES = [14, 24, 34, 336, 348, 6, 318];
  function brandPaletteFor(seed) {
    const h = BRAND_HUES[hashString(seed) % BRAND_HUES.length];
    return { core: hsl(h, 0.9, 0.9), warm: hsl(h, 0.76, 0.62), mid: hsl((h + 340) % 360, 0.5, 0.52), deep: "#44112F" };
  }

  // The cover under the light is only ever seen as a haze. A big picture blurred by 72px
  // is what made weak phones freeze for seconds on every track change, so the cover is
  // shrunk to a dozen pixels first and the browser stretches that — the same haze,
  // for almost nothing. If the picture can't be read (no CORS), the old way is the fallback.
  const tinyArtCache = new Map();
  function tinyArt(url) {
    if (tinyArtCache.has(url)) return Promise.resolve(tinyArtCache.get(url));
    return new Promise((resolve) => {
      const img = new Image();
      let done = false;
      const finish = (val) => {
        if (done) return;
        done = true;
        if (val) {
          if (tinyArtCache.size > 40) tinyArtCache.delete(tinyArtCache.keys().next().value);
          tinyArtCache.set(url, val);
        }
        resolve(val);
      };
      const timer = setTimeout(() => finish(null), 6000);
      img.crossOrigin = "anonymous";
      img.onload = () => {
        clearTimeout(timer);
        try {
          // two steps down (not one) so the small picture is an average, not a few sharp samples
          const step = document.createElement("canvas");
          step.width = step.height = 96;
          step.getContext("2d").drawImage(img, 0, 0, 96, 96);
          const tiny = document.createElement("canvas");
          tiny.width = tiny.height = 12;
          tiny.getContext("2d").drawImage(step, 0, 0, 12, 12);
          finish(tiny.toDataURL("image/jpeg", 0.72));
        } catch (e) {
          finish(null);
        }
      };
      img.onerror = () => { clearTimeout(timer); finish(null); };
      img.src = url;
    });
  }

  let artUrlShown = null;
  function showArtUnderLight(url) {
    if (!lightArt || url === artUrlShown) return;
    artUrlShown = url;
    document.body.classList.toggle("has-art", !!url);
    lightArt.classList.remove("is-shown");
    setTimeout(async () => {
      if (artUrlShown !== url) return;
      if (!url) { lightArt.style.backgroundImage = ""; return; }
      const tiny = await tinyArt(url);
      if (artUrlShown !== url) return;
      lightArt.classList.toggle("is-raw", !tiny);
      lightArt.style.backgroundImage = `url("${(tiny || url).replace(/"/g, "%22")}")`;
      requestAnimationFrame(() => lightArt.classList.add("is-shown"));
    }, 450);
  }

  // What the playing track gives the light. «Оформление» can put a chosen
  // palette or one pinned cover in its place (see paintLight).
  const DEFAULT_PALETTE = { core: "#FFE9DF", warm: "#FFA6B8", mid: "#FF4FA0", deep: "#44112F" };
  let trackLight = { palette: null, art: null };

  async function lightForTrack(track) {
    trackLight = { palette: trackLight.palette, art: track.artwork ? hiResArtwork(track.artwork) : null };
    paintLight();
    let palette = await paletteFromArtwork(track.artwork);
    if (!palette && track.artwork && !paletteCache.has(track.artwork)) {
      await new Promise((r) => setTimeout(r, 1200));
      palette = await paletteFromArtwork(track.artwork); // one more try on a flaky network
    }
    if (!currentTrack || currentTrack.id !== track.id) return;
    trackLight.palette = palette || brandPaletteFor(track.id);
    paintLight();
  }

  // ============================================================
  // Screens, navigation, dock
  // ============================================================
  const screens = {
    splash: $("screen-splash"),
    onboarding: $("screen-onboarding"),
    home: $("screen-home"),
    search: $("screen-search"),
    library: $("screen-library"),
    favorites: $("screen-favorites"),
    event: $("screen-event"),
    playlist: $("screen-playlist"),
    profile: $("screen-profile"),
    player: $("screen-player"),
    album: $("screen-album"),
    artist: $("screen-artist"),
    addTracks: $("screen-add-tracks"),
    editPlaylist: $("screen-edit-playlist"),
    account: $("screen-account"),
    sound: $("screen-sound"),
    about: $("screen-about"),
    plus: $("screen-plus"),
    look: $("screen-look"),
    mood: $("screen-mood"),
    stats: $("screen-stats"),
    recap: $("screen-recap"),
  };
  const bottomNav = $("bottom-nav");
  const miniPlayer = $("mini-player");
  const TAB_SCREENS = new Set(["home", "search", "library"]);
  const NO_MINI_SCREENS = new Set(["player", "onboarding", "splash", "plus"]);

  // Each step is { name, params }. Artist and album screens are single
  // DOM nodes reused for every artist/album, so going back has to know
  // which one that step was showing and bring it back.
  let navStack = [{ name: "home", params: null }];
  let currentScreen = "home";
  const shownParams = {};
  const REOPENERS = {
    artist: (p) => openArtistScreen(p.artistName, p.contextTracks, p.meta, true),
    album: (p) => (p.track ? openAlbumScreen(p.track, true) : openAlbumById(p.source, p.albumId, p.title, p.artist, true)),
  };

  // The side panel's own content (computer layout): the liked tracks,
  // playlists, followed artists, the profile, the fullscreen switch.
  function renderSidebar() {
    if (!$("side-extra")) return;
    $("side-fav-count").textContent = state.favorites.length ? String(state.favorites.length) : "";
    const item = (label, coverUrl, seed, round, onClick) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "side-item";
      const c = document.createElement("span");
      c.className = "cover side-cover" + (round ? " cover-round" : "");
      setCoverEl(c, coverUrl, seed);
      const n = document.createElement("span");
      n.className = "side-name";
      n.textContent = label;
      b.appendChild(c);
      b.appendChild(n);
      b.addEventListener("click", onClick);
      return b;
    };
    const pl = $("side-playlists");
    pl.innerHTML = "";
    $("side-pl-label").hidden = !state.playlists.length;
    state.playlists.forEach((p) => pl.appendChild(item(p.name, playlistCoverUrl(p), p.id, false, () => openPlaylist(p.id))));
    const fl = $("side-follows");
    fl.innerHTML = "";
    $("side-follow-label").hidden = !state.followedArtists.length;
    state.followedArtists.forEach((name) => {
      const meta = state.followedMeta[name] || {};
      fl.appendChild(item(name, meta.photo, name, true, () => openArtistScreen(name, [], { artistId: meta.artistId, source: meta.source })));
    });
    renderAvatarInto("side-avatar", "side-initial");
    $("side-name").textContent = displayName();
    $("side-fs-btn").hidden = !canFullscreen;
    $("side-fs-label").textContent = tg && tg.isFullscreen ? "Свернуть в окно · Esc" : "На весь экран · F11";
    $("side-close-btn").hidden = !canFullscreen;
  }
  $("side-fav-btn").addEventListener("click", () => { if (currentScreen !== "favorites") showScreen("favorites"); });
  $("side-profile-btn").addEventListener("click", () => { if (currentScreen !== "profile") showScreen("profile"); });
  $("side-fs-btn").addEventListener("click", () => setFullscreen(!(tg && tg.isFullscreen)));
  if (tg && tg.onEvent) tg.onEvent("fullscreenChanged", renderSidebar);
  document.addEventListener("keydown", (e) => {
    if (!canFullscreen) return;
    if (e.key === "Escape" && tg.isFullscreen && !openOverlays.length) setFullscreen(false);
    else if (e.key === "F11") { e.preventDefault(); setFullscreen(!tg.isFullscreen); }
  });
  $("side-close-btn").addEventListener("click", () => { try { tg.close(); } catch (e) { /* not in Telegram */ } });
  // один раз на компьютере: как развернуть Нотку на весь экран и вернуть обратно
  if (canFullscreen) {
    let told = false;
    try { told = localStorage.getItem("notka_fs_hint") === "1"; } catch (e) { /* ignore */ }
    if (!told) {
      setTimeout(() => {
        if (!isDesktop() || currentScreen === "splash") return;
        try { localStorage.setItem("notka_fs_hint", "1"); } catch (e) { /* ignore */ }
        if (tg.isFullscreen) { showToast("Esc или F11 сворачивают Нотку обратно в окно"); return; }
        showToast("F11 разворачивает Нотку на весь экран", { action: "Развернуть", onAction: () => setFullscreen(true) });
      }, 7000);
    }
  }

  // A wide window (Telegram Desktop, a browser) gets the computer layout:
  // the tabs become a side panel, the mini player a bar at the bottom.
  const DESKTOP_MIN_WIDTH = 900;
  const desktopQuery = window.matchMedia ? window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH}px)`) : null;
  const isDesktop = () => !!desktopQuery && desktopQuery.matches;
  function syncDesktop() { document.body.classList.toggle("is-desktop", isDesktop()); }
  syncDesktop();
  if (desktopQuery) {
    const onChange = () => { syncDesktop(); updateDock(); };
    if (desktopQuery.addEventListener) desktopQuery.addEventListener("change", onChange);
    else if (desktopQuery.addListener) desktopQuery.addListener(onChange);
  }

  function updateDock() {
    const desk = isDesktop();
    const showTabs = desk ? !["splash", "onboarding"].includes(currentScreen) : TAB_SCREENS.has(currentScreen);
    const showMini = !!currentTrack && !NO_MINI_SCREENS.has(currentScreen);
    if (desk) renderSidebar();
    bottomNav.hidden = !showTabs;
    miniPlayer.hidden = !showMini;
    if (bottomNav.hidden) bottomNav.style.animation = "";
    if (miniPlayer.hidden) miniPlayer.style.animation = "";
    document.body.classList.toggle("no-tabbar", !showTabs);
    let dock = 0;
    if (desk) dock = showMini ? 108 : 0;
    else {
      const low = window.innerHeight <= 640; // the compact dock of a low window (see system.css)
      if (showTabs && showMini) dock = low ? 132 : 160;
      else if (showTabs) dock = low ? 72 : 84;
      else if (showMini) dock = low ? 76 : 86;
    }
    document.documentElement.style.setProperty("--dock", `${dock}px`);
  }

  function showScreen(name, opts) {
    opts = opts || {};
    const prev = currentScreen;
    currentScreen = name;
    // leaving the player puts the words away (the layout of the words hides the side panel: it must not outlive the player)
    if (name !== "player" && document.body.classList.contains("lyrics-open")) setLyricsOpen(false);
    Object.entries(screens).forEach(([key, el]) => {
      if (!el) return;
      el.hidden = key !== name;
      if (key !== name) el.classList.remove("no-enter"); // its next ordinary showing has its entrance again
    });
    document.body.dataset.screen = name;
    // «keep»: coming back to a page that is already on the screen under a player being put away:
    // it stays exactly as it was (no redraw, no jump to its top, no flash)
    if (!opts.keep) {
    if (name === "home") renderHome();
    if (name === "library") renderLibrary();
    if (name === "search" && typeof renderSearchHistory === "function" && !searchInput.value.trim()) renderSearchHistory();
    if (name === "favorites") renderFavoritesScreen();
    if (name === "profile") { renderProfile(); revealIn("screen-profile", true); }
    if (name === "account") { renderAccountScreen(); revealIn("screen-account", true); }
    if (name === "sound") renderSoundScreen();
    if (name === "stats") renderStatsScreen();
    if (name === "recap") renderRecap();
    if (name === "about") revealIn("screen-about", true);
    if (name === "plus") openPlusScreen();
    if (name === "look") renderLookScreen();
    if (name === "event") renderEventScreen();
    if (name === "event" || prev === "event") applyLook(); // the page of an event wears its own atmosphere
    if (name === "mood") { $("mood-note").hidden = hasPlus(); document.body.classList.toggle("has-plus", hasPlus()); revealIn("screen-mood", true); requestAnimationFrame(startMoodPhysics); }
    if (name === "profile") $("menu-plus").hidden = !plusPreview();
    if (name === "playlist" && currentPlaylistId && opts.replace) openPlaylist(currentPlaylistId, true);
    }
    if (opts.keep && name === "event") applyLook(); // the page of an event wears its own atmosphere again
    if (TAB_SCREENS.has(name)) {
      document.querySelectorAll(".tab").forEach((b) => {
        const on = b.dataset.tab === name;
        b.classList.toggle("active", on);
        if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
      });
      navStack = [{ name, params: null }];
    } else if (!opts.replace) {
      navStack.push({ name, params: opts.params || null });
    }
    if (opts.params) shownParams[name] = opts.params;
    const activeEl = screens[name];
    if (activeEl) {
      if (!opts.keep) {
        activeEl.classList.remove("screen-anim");
        void activeEl.offsetWidth;
        activeEl.classList.add("screen-anim");
        if (prev !== name) activeEl.scrollTop = 0;
      }
    }
    updateDock();
    syncBackButton();
    syncPrism();
  }

  function goBack(extra) {
    navStack.pop();
    const prev = navStack[navStack.length - 1] || { name: "home", params: null };
    if (extra && extra.keep && screens[prev.name]) {
      showScreen(prev.name, { replace: true, keep: true });
      return;
    }
    if (prev.params && REOPENERS[prev.name] && shownParams[prev.name] !== prev.params) {
      shownParams[prev.name] = prev.params;
      REOPENERS[prev.name](prev.params);
      return;
    }
    showScreen(prev.name, { replace: true });
  }

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      // the tab already open: nothing is drawn again (that restarted the screen's animation on
      // every click) — the page just goes back to its top, as in any app
      if (btn.dataset.tab === currentScreen) {
        const el = screens[currentScreen];
        if (el && el.scrollTop > 0) el.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      haptic("select");
      showScreen(btn.dataset.tab);
    });
  });

  // ============================================================
  // Sheets / modals
  // ============================================================
  const openOverlays = [];
  function openOverlay(id) {
    const el = $(id);
    if (!el) return;
    el.style.display = "flex";
    el.classList.remove("open");
    void el.offsetWidth;
    requestAnimationFrame(() => el.classList.add("open"));
    if (!openOverlays.includes(id)) openOverlays.push(id);
    syncBackButton();
  }
  function closeOverlay(id) {
    const el = $(id);
    if (!el) return;
    el.classList.remove("open");
    const idx = openOverlays.indexOf(id);
    if (idx >= 0) openOverlays.splice(idx, 1);
    setTimeout(() => { if (!el.classList.contains("open")) el.style.display = "none"; }, 380);
    syncBackButton();
  }
  document.querySelectorAll(".sheet-anim, .modal-anim").forEach((el) => {
    el.addEventListener("click", (e) => { if (e.target === el) closeOverlay(el.id); });
  });

  // A sheet is put away by pulling its handle (or its title) down, as in any phone app.
  document.querySelectorAll(".sheet-anim > .sheet").forEach((sheet) => {
    const overlay = sheet.parentElement;
    let drag = null;
    sheet.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (!e.target.closest(".sheet-handle, .sheet-head, .sheet-title")) return;
      drag = { id: e.pointerId, y: e.clientY, dy: 0, t: performance.now() };
      try { sheet.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
    });
    sheet.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag.dy = Math.max(0, e.clientY - drag.y);
      sheet.style.transition = "none";
      sheet.style.transform = `translateY(${drag.dy}px)`;
    });
    const end = (e) => {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      const d = drag;
      drag = null;
      const speed = d.dy / Math.max(1, performance.now() - d.t); // px per ms
      if (d.dy > 110 || (d.dy > 36 && speed > 0.5)) {
        sheet.style.transition = "transform 0.22s ease-out";
        sheet.style.transform = "translateY(110%)";
        closeOverlay(overlay.id);
        setTimeout(() => { sheet.style.transition = ""; sheet.style.transform = ""; }, 420);
      } else {
        sheet.style.transition = "transform 0.25s var(--ease-out)";
        sheet.style.transform = "";
        setTimeout(() => { sheet.style.transition = ""; }, 280);
      }
    };
    sheet.addEventListener("pointerup", end);
    sheet.addEventListener("pointercancel", end);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && openOverlays.length) closeOverlay(openOverlays[openOverlays.length - 1]);
  });

  // A mouse has no sideways swipe: a shelf under the pointer gets arrows.
  const shelfArrows = ["left", "right"].map((dir) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `shelf-arrow shelf-arrow-${dir}`;
    b.setAttribute("aria-label", dir === "left" ? "Назад" : "Вперёд");
    b.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${dir === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"}"/></svg>`;
    document.body.appendChild(b);
    return b;
  });
  let arrowShelf = null;
  let arrowHideTimer = 0;
  function placeShelfArrows() {
    const s = arrowShelf;
    if (!s || !isDesktop() || !s.isConnected || s.offsetParent === null) { shelfArrows.forEach((b) => b.classList.remove("is-on")); return; }
    const r = s.getBoundingClientRect();
    const cardH = Math.min(r.height, 170);
    const top = r.top + Math.max(0, (cardH - 40) / 2);
    const canL = s.scrollLeft > 4, canR = s.scrollLeft + s.clientWidth < s.scrollWidth - 4;
    shelfArrows[0].style.cssText = `left:${Math.round(r.left + 6)}px;top:${Math.round(top)}px`;
    shelfArrows[1].style.cssText = `left:${Math.round(r.right - 46)}px;top:${Math.round(top)}px`;
    shelfArrows[0].classList.toggle("is-on", canL);
    shelfArrows[1].classList.toggle("is-on", canR);
  }
  shelfArrows.forEach((b, i) => b.addEventListener("click", () => {
    if (!arrowShelf) return;
    arrowShelf.scrollBy({ left: (i ? 1 : -1) * Math.round(arrowShelf.clientWidth * 0.85), behavior: "smooth" });
    setTimeout(placeShelfArrows, 450);
  }));
  document.addEventListener("mouseover", (e) => {
    if (!isDesktop() || !e.target.closest) return;
    const s = e.target.closest(".shelf");
    clearTimeout(arrowHideTimer);
    if (s) { arrowShelf = s; placeShelfArrows(); return; }
    if (e.target.closest(".shelf-arrow")) return;
    arrowHideTimer = setTimeout(() => { arrowShelf = null; placeShelfArrows(); }, 250);
  });
  document.addEventListener("scroll", () => { if (arrowShelf) placeShelfArrows(); }, true);

  // Keys on a computer: space plays or pauses, ←/→ seek by 5 seconds
  // (with Shift: previous / next track). Not while typing or on a control
  // that uses these keys itself.
  document.addEventListener("keydown", (e) => {
    if (!currentTrack || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    const typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    if (typing || openOverlays.length) return;
    if (e.code === "Space") {
      if (t && /^(BUTTON|A)$/.test(t.tagName)) return;
      e.preventDefault();
      togglePlayPause();
    } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      if (t && t.getAttribute && t.getAttribute("role") === "slider") return;
      e.preventDefault();
      if (e.shiftKey) { playAdjacent(e.key === "ArrowRight" ? 1 : -1); return; }
      const dur = effectiveDuration();
      if (!dur) return;
      const to = audio.currentTime + (e.key === "ArrowRight" ? 5 : -5);
      audio.currentTime = Math.max(0, Math.min(dur - 1, to));
    }
  });

  // Telegram's own back button: closes the top sheet, otherwise steps back
  // a screen. System back on Android goes through the same button.
  function syncBackButton() {
    if (!hasTgBack) return;
    const needed = openOverlays.length > 0 || (!TAB_SCREENS.has(currentScreen) && currentScreen !== "onboarding" && currentScreen !== "splash");
    try { needed ? tg.BackButton.show() : tg.BackButton.hide(); } catch (e) { /* ignore */ }
  }
  if (hasTgBack) {
    tg.BackButton.onClick(() => {
      if (openOverlays.length) closeOverlay(openOverlays[openOverlays.length - 1]);
      else goBack();
    });
  }

  // ============================================================
  // Track rows — one strict grid everywhere:
  // cover · title/artist · time · one action
  // ============================================================
  // the heart in a list row: «в любимое» without opening the menu (what the lists were missing)
  function rowHeart(track) {
    const h = document.createElement("button");
    h.type = "button";
    h.className = "icon-btn row-heart";
    h.dataset.trackId = track.id;
    h.innerHTML = '<svg class="ic-off" width="22" height="22" aria-hidden="true"><use href="#i-heart"/></svg><svg class="ic-on" width="22" height="22" aria-hidden="true"><use href="#i-heart-fill"/></svg>';
    const paint = () => {
      const on = Store.isFavorite(track.id);
      h.setAttribute("aria-pressed", on ? "true" : "false");
      h.setAttribute("aria-label", on ? `Убрать «${track.title || "трек"}» из любимого` : `«${track.title || "трек"}» в любимое`);
    };
    paint();
    h.addEventListener("click", (e) => {
      e.stopPropagation();
      const on = Store.toggleFavorite(track);
      haptic(on ? "success" : "light");
      heartPop([h], on);
      if (on) heartBurst(h);
      syncRowHearts(track.id);
      if (currentTrack && currentTrack.id === track.id) syncPlayerFav();
      if (currentScreen === "library") renderLibrary();
    });
    return h;
  }
  function syncRowHearts(trackId) {
    const on = Store.isFavorite(trackId);
    document.querySelectorAll(".row-heart").forEach((h) => {
      if (h.dataset.trackId !== trackId) return;
      h.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function buildTrackRow(track, opts) {
    opts = opts || {};
    const li = document.createElement("li");
    li.className = "track-row";
    li.dataset.trackId = track.id;

    const main = document.createElement("button");
    main.type = "button";
    main.className = "row-main";

    if (opts.index != null) {
      const idx = document.createElement("span");
      idx.className = "row-index";
      idx.textContent = String(opts.index);
      main.appendChild(idx);
    }

    const art = document.createElement("span");
    art.className = "cover cover-sm";
    setCoverEl(art, track.artwork, track.id);
    const eq = document.createElement("span");
    eq.className = "eq";
    eq.setAttribute("aria-hidden", "true");
    eq.innerHTML = "<i></i><i></i><i></i>";
    const spin = document.createElement("span");
    spin.className = "row-spinner";
    spin.setAttribute("aria-hidden", "true");
    art.appendChild(eq);
    art.appendChild(spin);

    const meta = document.createElement("span");
    meta.className = "row-meta";
    const title = document.createElement("span");
    title.className = "row-title";
    title.textContent = track.title || "Без названия";
    const artist = document.createElement("span");
    artist.className = "row-sub";
    artist.textContent = track.artist || "Неизвестный исполнитель";
    meta.appendChild(title);
    meta.appendChild(artist);

    const dur = document.createElement("span");
    dur.className = "row-time";
    dur.textContent = opts.hideDuration ? "" : formatDuration(track.duration);

    main.appendChild(art);
    main.appendChild(meta);
    main.appendChild(dur);
    li.appendChild(main);

    const action = opts.action || "more";
    if (action !== "none") {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "icon-btn row-action" + (action === "more" ? " row-more" : "");
      if (action === "more") {
        btn.setAttribute("aria-label", `Действия: ${track.title || "трек"}`);
        btn.innerHTML = icon("i-more", 24);
        btn.addEventListener("click", (e) => { e.stopPropagation(); openTrackMenu(track); });
      } else if (action === "add") {
        const added = !!opts.added;
        btn.classList.toggle("is-added", added);
        btn.setAttribute("aria-label", added ? "Уже в плейлисте" : "Добавить в плейлист");
        btn.innerHTML = icon(added ? "i-check" : "i-plus", 22);
        btn.addEventListener("click", (e) => { e.stopPropagation(); if (opts.onAction) opts.onAction(btn); });
      } else if (action === "remove") {
        btn.setAttribute("aria-label", `Убрать «${track.title || "трек"}» из плейлиста`);
        btn.innerHTML = icon("i-close", 22);
        btn.addEventListener("click", (e) => { e.stopPropagation(); if (opts.onAction) opts.onAction(btn); });
      }
      if (opts.heart && action === "more") li.appendChild(rowHeart(track));
      li.appendChild(btn);
    }

    // tap plays (or runs the row's own action); long-press opens the menu
    let lpTimer = null;
    let lpFired = false;
    let startX = 0, startY = 0;
    const cancelLp = () => clearTimeout(lpTimer);
    main.addEventListener("pointerdown", (e) => {
      lpFired = false;
      startX = e.clientX; startY = e.clientY;
      if (action !== "more" || e.pointerType === "mouse") return;
      lpTimer = setTimeout(() => { lpFired = true; haptic("medium"); openTrackMenu(track); }, 480);
    });
    main.addEventListener("pointermove", (e) => {
      if (Math.abs(e.clientX - startX) > 8 || Math.abs(e.clientY - startY) > 8) cancelLp();
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((ev) => main.addEventListener(ev, cancelLp));
    main.addEventListener("contextmenu", (e) => { e.preventDefault(); if (action === "more") openTrackMenu(track); });
    main.addEventListener("click", (e) => {
      if (lpFired) { e.preventDefault(); lpFired = false; return; }
      if (opts.onMain) { opts.onMain(btnOf(li)); return; }
      playTrack(track, opts.queue || [track], { context: opts.context });
    });

    if (action === "more") attachRowSwipe(li, main, track);
    applyRowState(li);
    return li;
  }
  function btnOf(li) { return li.querySelector(".row-action"); }

  // A swipe on a track row (a finger, not a mouse): right = «Играть следующим», left = «В плейлист».
  // Vertical scrolling stays the browser's (touch-action: pan-y); the row follows the finger and springs back.
  function attachRowSwipe(li, main, track) {
    const SWIPE_AT = 72;
    const hintR = document.createElement("span");
    hintR.className = "swipe-hint swipe-hint-r";
    hintR.setAttribute("aria-hidden", "true");
    hintR.innerHTML = `${icon("i-queue", 20)}<span>Следующим</span>`;
    const hintL = document.createElement("span");
    hintL.className = "swipe-hint swipe-hint-l";
    hintL.setAttribute("aria-hidden", "true");
    hintL.innerHTML = `${icon("i-playlist-add", 20)}<span>В плейлист</span>`;
    li.append(hintR, hintL);
    li.classList.add("swipeable");
    let x0 = 0, y0 = 0, dx = 0, mode = null, id = null;
    const kids = () => [...li.children].filter((c) => !c.classList.contains("swipe-hint"));
    const setDx = (v, animate) => {
      kids().forEach((c) => { c.style.transition = animate ? "transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)" : "none"; c.style.transform = v ? `translateX(${v}px)` : ""; });
      const k = Math.min(1, Math.abs(v) / SWIPE_AT);
      hintR.style.opacity = v > 0 ? String(k) : "0";
      hintL.style.opacity = v < 0 ? String(k) : "0";
      hintR.classList.toggle("is-ready", v >= SWIPE_AT);
      hintL.classList.toggle("is-ready", v <= -SWIPE_AT);
    };
    li.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" || id !== null || e.target.closest(".row-action, .row-heart")) return;
      id = e.pointerId; x0 = e.clientX; y0 = e.clientY; dx = 0; mode = null;
    });
    li.addEventListener("pointermove", (e) => {
      if (e.pointerId !== id) return;
      const mx = e.clientX - x0, my = e.clientY - y0;
      if (mode === null) {
        if (Math.abs(mx) < 10 && Math.abs(my) < 10) return;
        mode = Math.abs(mx) > Math.abs(my) * 1.5 ? "x" : "y";
        if (mode === "x") { try { li.setPointerCapture(id); } catch (err) { /* ignore */ } }
      }
      if (mode !== "x") return;
      dx = Math.max(-110, Math.min(110, mx * 0.7));
      setDx(dx, false);
    });
    const end = () => {
      if (id === null) return;
      const was = mode === "x", d = dx;
      id = null; mode = null; dx = 0;
      if (!was) return;
      li.dataset.swiped = String(Date.now()); // the click that follows a drag is not a tap
      setDx(0, true);
      if (d >= SWIPE_AT) { haptic("medium"); queueTrack(track, false); }
      else if (d <= -SWIPE_AT) { haptic("medium"); openAddToPlaylistSheet(track); }
    };
    li.addEventListener("pointerup", end);
    li.addEventListener("pointercancel", end);
    li.addEventListener("click", (e) => {
      if (Date.now() - Number(li.dataset.swiped || 0) < 400) { e.stopPropagation(); e.preventDefault(); }
    }, true);
  }

  function applyRowState(li) {
    const isCurrent = !!currentTrackId && li.dataset.trackId === currentTrackId;
    li.classList.toggle("playing", isCurrent);
    li.classList.toggle("loading", isCurrent && isLoading);
  }
  function refreshRowStates() {
    document.querySelectorAll(".track-row[data-track-id]").forEach(applyRowState);
  }

  function refreshCurrentScreen() {
    const name = currentScreen;
    if (name === "home") renderHome();
    if (name === "library") renderLibrary();
    if (name === "favorites") renderFavoritesScreen();
    if (name === "search" && lastSearchResults) renderFilteredResults();
    if (name === "playlist" && currentPlaylistId) openPlaylist(currentPlaylistId, true);
  }

  // ============================================================
  // Create-playlist modal
  // ============================================================
  const createPlaylistInput = $("create-playlist-input");
  let createPlaylistThenAddTrack = null; // track to add right after creating, if any

  function openCreatePlaylistModal(trackToAdd) {
    createPlaylistThenAddTrack = trackToAdd || null;
    createPlaylistInput.value = "";
    openOverlay("create-playlist-modal");
    setTimeout(() => createPlaylistInput.focus(), 60);
  }
  function confirmCreatePlaylist() {
    const name = createPlaylistInput.value.trim();
    if (!name) { createPlaylistInput.focus(); return; }
    const playlist = Store.createPlaylist(name);
    if (createPlaylistThenAddTrack) Store.addTrackToPlaylist(playlist.id, createPlaylistThenAddTrack);
    closeOverlay("create-playlist-modal");
    renderLibrary();
    haptic("success");
    showToast(createPlaylistThenAddTrack ? `Создан «${name}», трек добавлен` : `Плейлист «${name}» создан`);
    if (!createPlaylistThenAddTrack) openPlaylist(playlist.id);
  }
  $("create-playlist-cancel").addEventListener("click", () => closeOverlay("create-playlist-modal"));
  $("create-playlist-confirm").addEventListener("click", confirmCreatePlaylist);
  createPlaylistInput.addEventListener("keydown", (e) => { if (e.key === "Enter") confirmCreatePlaylist(); });

  // ============================================================
  // «Перенести плейлист»: a link from another service -> the backend reads
  // the track list -> each track is found in Нотка's own search, a few at
  // a time, and the playlist fills up as they are found.
  // ============================================================
  const importInput = $("import-input");
  let importRun = 0; // bumped to drop a running import altogether
  let importStopped = false; // «Остановить»: finish with what has been found
  let importedPlaylistId = null;

  function importStep(name) {
    ["link", "work", "done"].forEach((step) => { $(`import-step-${step}`).hidden = step !== name; });
  }
  function importError(text) {
    $("import-error").textContent = text || "";
    $("import-error").hidden = !text;
  }
  function openImport() {
    importInput.value = "";
    importError("");
    $("import-confirm").classList.remove("is-busy");
    importStep("link");
    openOverlay("import-modal");
    setTimeout(() => importInput.focus(), 60);
  }
  function closeImport() {
    importRun++;
    closeOverlay("import-modal");
  }

  const normText = (text) => (text || "").toLowerCase().replace(/ё/g, "е").replace(/\(.*?\)|\[.*?\]/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  // The found track must be the same song: its title holds the wanted one
  // (or the other way round) and one of the artists matches. Among those,
  // the one closest in length wins — that separates a live or remix take.
  function pickMatch(wanted, results) {
    const title = normText(wanted.title);
    const artists = (wanted.artist || "").split(/,|&| feat\.? | ft\.? /i).map(normText).filter(Boolean);
    let best = null;
    results.forEach((t, order) => {
      const gotTitle = normText(t.title);
      if (!gotTitle || !(gotTitle.includes(title) || title.includes(gotTitle))) return;
      const gotArtist = normText(t.artist);
      if (artists.length && !artists.some((a) => gotArtist.includes(a) || a.includes(gotArtist))) return;
      const off = wanted.duration && t.duration ? Math.abs(wanted.duration - t.duration) : 15;
      const score = off + order * 0.5 + (gotTitle === title ? 0 : 4);
      if (!best || score < best.score) best = { track: t, score };
    });
    return best ? best.track : null;
  }
  async function findInNotka(wanted) {
    const query = `${wanted.artist ? wanted.artist.split(",")[0] + " " : ""}${wanted.title}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(`${API_BASE_URL}/search?q=${encodeURIComponent(query)}&limit=8`);
        if (res.ok) return pickMatch(wanted, (await res.json()).results || []);
      } catch (e) { /* one more try below */ }
    }
    return null;
  }

  async function runImport() {
    const url = importInput.value.trim();
    if (!url) { importInput.focus(); return; }
    const run = ++importRun;
    importStopped = false;
    importError("");
    $("import-confirm").classList.add("is-busy");
    let data = null, problem = null;
    try {
      const res = await fetch(`${API_BASE_URL}/import?url=${encodeURIComponent(url)}`);
      if (res.ok) data = await res.json();
      else {
        let code = null;
        try { code = (await res.json()).error.code; } catch (e) { /* no readable reason */ }
        problem = code === "INVALID_SOURCE_URL"
          ? "Это не похоже на ссылку на плейлист. Подойдут Spotify, Яндекс Музыка, Apple Music, Deezer, SoundCloud и YouTube Music."
          : "Не получилось прочитать плейлист. Проверь, что он открыт для всех по ссылке.";
      }
    } catch (e) {
      problem = "Нет связи с Ноткой. Попробуй ещё раз.";
    }
    if (run !== importRun) return;
    $("import-confirm").classList.remove("is-busy");
    if (!data) { importError(problem); haptic("error"); return; }

    const wanted = data.tracks;
    const found = new Array(wanted.length).fill(null);
    const tried = new Array(wanted.length).fill(false);
    let done = 0;
    $("import-name").textContent = data.name || "Плейлист";
    $("import-total").textContent = String(wanted.length);
    const progress = (now) => {
      $("import-done").textContent = String(done);
      $("import-bar-fill").style.transform = `scaleX(${done / wanted.length})`;
      if (now) $("import-now").textContent = now;
    };
    progress("Ищу треки в Нотке…");
    importStep("work");

    // a few searches at a time: faster than one by one, gentle on the sources
    let next = 0;
    const worker = async () => {
      while (run === importRun && !importStopped && next < wanted.length) {
        const i = next++;
        const item = wanted[i];
        found[i] = item.track || await findInNotka(item);
        if (run !== importRun) return;
        tried[i] = true;
        done++;
        progress(`${item.artist ? item.artist + " — " : ""}${item.title}`);
      }
    };
    // a long playlist needs many searches: more of them at a time (a thousand at three at a time takes minutes)
    const lanes = wanted.length > 150 ? 6 : 3;
    await Promise.all(Array.from({ length: lanes }, () => worker()));
    if (run !== importRun) return; // the window was closed: nothing is created

    // stopped half-way: what was found so far is still kept
    const tracks = found.filter(Boolean);
    const missed = wanted.filter((item, i) => tried[i] && !found[i]);
    if (!tracks.length) {
      importStep("link");
      importError("Ни одного трека из этого плейлиста найти не удалось.");
      openOverlay("import-modal");
      return;
    }
    const playlist = Store.createPlaylist(data.name || "Перенесённый плейлист");
    const seen = new Set();
    tracks.forEach((t) => { if (!seen.has(t.id)) { seen.add(t.id); Store.addTrackToPlaylist(playlist.id, t); } });
    importedPlaylistId = playlist.id;
    track("import", { svc: String(data.service || "").slice(0, 16), total: wanted.length, found: tracks.length });
    renderLibrary();
    haptic("success");
    $("import-result-title").textContent = `«${playlist.name}» в Нотке`;
    $("import-result-note").textContent = missed.length || done < wanted.length
      ? `Перенесено ${pluralTracks(seen.size)} из ${wanted.length}. Не нашлись:`.replace(" Не нашлись:", done < wanted.length ? " Перенос остановлен." + (missed.length ? " Не нашлись:" : "") : " Не нашлись:")
      : `Перенесены все ${pluralTracks(seen.size)}.`;
    $("import-missed").innerHTML = missed.map((item) => `<li>${escapeHtml(item.artist ? item.artist + " — " : "")}${escapeHtml(item.title)}</li>`).join("");
    importStep("done");
    openOverlay("import-modal");
  }

  $("import-open-btn").addEventListener("click", openImport);
  $("import-cancel").addEventListener("click", closeImport);
  $("import-confirm").addEventListener("click", runImport);
  importInput.addEventListener("keydown", (e) => { if (e.key === "Enter") runImport(); });
  importInput.addEventListener("input", () => importError(""));
  // «Остановить» keeps what has been found: the loop ends and the playlist is made
  $("import-stop").addEventListener("click", () => { importStopped = true; $("import-now").textContent = "Останавливаю…"; });
  $("import-open-playlist").addEventListener("click", () => {
    closeOverlay("import-modal");
    if (importedPlaylistId) openPlaylist(importedPlaylistId);
  });

  // ============================================================
  // Add-to-playlist sheet
  // ============================================================
  let addToPlaylistTrack = null;
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
        Store.addTrackToPlaylist(p.id, addToPlaylistTrack, !!Store.getSetting("playlistAddToStart"));
        haptic("success");
        showToast(Store.getSetting("playlistAddToStart") ? `Добавлено в начало «${p.name}»` : `Добавлено в «${p.name}»`);
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
  // HOME
  // ============================================================
  function firstName() {
    if (Store.getAccountName()) return Store.getAccountName().split(" ")[0];
    return tgUser && tgUser.first_name ? tgUser.first_name : null;
  }

  function renderHome() {
    const name = firstName();
    $("home-greeting").textContent = name ? `Привет, ${name}` : "Привет!";
    renderAvatarInto("home-avatar", "home-initial");

    const list = $("home-favorites-list");
    const empty = $("home-favorites-empty");
    list.innerHTML = "";
    const favs = state.favorites.slice(0, 5);
    empty.hidden = favs.length > 0;
    $("home-see-all-favorites").hidden = state.favorites.length === 0;
    favs.forEach((track) => list.appendChild(buildTrackRow(track, { queue: state.favorites, context: "Любимые треки" })));
    updateMymixCardUI();
    renderRecent();
    renderTimeMachine();
    refreshFresh();
    revealIn("screen-home", false);
  }

  // Parts marked data-reveal come in when they scroll into view. With
  // `replay` they start hidden again (a screen whose content was rebuilt).
  const revealObservers = {};
  function revealIn(screenId, replay) {
    const root = $(screenId);
    const parts = Array.from(root.querySelectorAll("[data-reveal]"));
    if (replay) parts.forEach((el) => el.classList.remove("is-seen"));
    if (revealObservers[screenId]) revealObservers[screenId].disconnect();
    if (!("IntersectionObserver" in window)) { parts.forEach((el) => el.classList.add("is-seen")); return; }
    const observer = revealObservers[screenId] = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-seen");
        observer.unobserve(entry.target);
      });
    }, { root, threshold: 0.12 });
    // after a frame, so the hidden state is painted first and the move is seen
    requestAnimationFrame(() => requestAnimationFrame(() => parts.forEach((el) => { if (!el.classList.contains("is-seen")) observer.observe(el); })));
  }

  function shelfCard(coverUrl, seed, title, sub, onClick) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "shelf-card";
    const cover = document.createElement("span");
    cover.className = "cover";
    setCoverEl(cover, coverUrl, seed);
    const t = document.createElement("span");
    t.className = "shelf-title";
    t.textContent = title;
    const sb = document.createElement("span");
    sb.className = "shelf-sub";
    sb.textContent = sub;
    card.appendChild(cover);
    card.appendChild(t);
    card.appendChild(sb);
    card.addEventListener("click", onClick);
    return card;
  }

  // «Недавнее»: the last tracks that actually started playing.
  function rememberRecent(track) {
    const recent = state.recent || (state.recent = []);
    // `at` — when it was played: that is how the histories of two devices are put in one order
    state.recent = [Object.assign(slimTrack(track), { at: Date.now() })].concat(recent.filter((t) => t.id !== track.id)).slice(0, 20);
    persist();
    if (currentScreen === "home") renderRecent();
  }
  function renderRecent() {
    const recent = state.recent || [];
    $("home-recent-block").hidden = recent.length === 0;
    const shelf = $("home-recent");
    // rebuilt only when the list changed, so the cards' entrance plays for
    // new content and not on every return to Home
    const sig = recent.map((t) => t.id).join("|");
    if (shelf.dataset.sig === sig) return;
    shelf.dataset.sig = sig;
    shelf.innerHTML = "";
    recent.forEach((t, i) => {
      const card = shelfCard(t.artwork, t.id, t.title || "Без названия", t.artist || "", () => playTrack(t, recent, { context: "Недавнее" }));
      card.style.setProperty("--i", Math.min(i, 6));
      shelf.appendChild(card);
    });
    shelf.scrollLeft = 0;
  }

  // «Машина времени»: what was listened to a week, a month, three months ago.
  // The day nearest to that distance that has enough in it is taken. Without
  // Плюс the cards are shown veiled, and lead to the Плюс page.
  const TIME_STEPS = [[7, "Неделю назад"], [14, "Две недели назад"], [30, "Месяц назад"], [90, "Три месяца назад"]];
  function timeMachineDay(daysAgo) {
    const days = listensView().days || {};
    for (const off of [0, 1, -1, 2, -2, 3, -3]) {
      const key = dayKey(Date.now() - (daysAgo + off) * 86400000);
      const day = days[key];
      if (!day) continue;
      const tracks = Object.entries(day.t || {})
        .sort((a, b) => b[1][1] - a[1][1])
        .map(([tid]) => (listensView().tracks[tid] || {}).track)
        .filter(Boolean);
      if (tracks.length >= 3) return { key, tracks, seconds: day.s || 0, ms: Date.now() - (daysAgo + off) * 86400000 };
    }
    return null;
  }
  const longDay = (ms) => new Date(ms).toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
  function renderTimeMachine() {
    const shelf = $("home-time");
    const found = TIME_STEPS.map(([n, label]) => ({ n, label, day: timeMachineDay(n) })).filter((x) => x.day);
    $("home-time-block").hidden = found.length === 0;
    shelf.innerHTML = "";
    found.forEach((x, i) => {
      const cover = x.day.tracks.find((t) => t.artwork);
      const card = shelfCard(cover ? cover.artwork : null, x.label, x.label, `${new Date(x.day.ms).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })} · ${pluralTracks(x.day.tracks.length)}`, () => {
        haptic("light");
        if (hasPlus()) openTimeSheet(x.label, x.day); else showScreen("plus");
      });
      card.classList.toggle("is-locked", !hasPlus());
      card.style.setProperty("--i", Math.min(i, 6));
      shelf.appendChild(card);
    });
    shelf.scrollLeft = 0;
  }
  let timeDay = null;
  function openTimeSheet(label, day) {
    timeDay = day;
    $("time-sheet-title").textContent = label;
    const minutes = Math.round(day.seconds / 60);
    $("time-sheet-sub").textContent = `${longDay(day.ms)} · ${pluralTracks(day.tracks.length)}${minutes ? ` · ${minutes} ${plural(minutes, "минута", "минуты", "минут")}` : ""}`;
    const list = $("time-list");
    list.innerHTML = "";
    day.tracks.forEach((t, i) => list.appendChild(buildTrackRow(t, { index: i + 1, queue: day.tracks, context: label })));
    openOverlay("time-sheet");
  }
  $("time-play").addEventListener("click", () => {
    if (!timeDay) return;
    haptic("success");
    shuffleOn = false;
    playTrack(timeDay.tracks[0], timeDay.tracks, { context: $("time-sheet-title").textContent, source: "time" });
    closeOverlay("time-sheet");
  });
  $("time-close").addEventListener("click", () => closeOverlay("time-sheet"));

  // «Новое от любимых исполнителей»: the latest release (this year or last)
  // of each artist you follow or listen to the most. Asking about every
  // artist takes a while, so the answer is kept for six hours.
  function freshArtists() {
    const out = [];
    const seen = new Set();
    const add = (name, ref) => {
      if (!ref.artistId || !ref.source || seen.has(ref.artistId)) return;
      seen.add(ref.artistId);
      out.push({ name, artistId: ref.artistId, source: ref.source });
    };
    state.followedArtists.forEach((name) => add(name, state.followedMeta[name] || {}));
    Object.entries(listensView().artists).sort((a, b) => b[1].seconds - a[1].seconds).slice(0, 6).forEach(([name]) => add(name, artistRef(name)));
    return out.slice(0, 10);
  }
  let freshLoading = false;
  async function refreshFresh() {
    const artists = freshArtists();
    const key = artists.map((a) => `${a.source}:${a.artistId}`).join(",");
    if (!artists.length) { renderFresh(); return; }
    const cache = state.fresh;
    if ((cache && cache.key === key && Date.now() - cache.at < 6 * 3600 * 1000) || freshLoading) { renderFresh(); return; }
    freshLoading = true;
    renderFresh();
    const minYear = new Date().getFullYear() - 1;
    const items = [];
    let answered = 0;
    for (const a of artists) {
      try {
        const res = await fetch(`${API_BASE_URL}/artist?source=${encodeURIComponent(a.source)}&id=${encodeURIComponent(a.artistId)}`);
        if (!res.ok) continue;
        const data = await res.json();
        answered++;
        const latest = (data.albums || []).filter((x) => +x.year >= minYear).sort((x, y) => +y.year - +x.year)[0];
        if (latest && !items.some((it) => it.id === latest.id)) {
          items.push({ id: latest.id, source: latest.source || a.source, title: latest.title, cover: latest.cover, year: latest.year, type: latest.type, artist: data.name || a.name });
        }
      } catch (e) { /* this artist is skipped this time */ }
    }
    freshLoading = false;
    // nobody answered (the backend is away): keep what was shown before
    if (answered) {
      items.sort((x, y) => +y.year - +x.year);
      state.fresh = { key, at: Date.now(), items };
      persist();
    }
    renderFresh();
  }
  function renderFresh() {
    const items = freshArtists().length && state.fresh ? state.fresh.items : [];
    const loading = freshLoading && !items.length;
    $("home-fresh-block").hidden = !items.length && !loading;
    const shelf = $("home-fresh");
    const sig = loading ? "loading" : items.map((it) => it.id).join("|");
    if (shelf.dataset.sig === sig) return;
    shelf.dataset.sig = sig;
    shelf.innerHTML = "";
    if (loading) {
      shelf.innerHTML = '<span class="shelf-skel" aria-hidden="true"><i></i><i></i><i></i></span>'.repeat(3);
      return;
    }
    items.forEach((it, i) => {
      const art = hiResArtwork(it.cover);
      const card = shelfCard(art, it.id, it.title, `${it.artist} · ${it.type === "single" ? "сингл" : "альбом"}`, () => openAlbumById(it.source, it.id, it.title, it.artist));
      card.style.setProperty("--i", Math.min(i, 6));
      // the sleeve, its colors pooled as light beneath it, and the year on a tag
      const cover = card.querySelector(".cover");
      const wrap = document.createElement("span");
      wrap.className = "fresh-art";
      const glow = document.createElement("span");
      glow.className = "fresh-glow";
      if (art) glow.style.backgroundImage = `url("${art.replace(/"/g, "%22")}")`;
      const tag = document.createElement("span");
      tag.className = "fresh-tag";
      tag.textContent = it.year;
      card.insertBefore(wrap, cover);
      wrap.appendChild(glow);
      wrap.appendChild(cover);
      wrap.appendChild(tag);
      shelf.appendChild(card);
    });
  }

  $("home-see-all-favorites").addEventListener("click", () => showScreen("favorites"));
  $("home-avatar-btn").addEventListener("click", () => showScreen("profile"));
  $("home-search-btn").addEventListener("click", () => {
    showScreen("search");
    setTimeout(() => searchInput.focus(), 60);
  });

  // «Мой микс»: tracks you may like, found through YouTube Music's radio
  // for a few of your liked / playlisted tracks (freshest likes first).
  // It keeps going: near the end it tops itself up from what's playing.
  function knownTracks() {
    const map = new Map();
    state.favorites.forEach((t) => map.set(t.id, t));
    state.playlists.forEach((p) => Store.getPlaylistTracks(p.id).forEach((t) => map.set(t.id, t)));
    return map;
  }
  async function fetchRadio(track, limit) {
    if (track.source !== "youtube_music") return [];
    try {
      // the listener's own artists: a small band they love is not dropped by the mix's «real artists only» gate
      const mine = [...new Set([...knownTracks().values()].map((t) => artistKeyOf(t.artist)).filter(Boolean))].slice(0, 60).join("|");
      const res = await fetch(`${API_BASE_URL}/radio?source=${encodeURIComponent(track.source)}&id=${encodeURIComponent(track.sourceId)}&limit=${limit || 25}&known=${encodeURIComponent(mine)}`);
      if (!res.ok) return [];
      return (await res.json()).results || [];
    } catch (e) { return []; }
  }
  function pickSeeds(pool, n) {
    const fresh = state.favorites.filter((t) => t.source === "youtube_music").slice(0, 2);
    const rest = shuffled(pool.filter((t) => !fresh.some((f) => f.id === t.id)));
    return [...fresh, ...rest].slice(0, n);
  }
  // ---- «Мой микс» is put together here (the rules are in mix.js); YouTube Music only says what plays nearby ----
  const artistKeyOf = (name) => String(name || "").toLowerCase().split(/,|&| feat\.? | x /)[0].trim();
  const sessionGood = []; // tracks of this session that were heard on: the next top-up grows from them
  function noteListened(track, heard) {
    if (!track) return;
    const k = artistKeyOf(track.artist);
    if (!k) return;
    const e = state.skipStats[k] || (state.skipStats[k] = { s: 0, p: 0, u: 0 });
    if (heard < 30) e.s++; else e.p++;
    e.u = Date.now();
    const keys = Object.keys(state.skipStats);
    if (keys.length > 300) keys.sort((a, b) => state.skipStats[a].u - state.skipStats[b].u).slice(0, keys.length - 300).forEach((x) => delete state.skipStats[x]);
    if (heard >= 30) { sessionGood.push(track); if (sessionGood.length > 10) sessionGood.shift(); }
    persist(true);
  }
  function mixProfile() {
    const taste = currentTaste();
    const favIds = new Set(state.favorites.map((t) => t.id));
    const plays = (t) => { const x = state.listens && state.listens.tracks && state.listens.tracks[t.id]; return x ? x.plays || 0 : 0; };
    const dayAgo2 = Date.now() - 2 * 86400000;
    return {
      affinity: (a) => tasteOf(taste, a),
      trackWeight: (t) => Math.min(1, (favIds.has(t.id) ? 0.5 : 0) + Math.min(0.5, plays(t) * 0.1)),
      skips: (a) => (state.skipStats[artistKeyOf(a)] || {}).s || 0,
      skipRate: (a) => { const e = state.skipStats[artistKeyOf(a)]; return e ? e.s / (e.s + e.p + 2) : 0; },
      recentIds: new Set((state.recent || []).filter((t) => (t.at || 0) > dayAgo2).map((t) => t.id)),
      allowSpam: [...knownTracks().values()].some((t) => window.NotkaMix && window.NotkaMix.SPAM.test(t.title || "")),
    };
  }
  // the language of a title: what script it is written in. A mix does not bring Persian or Turkish songs to
  // someone whose music has none (that is what «a mix of strangers» was)
  function scriptOf(text) {
    const s = String(text || "");
    if (/[؀-ۿ]/.test(s)) return "arabic";
    if (/[ऀ-ॿ]/.test(s)) return "devanagari";
    if (/[぀-ヿ一-鿿가-힯]/.test(s)) return "cjk";
    if (/[֐-׿]/.test(s)) return "hebrew";
    if (/[฀-๿]/.test(s)) return "thai";
    if (/[əıİğĞşŞ]/.test(s)) return "turkic";
    if (/[а-яёА-ЯЁ]/.test(s)) return "cyrillic";
    if (/[A-Za-zÀ-ɏ]/.test(s)) return "latin";
    return "other";
  }
  function scriptProfile(tracks) {
    const count = {};
    let total = 0;
    tracks.forEach((t) => { const k = scriptOf(`${t.title || ""} ${t.artist || ""}`); count[k] = (count[k] || 0) + 1; total++; });
    const have = new Set(["latin", "other"]);
    Object.entries(count).forEach(([k, n]) => { if (n / Math.max(1, total) >= 0.06 || n >= 3) have.add(k); });
    if (have.has("cyrillic")) have.add("latin"); // those who listen in Russian listen to the West as well
    return have;
  }
  // «Язык» of the mixes: any / only Russian / only foreign (by the script of the title and artist). Kept on this device.
  const MIX_LANG_KEY = "notka_mix_lang";
  let mixLang = "any";
  try { const v = localStorage.getItem(MIX_LANG_KEY); if (v === "ru" || v === "world") mixLang = v; } catch (e) { /* any */ }
  const MIX_LANG_NAMES = { any: "любой язык", ru: "русские песни", world: "зарубежные песни" };
  function langOk(t) {
    if (mixLang === "any") return true;
    const cyr = scriptOf(`${t.title || ""} ${t.artist || ""}`) === "cyrillic";
    return mixLang === "ru" ? cyr : !cyr;
  }
  function paintLang() {
    document.querySelectorAll("#mix-lang [data-lang]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.lang === mixLang ? "true" : "false"));
  }
  function setMixLang(lang) {
    if (lang === mixLang) return;
    mixLang = lang;
    try { localStorage.setItem(MIX_LANG_KEY, lang); } catch (e) { /* ignore */ }
    mixResume = {}; // the kept mixes were made for another language
    try { localStorage.setItem(MIX_RESUME_KEY, "{}"); } catch (e) { /* ignore */ }
    paintLang();
    haptic("select");
    if (mymixActive) refreshMymix(); else showToast(`Миксы: ${MIX_LANG_NAMES[lang]}`);
  }
  document.querySelectorAll("#mix-lang [data-lang]").forEach((b) => b.addEventListener("click", () => setMixLang(b.dataset.lang)));
  paintLang();
  async function buildMix() {
    const known = knownTracks();
    const own = new Map(known);
    (state.recent || []).forEach((t) => { if (!own.has(t.id)) own.set(t.id, t); });
    let ownList = [...own.values()];
    if (mixLang !== "any") {
      const only = ownList.filter(langOk);
      if (only.length >= 3) ownList = only; // too little of that language of one's own: the new ones carry the mix
    }
    const seedPool = ownList.filter((t) => t.source === "youtube_music");
    if (!seedPool.length || !window.NotkaMix) return shuffled([...known.values()]);
    const prof = mixProfile();
    const seeds = window.NotkaMix.pickSeeds(seedPool, (t) => 0.15 + prof.affinity(t.artist) + prof.trackWeight(t) + (prof.recentIds.has(t.id) ? 0.3 : 0), 5);
    const lists = await Promise.all(seeds.map((s) => fetchRadio(s, 30)));
    const seen = new Set();
    const adjacent = [];
    const scripts = scriptProfile(ownList);
    lists.forEach((list) => list.forEach((t) => {
      if (!t || seen.has(t.id) || own.has(t.id)) return;
      if (!scripts.has(scriptOf(`${t.title || ""} ${t.artist || ""}`))) return; // a language this listener does not listen to
      if (!langOk(t)) return;
      seen.add(t.id);
      adjacent.push(t);
    }));
    const mix = window.NotkaMix.assemble(Object.assign({ familiar: ownList, adjacent, size: 40, familiarShare: 0.4 }, prof));
    const famIds = new Set(ownList.map((t) => t.id));
    track("mix_built", { v: 2, n: mix.length, fam: mix.filter((t) => famIds.has(t.id)).length, adj: adjacent.length, seeds: seeds.length });
    if (mix.length < 8) return shuffled([...known.values()].filter(langOk).length >= 3 ? [...known.values()].filter(langOk) : [...known.values()]);
    return mix;
  }
  // Leaving a mix for something else keeps its place: coming back goes on
  // with the same queue, from the same track and the same second. Kept per
  // mix («мой микс», each mood), for a few days, in this device's storage.
  const MIX_RESUME_KEY = "notka_mix_resume";
  const MIX_RESUME_DAYS = 3;
  const MIX_RULES_VERSION = 3; // a mix kept from before the quality gate is not carried on (it had junk in it)
  let mixResume = {};
  try { mixResume = JSON.parse(localStorage.getItem(MIX_RESUME_KEY) || "{}") || {}; } catch (e) { mixResume = {}; }
  let lastMixSave = 0;
  function saveMixResume() {
    if (!currentMixKey || !currentTrack || !currentQueue.length) return;
    lastMixSave = Date.now();
    mixResume[currentMixKey] = {
      v: MIX_RULES_VERSION,
      at: lastMixSave,
      queue: currentQueue.slice(0, 120),
      trackId: currentTrack.id,
      position: Math.floor(audio.currentTime || 0),
      context: currentContextLabel,
    };
    const keys = Object.keys(mixResume).sort((a, b) => mixResume[b].at - mixResume[a].at);
    keys.slice(8).forEach((k) => delete mixResume[k]);
    try { localStorage.setItem(MIX_RESUME_KEY, JSON.stringify(mixResume)); } catch (e) { /* storage full or blocked: the place is just not kept */ }
  }
  function mixResumeFor(key) {
    const r = mixResume[key];
    if (!r || r.v !== MIX_RULES_VERSION || !r.queue || !r.queue.length || Date.now() - r.at > MIX_RESUME_DAYS * 86400000) return null;
    const track = r.queue.find((t) => t.id === r.trackId);
    return track ? { track, queue: r.queue, position: r.position || 0, context: r.context } : null;
  }
  function resumeMix(key, saved) {
    shuffleOn = false;
    playTrack(saved.track, saved.queue, { mymix: true, source: "mix", mixKey: key, context: saved.context || undefined, startAt: saved.position });
  }

  let mixExtending = false;
  async function extendMixIfNeeded() {
    if (currentSource !== "mix" || mixExtending || !currentTrack || !window.NotkaMix) return;
    if (currentQueueIndex < currentQueue.length - 3) return;
    mixExtending = true;
    try {
      if (/^mood:/.test(currentMixKey || "")) {
        // the mood stays: a new set for the same mood, without what is already in the queue
        const moodKey = currentMixKey.slice(5);
        const res = await fetch(`${API_BASE_URL}/mood`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(Object.assign({ key: moodKey }, tasteProfile())),
        });
        if (res.ok) {
          const have = new Set(currentQueue.map((t) => t.id));
          const more = ((await res.json()).results || []).filter((t) => !have.has(t.id));
          if (more.length && currentMixKey === `mood:${moodKey}`) {
            currentQueue.push(...more);
            originalQueue.push(...more);
            renderQueueSheet();
            prepareNextTrack();
          }
        }
        return;
      }
      const known = knownTracks();
      const inQueue = new Set(currentQueue.map((t) => t.id));
      // the next part grows from what was heard on in this session (and the track now playing)
      const seeds = sessionGood.slice(-3).concat([currentTrack]).filter((t, i, a) => t && a.findIndex((x) => x.id === t.id) === i);
      const lists = await Promise.all(seeds.map((s) => fetchRadio(s, 20)));
      const seen = new Set();
      const adjacent = [];
      lists.forEach((list) => list.forEach((t) => { if (t && !seen.has(t.id) && !inQueue.has(t.id) && !known.has(t.id)) { seen.add(t.id); adjacent.push(t); } }));
      const familiar = [...known.values(), ...(state.recent || [])].filter((t) => !inQueue.has(t.id));
      const more = window.NotkaMix.assemble(Object.assign({ familiar, adjacent, size: 16, familiarShare: 0.3, exclude: inQueue }, mixProfile()));
      if (more.length && currentSource === "mix") {
        currentQueue.push(...more);
        originalQueue.push(...more);
        renderQueueSheet();
        prepareNextTrack();
      }
    } finally { mixExtending = false; }
  }
  // the card's picture: four covers of what the mix is made of (the playing mix, else the listener's own music)
  let mixArtKey = "";
  const mixProgressEl = $("mix-progress");
  function paintMixArt() {
    const box = $("mix-art");
    if (!box) return;
    const source = mymixActive && currentQueue.length ? currentQueue : [...knownTracks().values()];
    const covers = [];
    const seen = new Set();
    for (const t of source) {
      if (t && t.artwork && !seen.has(t.artwork)) { seen.add(t.artwork); covers.push(hiResArtwork(t.artwork)); }
      if (covers.length >= 3) break;
    }
    const key = covers.join("|");
    if (key === mixArtKey) return;
    mixArtKey = key;
    box.querySelectorAll("i").forEach((el, k) => {
      const url = covers[k];
      el.style.backgroundImage = url ? `url("${String(url).replace(/"/g, "%22")}")` : "";
      el.classList.toggle("is-empty", !url);
    });
    box.classList.toggle("is-empty", covers.length === 0);
  }
  // the button beats with the music: the tempo of the playing track (from its sound profile, 96 bpm when not yet known)
  let beatFor = null;
  async function paintBeat() {
    const card = $("mymix-card");
    if (!card) return;
    if (!mymixActive || !currentTrack) { beatFor = null; return; }
    const t = currentTrack;
    if (beatFor === t.id) return;
    beatFor = t.id;
    let bpm = 96;
    try {
      const res = await fetch(`${API_BASE_URL}/profile?source=${encodeURIComponent(t.source)}&id=${encodeURIComponent(t.sourceId)}&artist=${encodeURIComponent(t.artist || "")}`);
      if (res.ok) { const j = await res.json(); const tempo = j && j.sound && j.sound.tempo; if (tempo > 50 && tempo < 220) bpm = tempo; }
    } catch (e) { /* the default pulse */ }
    if (beatFor !== t.id) return;
    while (bpm > 150) bpm /= 2; // a fast track pulses on every second beat
    while (bpm < 70) bpm *= 2;
    card.style.setProperty("--beat", `${(60 / bpm).toFixed(3)}s`);
  }
  // real level of the music drives the button where the device allows (desktop); elsewhere the beat above does
  let vizRaf = 0;
  function vizLoop() {
    vizRaf = 0;
    const card = $("mymix-card");
    if (!card || audio.paused || currentScreen !== "home" || document.hidden) { if (card) card.classList.remove("is-live"); return; }
    const lv = loudness.level();
    if (lv != null) {
      card.classList.add("is-live");
      card.style.setProperty("--lvl", lv.toFixed(3));
    }
    vizRaf = requestAnimationFrame(vizLoop);
  }
  function syncViz() {
    const card = $("mymix-card");
    if (!card) return;
    try {
      if (!audio.paused && mymixActive && currentScreen === "home" && !vizRaf && loudness.startViz()) vizRaf = requestAnimationFrame(vizLoop);
    } catch (e) { /* the level is a nicety; the beat animation stays */ }
    if (audio.paused) card.classList.remove("is-live");
  }
  // (the audio element is made further down: the listeners are attached once the script has run)
  setTimeout(() => {
    audio.addEventListener("play", syncViz);
    audio.addEventListener("pause", () => { const c = $("mymix-card"); if (c) c.classList.remove("is-live"); });
  }, 0);
  // a press on the button: it squishes, a wave goes out from where the finger is, the phone answers
  document.addEventListener("pointerdown", (e) => {
    const btn = e.target.closest && e.target.closest("#mymix-play-btn");
    if (!btn) return;
    haptic("medium");
  }, { passive: true });

  // «Обновить»: a new mix instead of the kept one
  let mixRefreshing = false;
  async function refreshMymix() {
    if (mixRefreshing) return;
    const known = knownTracks();
    if (!known.size) { showToast("Отметь пару треков сердцем — и микс подберёт похожее"); return; }
    mixRefreshing = true;
    const btn = $("mymix-refresh-btn"), card = $("mymix-card");
    btn.classList.add("is-spinning");
    card.classList.add("is-building");
    try {
      delete mixResume.mymix;
      try { localStorage.setItem(MIX_RESUME_KEY, JSON.stringify(mixResume)); } catch (e) { /* not kept */ }
      const mix = await buildMix();
      if (!mix.length) { showToast("Не получилось собрать микс, попробуй ещё раз"); return; }
      haptic("success");
      shuffleOn = false;
      playTrack(mix[0], mix, { mymix: true, source: "mix", mixKey: "mymix" });
      mixArtKey = "";
      paintMixArt();
      showToast("Новый микс собран");
    } finally {
      card.classList.remove("is-building");
      btn.classList.remove("is-spinning");
      mixRefreshing = false;
    }
  }
  async function startMymix(openPlayer) {
    const known = knownTracks();
    if (!known.size) { showToast("Отметь пару треков сердцем или собери плейлист — и микс подберёт похожее"); return; }
    const saved = mixResumeFor("mymix");
    if (saved) {
      resumeMix("mymix", saved);
      if (openPlayer) showScreen("player");
      return;
    }
    const card = $("mymix-card");
    card.classList.add("is-building");
    let mix;
    try { mix = await buildMix(); } finally { card.classList.remove("is-building"); }
    if (!mix.length) { showToast("Не получилось собрать микс, попробуй ещё раз"); return; }
    shuffleOn = false;
    playTrack(mix[0], mix, { mymix: true, source: "mix", mixKey: "mymix" });
    if (openPlayer) showScreen("player");
  }
  // «Под настроение»: the mix grown from the listener's own music. Three
  // moods and the genres are free; the other five are Нотка Плюс, and
  // without it they give three tracks to taste.
  const MOODS = { energize: "Бодрое", chill: "Спокойное", focus: "Для работы", sad: "Грустное", party: "Вечеринка", sleep: "Для сна", workout: "Спорт", romance: "Романтика", ru_pop: "Русский поп", ru_rock: "Русский рок", ru_hiphop: "Русский хип-хоп" };
  const FREE_MOODS = new Set(["energize", "chill", "focus", "ru_pop", "ru_rock", "ru_hiphop"]);
  document.querySelectorAll("#mood-cloud .mood-orb").forEach((orb, n) => {
    orb.style.setProperty("--n", n);
    if (!FREE_MOODS.has(orb.dataset.mood)) orb.insertAdjacentHTML("beforeend", '<i class="orb-plus" aria-hidden="true">Плюс</i>');
  });

  // What the mix should lean towards: the artists this listener has in
  // their favorites, playlists and listening history, and how much of
  // their music is in Russian. Sent along with the mood.
  function tasteProfile() {
    const weight = new Map();
    let russian = 0, total = 0;
    const add = (t, w) => {
      if (!t) return;
      total++;
      if (/[а-яё]/i.test(`${t.title || ""} ${t.artist || ""}`)) russian++;
      (t.artist || "").split(/,|&| feat\.? /i).forEach((name) => {
        name = name.trim();
        if (name) weight.set(name, (weight.get(name) || 0) + w);
      });
    };
    state.favorites.forEach((t) => add(t, 3));
    state.playlists.forEach((p) => Object.values(p.tracksCache || {}).forEach((t) => add(t, 1)));
    Object.values(listensView().tracks).forEach((x) => add(x.track, 1 + Math.min(5, x.plays)));
    // their own tracks, the dearest first: the favorites, then what is played most, then the playlists
    const seeds = [];
    const taken = new Set();
    const seed = (t) => {
      if (!t || !t.source || !t.sourceId || taken.has(t.id) || seeds.length >= 40) return;
      taken.add(t.id);
      seeds.push({ source: t.source, id: t.sourceId, artist: String(t.artist || "").slice(0, 80) });
    };
    state.favorites.forEach(seed);
    Object.values(listensView().tracks).sort((a, b) => b.plays - a.plays || b.seconds - a.seconds).forEach((x) => seed(x.track));
    state.playlists.forEach((p) => Object.values(p.tracksCache || {}).forEach(seed));
    return {
      seeds,
      artists: Array.from(weight.entries()).sort((a, b) => b[1] - a[1]).slice(0, 40).map((e) => e[0]),
      ru_share: mixLang === "ru" ? 0.97 : mixLang === "world" ? 0.03 : (total >= 5 ? russian / total : null),
    };
  }

  let moodBuilding = false;
  async function startMoodMix(key, picked) {
    if (moodBuilding) return;
    if (hasPlus() || FREE_MOODS.has(key)) {
      const saved = mixResumeFor(`mood:${key}`);
      if (saved) {
        haptic("success");
        resumeMix(`mood:${key}`, saved);
        if (currentScreen === "mood") goBack();
        return;
      }
    }
    moodBuilding = true;
    const screen = $("screen-mood");
    screen.classList.add("is-picking");
    if (picked) picked.classList.add("is-picked");
    let tracks = [];
    try {
      const res = await fetch(`${API_BASE_URL}/mood`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.assign({ key }, tasteProfile())),
      });
      if (res.ok) tracks = (await res.json()).results || [];
    } catch (e) { /* said below */ }
    moodBuilding = false;
    screen.classList.remove("is-picking");
    if (picked) picked.classList.remove("is-picked");
    if (!tracks.length) { haptic("error"); showToast("Не получилось собрать микс, попробуй ещё раз"); return; }
    shuffleOn = false;
    haptic("success");
    if (!/^ru_/.test(key)) eventNote("mood", key);
    if (hasPlus() || FREE_MOODS.has(key)) {
      // from here on it goes on like «Мой микс»: more of the same is added as it plays
      playTrack(tracks[0], tracks, { mymix: true, source: "mix", mixKey: `mood:${key}`, context: `Мой микс · ${MOODS[key]}` });
    } else {
      const taste = tracks.slice(0, 3);
      playTrack(taste[0], taste, { source: "mood-taste", context: `${MOODS[key]} · проба` });
      showToast("Три трека на пробу. Это настроение целиком — в Нотке Плюс");
    }
    if (currentScreen === "mood") goBack();
  }
  $("mood-open-btn").addEventListener("click", () => { haptic("light"); showScreen("mood"); });
  $("mood-back-btn").addEventListener("click", goBack);

  // ---- the lights are bodies: they drift, can be dragged and thrown,
  // and bounce off each other and off the edges of their field. A touch
  // that doesn't move is a choice. ----
  const moodCloud = $("mood-cloud");
  const moodOrbs = Array.from(moodCloud.querySelectorAll(".mood-orb"));
  const MOOD_START = [[0.2, 0.2], [0.55, 0.3], [0.84, 0.17], [0.2, 0.62], [0.53, 0.68], [0.84, 0.56], [0.36, 0.92], [0.72, 0.9]];
  let moodBodies = [];
  let moodFrame = 0;
  let moodHeld = null; // the light under the finger
  let moodPointerAt = 0;

  function startMoodPhysics() {
    cancelAnimationFrame(moodFrame);
    moodCloud.classList.add("is-live");
    const W = moodCloud.clientWidth, H = moodCloud.clientHeight;
    moodHeld = null;
    moodBodies = moodOrbs.map((el, i) => {
      const r = el.offsetWidth / 2;
      const start = MOOD_START[i % MOOD_START.length];
      return { el, r, m: r * r, x: start[0] * W, y: start[1] * H, vx: (Math.random() - 0.5) * 70, vy: (Math.random() - 0.5) * 70, phase: Math.random() * 6.28 };
    });
    let last = performance.now();
    const step = (now) => {
      if (currentScreen !== "mood") { moodFrame = 0; return; }
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      const width = moodCloud.clientWidth, height = moodCloud.clientHeight;
      const slow = Math.pow(0.3, dt); // a body keeps 30% of its speed each second
      for (const b of moodBodies) {
        if (moodHeld && moodHeld.body === b) continue;
        // a faint pull to the middle keeps them together; a slow sway keeps them alive
        b.vx += ((width / 2 - b.x) * 0.4 + Math.cos(now / 1700 + b.phase) * 16) * dt;
        b.vy += ((height / 2 - b.y) * 0.4 + Math.sin(now / 1400 + b.phase) * 16) * dt;
        b.vx *= slow;
        b.vy *= slow;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.75; }
        if (b.x > width - b.r) { b.x = width - b.r; b.vx = -Math.abs(b.vx) * 0.75; }
        if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * 0.75; }
        if (b.y > height - b.r) { b.y = height - b.r; b.vy = -Math.abs(b.vy) * 0.75; }
      }
      // two lights that touch push apart and trade speed along the line between them
      for (let i = 0; i < moodBodies.length; i++) {
        for (let j = i + 1; j < moodBodies.length; j++) {
          const a = moodBodies[i], b = moodBodies[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.hypot(dx, dy) || 0.01;
          const overlap = a.r + b.r - dist;
          if (overlap <= 0) continue;
          const nx = dx / dist, ny = dy / dist;
          // the one under the finger doesn't give way
          const ia = moodHeld && moodHeld.body === a ? 0 : 1 / a.m;
          const ib = moodHeld && moodHeld.body === b ? 0 : 1 / b.m;
          if (ia + ib === 0) continue;
          a.x -= nx * overlap * (ia / (ia + ib));
          a.y -= ny * overlap * (ia / (ia + ib));
          b.x += nx * overlap * (ib / (ia + ib));
          b.y += ny * overlap * (ib / (ia + ib));
          const closing = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (closing >= 0) continue;
          const push = (-(1 + 0.86) * closing) / (ia + ib);
          a.vx -= push * ia * nx;
          a.vy -= push * ia * ny;
          b.vx += push * ib * nx;
          b.vy += push * ib * ny;
          if (moodHeld && closing < -260 && now - moodHeld.knockAt > 140) { moodHeld.knockAt = now; haptic("light"); }
        }
      }
      for (const b of moodBodies) b.el.style.transform = `translate(${(b.x - b.r).toFixed(1)}px, ${(b.y - b.r).toFixed(1)}px)`;
      moodFrame = requestAnimationFrame(step);
    };
    moodFrame = requestAnimationFrame(step);
  }

  moodCloud.addEventListener("pointerdown", (e) => {
    const el = e.target.closest(".mood-orb");
    const body = el && moodBodies.find((b) => b.el === el);
    if (!body || moodBuilding) return;
    const box = moodCloud.getBoundingClientRect();
    const px = e.clientX - box.left, py = e.clientY - box.top;
    moodHeld = { body, id: e.pointerId, dx: px - body.x, dy: py - body.y, startX: px, startY: py, moved: false, lastX: px, lastY: py, lastT: performance.now(), knockAt: 0 };
    el.classList.add("is-held");
    try { moodCloud.setPointerCapture(e.pointerId); } catch (err) { /* works without capture too */ }
  });
  moodCloud.addEventListener("pointermove", (e) => {
    if (!moodHeld || e.pointerId !== moodHeld.id) return;
    const h = moodHeld, b = h.body;
    const box = moodCloud.getBoundingClientRect();
    const px = e.clientX - box.left, py = e.clientY - box.top;
    if (!h.moved && Math.hypot(px - h.startX, py - h.startY) < 8) return;
    h.moved = true;
    const now = performance.now();
    const dt = Math.max(0.008, (now - h.lastT) / 1000);
    // the speed of the finger becomes the speed of the light: what it hits is knocked away, and letting go throws it
    b.vx = b.vx * 0.5 + ((px - h.lastX) / dt) * 0.5;
    b.vy = b.vy * 0.5 + ((py - h.lastY) / dt) * 0.5;
    b.x = Math.max(b.r, Math.min(box.width - b.r, px - h.dx));
    b.y = Math.max(b.r, Math.min(box.height - b.r, py - h.dy));
    h.lastX = px; h.lastY = py; h.lastT = now;
  });
  const releaseMoodOrb = (e) => {
    if (!moodHeld || e.pointerId !== moodHeld.id) return;
    const h = moodHeld;
    moodHeld = null;
    moodPointerAt = Date.now();
    h.body.el.classList.remove("is-held");
    const speed = Math.hypot(h.body.vx, h.body.vy);
    if (speed > 1500) { h.body.vx *= 1500 / speed; h.body.vy *= 1500 / speed; }
    if (!h.moved && e.type === "pointerup") { haptic("light"); startMoodMix(h.body.el.dataset.mood, h.body.el); }
  };
  moodCloud.addEventListener("pointerup", releaseMoodOrb);
  moodCloud.addEventListener("pointercancel", releaseMoodOrb);

  $("screen-mood").addEventListener("click", (e) => {
    const pick = e.target.closest(".mood-orb, .mood-genre");
    if (!pick) return;
    // a light touched with a finger has already been handled above; this is for the keyboard and the genres
    if (pick.classList.contains("mood-orb") && Date.now() - moodPointerAt < 600) return;
    haptic("light");
    startMoodMix(pick.dataset.mood, pick);
  });

  $("mymix-open-btn").addEventListener("click", () => {
    if (mymixActive && currentTrack) showScreen("player");
    else startMymix(false);
  });
  $("mymix-play-btn").addEventListener("click", () => {
    if (mymixActive && currentTrack) togglePlayPause();
    else startMymix(false);
  });
  $("mymix-refresh-btn").addEventListener("click", () => { haptic("light"); refreshMymix(); });

  // ============================================================
  // SEARCH
  // ============================================================
  const searchInput = $("search-input");
  const searchClear = $("search-clear");
  const SEARCH_STATES = ["search-state-empty", "search-state-loading", "search-state-empty-results", "search-state-error", "search-state-results"];
  const stateResults = $("search-state-results");
  let debounceTimer = null;
  let lastSearchResults = null; // raw track results from backend, for the active query
  let lastSearchArtists = null; // artists (with photos) found for the same query
  let lastSearchQuery = "";
  let searchTab = "all"; // all | tracks | artists | albums
  let searchToken = 0;

  // A spelling-proof key for comparing a typed name with an artist's name:
  // «тревис скотт», «travis scott» and «trevis skot» all become «trvskt».
  // Vowels, spaces and doubled letters are dropped, Cyrillic is
  // transliterated, so a half-typed «тревис ск» is a prefix of the key.
  const TRANSLIT = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "j", з: "z", и: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "z", ч: "c", ш: "s", щ: "s", ъ: "", ы: "i", ь: "", э: "e", ю: "u", я: "a" };
  function looseKey(text) {
    let s = String(text || "").toLowerCase().replace(/[а-яё]/g, (ch) => TRANSLIT[ch] || "");
    s = s.replace(/ph/g, "f").replace(/ck/g, "k").replace(/sh|ch|zh|kh/g, (m) => m[0]).replace(/c/g, "k").replace(/x/g, "ks").replace(/w/g, "v");
    s = s.replace(/[^a-z0-9]/g, "").replace(/[aeiouyh]/g, "");
    return s.replace(/(.)\1+/g, "$1");
  }
  // The artist the query is evidently about («тревис ск» → Travis Scott), or null.
  function intentArtist() {
    const q = looseKey(lastSearchQuery);
    if (q.length < 3 || !lastSearchArtists || !lastSearchArtists.length) return null;
    const exact = lastSearchArtists.find((a) => looseKey(a.name) === q);
    if (exact) return exact;
    return lastSearchArtists.find((a) => looseKey(a.name).startsWith(q)) || null;
  }
  // Tracks of the intended artist go first; the rest keep their order.
  function rankByIntent(tracks, artist) {
    if (!artist) return tracks;
    const key = looseKey(artist.name);
    const mine = [], rest = [];
    tracks.forEach((t) => (looseKey(t.artist || "") === key ? mine : rest).push(t));
    return mine.length ? mine.concat(rest) : tracks;
  }

  // <taste>
  // What the listener already likes, per artist name (0..1): listening time (every device),
  // hearts, playlists, what is followed and played lately. Used to put familiar artists first
  // in the search; it never leaves the device (and the account's own sync).
  function artistParts(name) {
    return String(name || "").split(/\s*(?:,|&|\sfeat\.?\s|\sft\.?\s|\sx\s|\sи\s)\s*/i).map((p) => looseKey(p)).filter(Boolean);
  }
  function buildTaste(sources) {
    const raw = new Map();
    const add = (name, w) => artistParts(name).forEach((k) => raw.set(k, (raw.get(k) || 0) + w));
    Object.entries(sources.listened || {}).forEach(([name, minutes]) => add(name, Math.min(3, Math.log10(1 + (minutes || 0)) * 1.5)));
    (sources.favorites || []).forEach((t) => add(t && t.artist, 0.8));
    (sources.followed || []).forEach((n) => add(n, 3));
    (sources.playlistTracks || []).forEach((t) => add(t && t.artist, 0.3));
    (sources.recent || []).forEach((t) => add(t && t.artist, 0.4));
    const out = new Map();
    raw.forEach((v, k) => out.set(k, v / (v + 2))); // 0..1, and a lot of listening cannot run away
    return out;
  }
  function tasteOf(taste, artistName) {
    let best = 0;
    artistParts(artistName).forEach((k) => { const v = taste.get(k); if (v && v > best) best = v; });
    return best;
  }
  // a familiar artist's tracks climb up to a dozen places; everything else keeps its order
  function rankByTasteWith(taste, tracks) {
    if (!taste.size || tracks.length < 2) return tracks;
    return tracks
      .map((t, i) => ({ t, s: i - 12 * tasteOf(taste, t.artist) }))
      .sort((a, b) => a.s - b.s)
      .map((x) => x.t);
  }
  // </taste>
  let tasteCache = null, tasteSig = "";
  function currentTaste() {
    const sig = [listensRev, state.favorites.length, state.followedArtists.length, state.playlists.length, (state.recent || []).length].join("|");
    if (tasteCache && sig === tasteSig) return tasteCache;
    const L = listensView() || {};
    const listened = {};
    Object.entries(L.artists || {}).forEach(([name, a]) => { listened[name] = (a.seconds || 0) / 60; });
    const playlistTracks = [];
    state.playlists.forEach((p) => Object.values(p.tracksCache || {}).forEach((t) => playlistTracks.push(t)));
    tasteCache = buildTaste({ listened, favorites: state.favorites, followed: state.followedArtists, playlistTracks, recent: (state.recent || []).slice(0, 60) });
    tasteSig = sig;
    return tasteCache;
  }
  function rankByTaste(tracks, intent) {
    const taste = currentTaste();
    if (!intent) return rankByTasteWith(taste, tracks);
    // the artist the query names stays in front; the taste orders each part
    const key = looseKey(intent.name);
    const mine = tracks.filter((t) => looseKey(t.artist || "") === key);
    const rest = tracks.filter((t) => looseKey(t.artist || "") !== key);
    return rankByTasteWith(taste, mine).concat(rankByTasteWith(taste, rest));
  }

  // ---- «Недавнее»: what was searched, and what was opened from the results ----
  const SEARCH_HISTORY_MAX = 30;
  function historyKey(e) {
    if (e.k === "q") return "q:" + String(e.text || "").trim().toLowerCase();
    if (e.k === "t") return "t:" + (e.track && e.track.id);
    if (e.k === "a") return "a:" + String(e.name || "").trim().toLowerCase();
    return "al:" + (e.albumId || `${e.title}|${e.artist}`);
  }
  function rememberSearch(entry) {
    if (!entry) return;
    entry.at = Date.now();
    const key = historyKey(entry);
    state.searchHistory = [entry].concat((state.searchHistory || []).filter((e) => historyKey(e) !== key)).slice(0, SEARCH_HISTORY_MAX);
    persist();
  }
  function historyRow(o) {
    const li = document.createElement("li");
    li.className = "track-row";
    const main = document.createElement("button");
    main.type = "button";
    main.className = "row-main";
    const art = document.createElement("span");
    art.className = "cover cover-sm" + (o.round ? " cover-round" : "") + (o.query ? " cover-query" : "");
    if (o.query) art.innerHTML = icon("i-search", 20);
    else setCoverEl(art, o.cover, o.seed);
    const meta = document.createElement("span");
    meta.className = "row-meta";
    meta.innerHTML = `<span class="row-title">${escapeHtml(o.title)}</span><span class="row-sub">${escapeHtml(o.sub)}</span>`;
    main.appendChild(art);
    main.appendChild(meta);
    main.addEventListener("click", o.onClick);
    li.appendChild(main);
    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "icon-btn row-action";
    rm.setAttribute("aria-label", "Убрать из недавнего");
    rm.innerHTML = icon("i-close", 20);
    rm.addEventListener("click", (e) => {
      e.stopPropagation();
      state.searchHistory = (state.searchHistory || []).filter((x) => x !== o.entry);
      persist();
      renderSearchHistory();
    });
    li.appendChild(rm);
    return li;
  }
  function renderSearchHistory() {
    const box = $("search-history");
    const list = $("search-history-list");
    if (!box || !list) return;
    const items = state.searchHistory || [];
    list.innerHTML = "";
    box.hidden = !items.length;
    $("search-state-empty").classList.toggle("has-history", items.length > 0);
    items.forEach((e) => {
      let row = null;
      if (e.k === "q") {
        row = historyRow({ entry: e, query: true, title: e.text, sub: "Запрос", onClick: () => {
          searchInput.value = e.text;
          searchClear.hidden = false;
          clearTimeout(debounceTimer);
          runSearch(e.text);
          rememberSearch({ k: "q", text: e.text });
        } });
      } else if (e.k === "t" && e.track) {
        row = historyRow({ entry: e, cover: e.track.artwork, seed: e.track.id, title: e.track.title || "Без названия", sub: `Трек · ${e.track.artist || ""}`, onClick: () => {
          rememberSearch({ k: "t", track: e.track });
          playTrack(e.track, [e.track], { context: "Поиск" });
        } });
      } else if (e.k === "a") {
        row = historyRow({ entry: e, round: true, cover: e.photo, seed: e.name, title: e.name, sub: "Исполнитель", onClick: () => {
          rememberSearch({ k: "a", name: e.name, artistId: e.artistId, source: e.source, photo: e.photo });
          openArtistScreen(e.name, [], { artistId: e.artistId, source: e.source });
        } });
      } else if (e.k === "al") {
        row = historyRow({ entry: e, cover: e.cover, seed: e.albumId || e.artist, title: e.title, sub: `Альбом · ${e.artist || ""}`, onClick: () => {
          rememberSearch({ k: "al", albumId: e.albumId, source: e.source, title: e.title, artist: e.artist, cover: e.cover });
          if (e.albumId) openAlbumById(e.source, e.albumId, e.title, e.artist);
        } });
      }
      if (row) list.appendChild(row);
    });
  }

  function showSearchState(id) {
    SEARCH_STATES.forEach((sid) => { $(sid).hidden = sid !== id; });
    if (id === "search-state-empty") renderSearchHistory();
  }

  $("search-tabs").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-tab]");
    if (!chip) return;
    searchTab = chip.dataset.tab;
    document.querySelectorAll("#search-tabs [data-tab]").forEach((el) => {
      const on = el === chip;
      el.classList.toggle("active", on);
      el.setAttribute("aria-selected", on ? "true" : "false");
    });
    haptic("select");
    renderFilteredResults();
  });

  // Group tracks by artist name to approximate "Исполнители" results.
  // Tracks that carry a real artistId (youtube_music) keep it on the group
  // so the artist screen can load real metadata; tracks without one
  // (soundcloud / youtube_web fallback) still group by name only — an
  // honest client-side simplification for those sources (see README).
  function groupByArtist(tracks) {
    const map = new Map();
    tracks.forEach((t) => {
      const name = t.artist || "Неизвестный исполнитель";
      if (!map.has(name)) map.set(name, { name, tracks: [], artistId: null, source: null, artwork: null });
      const group = map.get(name);
      group.tracks.push(t);
      if (!group.artistId && t.artistId) {
        group.artistId = t.artistId;
        group.source = t.source;
      }
    });
    return Array.from(map.values());
  }

  // Group tracks by real albumId when present (youtube_music); tracks
  // without one fall back to a per-artist pseudo-album grouping.
  function groupByAlbum(tracks) {
    const byId = new Map();
    const byArtistFallback = new Map();
    tracks.forEach((t) => {
      if (t.albumId) {
        if (!byId.has(t.albumId)) {
          byId.set(t.albumId, {
            albumId: t.albumId,
            source: t.source,
            title: t.album || t.title,
            artist: t.artist,
            artistId: t.artistId,
            cover: t.artwork,
            tracks: [],
          });
        }
        byId.get(t.albumId).tracks.push(t);
      } else {
        const name = t.artist || "Неизвестный исполнитель";
        if (!byArtistFallback.has(name)) {
          byArtistFallback.set(name, { albumId: null, source: null, title: t.title, artist: name, artistId: null, cover: t.artwork, tracks: [] });
        }
        byArtistFallback.get(name).tracks.push(t);
      }
    });
    return [...byId.values(), ...byArtistFallback.values()];
  }

  function groupRow(opts) {
    const li = document.createElement("li");
    li.className = "track-row";
    const main = document.createElement("button");
    main.type = "button";
    main.className = "row-main";
    const art = document.createElement("span");
    art.className = "cover cover-sm" + (opts.round ? " cover-round" : "");
    setCoverEl(art, opts.cover, opts.seed);
    const meta = document.createElement("span");
    meta.className = "row-meta";
    meta.innerHTML = `<span class="row-title">${escapeHtml(opts.title)}</span><span class="row-sub">${escapeHtml(opts.sub)}</span>`;
    const chev = document.createElement("span");
    chev.className = "row-time";
    chev.innerHTML = `<svg class="row-chevron" width="20" height="20" aria-hidden="true"><use href="#i-chevron"/></svg>`;
    main.appendChild(art);
    main.appendChild(meta);
    main.appendChild(chev);
    main.addEventListener("click", opts.onClick);
    li.appendChild(main);
    return li;
  }

  // Artists for a query: the ones the artist search found (with their
  // photos), those who also appear among the found tracks first; then the
  // artists that only the tracks mention, shown with a cover of theirs.
  function searchArtists(tracks) {
    const norm = (name) => name.trim().toLowerCase();
    const groups = groupByArtist(tracks);
    const found = (lastSearchArtists || []).map((a) => {
      const own = groups.find((g) => norm(g.name) === norm(a.name));
      return { name: a.name, artistId: a.id, source: a.source, photo: a.photo, tracks: own ? own.tracks : [] };
    });
    const seen = new Set(found.map((a) => norm(a.name)));
    const taste = currentTaste();
    found.sort((a, b) => ((b.tracks.length ? 1 : 0) + tasteOf(taste, b.name)) - ((a.tracks.length ? 1 : 0) + tasteOf(taste, a.name)));
    const intent = intentArtist();
    if (intent) {
      const i = found.findIndex((a) => a.artistId === intent.id);
      if (i > 0) found.unshift(found.splice(i, 1)[0]);
    }
    const rest = groups.filter((g) => !seen.has(norm(g.name)));
    rest.sort((a, b) => tasteOf(taste, b.name) - tasteOf(taste, a.name));
    return found.concat(rest);
  }
  function artistRow(group, tracks) {
    const ownCover = group.tracks.find((t) => t.artwork);
    return groupRow({
      title: group.name,
      // how many tracks an artist has is not known here — the number of
      // their tracks that happened to be found says nothing, so none is shown
      sub: "Исполнитель",
      cover: group.photo || (ownCover ? ownCover.artwork : null),
      seed: group.name,
      round: true,
      onClick: () => {
        rememberSearch({ k: "a", name: group.name, artistId: group.artistId, source: group.source, photo: group.photo || (ownCover ? ownCover.artwork : null) });
        track("search_pick", { q: (lastSearchQuery || "").trim().slice(0, 80), kind: "artist" });
        openArtistScreen(group.name, tracks, { artistId: group.artistId, source: group.source });
      },
    });
  }
  function albumRow(group) {
    const isReal = !!group.albumId;
    return groupRow({
      title: group.title,
      sub: `${isReal ? "Альбом" : "Похожие треки"} · ${group.artist}`,
      cover: group.cover,
      seed: group.albumId || group.artist,
      onClick: () => {
        rememberSearch({ k: "al", albumId: group.albumId, source: group.source, title: group.title, artist: group.artist, cover: group.cover });
        track("search_pick", { q: (lastSearchQuery || "").trim().slice(0, 80), kind: "album" });
        if (group.albumId) openAlbumById(group.source, group.albumId, group.title, group.artist);
        else openAlbumScreen(group.tracks[0]);
      },
    });
  }

  function resultsSection(title, rows) {
    const section = document.createElement("section");
    section.className = "results-section";
    if (title) {
      const h = document.createElement("h2");
      h.className = "h2";
      h.textContent = title;
      section.appendChild(h);
    }
    const ul = document.createElement("ul");
    ul.className = "track-list";
    rows.forEach((r) => ul.appendChild(r));
    section.appendChild(ul);
    return section;
  }

  // While the listener looks at the results, the server makes the first ones ready: a tap then starts
  // them at once. Once the typing has paused, the first two, each only once.
  const warmed = new Set();
  let warmTimer = 0;
  function warmSoon(list) {
    clearTimeout(warmTimer);
    if (!Array.isArray(list) || !list.length || !(lastSearchQuery || "").trim() || lastSearchQuery.trim().length < 3) return;
    if (navigator.connection && navigator.connection.saveData) return;
    warmTimer = setTimeout(() => {
      if (currentScreen !== "search") return;
      list.slice(0, 2).forEach((t) => {
        if (!t || !t.id || !t.source || !t.sourceId || warmed.has(t.id)) return;
        warmed.add(t.id);
        fetch(`${API_BASE_URL}/warm?source=${encodeURIComponent(t.source)}&id=${encodeURIComponent(t.sourceId)}`).catch(() => {});
      });
    }, 900);
  }

  function renderFilteredResults() {
    const intent = intentArtist();
    // the tracks are still on their way, but the artist the query names is
    // already known: show him at once, the rest joins when it arrives
    if (!lastSearchResults && !intent) return;
    const tracks = rankByTaste(rankByIntent(lastSearchResults || [], intent), intent);
    if (lastSearchResults && !tracks.length && !intent) {
      showSearchState("search-state-empty-results");
      const q = lastSearchQuery;
      setTimeout(() => { if (q === lastSearchQuery && q.trim().length >= 3 && lastSearchResults && !lastSearchResults.length) track("search_empty", { q: q.trim().slice(0, 80) }); }, 1500);
      return;
    }

    warmSoon(tracks);
    stateResults.innerHTML = "";
    const trackRows = (list) => list.map((t) => buildTrackRow(t, { queue: tracks, context: "Поиск", heart: true }));
    if (searchTab === "tracks") {
      stateResults.appendChild(resultsSection(null, trackRows(tracks)));
    } else if (searchTab === "artists") {
      stateResults.appendChild(resultsSection(null, searchArtists(tracks).map((g) => artistRow(g, tracks))));
    } else if (searchTab === "albums") {
      stateResults.appendChild(resultsSection(null, groupByAlbum(tracks).map(albumRow)));
    } else {
      // «Все»: when the query is an artist's name, he comes first, then his
      // tracks and albums; otherwise tracks lead as before
      const artistsSection = () => {
        const artists = searchArtists(tracks).slice(0, intent ? 1 : 3);
        if (artists.length) stateResults.appendChild(resultsSection(intent ? "Исполнитель" : "Исполнители", artists.map((g) => artistRow(g, tracks))));
      };
      if (intent) artistsSection();
      // with a named artist, «Треки» holds his tracks; the stray matches go to the end
      const own = intent ? tracks.filter((t) => looseKey(t.artist || "") === looseKey(intent.name)) : [];
      const head = own.length >= 3 ? own.slice(0, 8) : tracks.slice(0, 8);
      const tail = tracks.filter((t) => !head.includes(t));
      if (head.length) stateResults.appendChild(resultsSection("Треки", trackRows(head)));
      if (!intent) artistsSection();
      const albums = groupByAlbum(tracks).filter((a) => a.albumId).slice(0, 3);
      if (albums.length) stateResults.appendChild(resultsSection("Альбомы", albums.map(albumRow)));
      if (tail.length) stateResults.appendChild(resultsSection("Ещё треки", trackRows(tail)));
    }
    showSearchState("search-state-results");
  }

  async function runSearch(query) {
    const token = ++searchToken;
    if (!query.trim()) {
      document.body.classList.remove("search-loading");
      lastSearchResults = null;
      lastSearchArtists = null;
      showSearchState("search-state-empty");
      return;
    }
    showSearchState("search-state-loading");
    document.body.classList.add("search-loading");
    lastSearchArtists = null;
    lastSearchResults = null;
    lastSearchQuery = query;
    // artists are looked up alongside the tracks; they are an addition, so
    // the results don't wait for them long and never fail because of them.
    // If the query is an artist's name, he is shown as soon as he is found.
    const artistsReady = fetch(`${API_BASE_URL}/artists?q=${encodeURIComponent(query)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (token !== searchToken || !data) return;
        lastSearchArtists = data.results || [];
        renderFilteredResults();
      })
      .catch(() => {});
    try {
      const url = `${API_BASE_URL}/search?q=${encodeURIComponent(query)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      await Promise.race([artistsReady, new Promise((done) => setTimeout(done, 800))]);
      if (token !== searchToken) return; // a newer query already won
      document.body.classList.remove("search-loading");
      lastSearchResults = data.results || [];
      renderFilteredResults();
    } catch (err) {
      if (token !== searchToken) return;
      document.body.classList.remove("search-loading");
      console.error(err);
      lastSearchResults = null;
      showSearchState("search-state-error");
    }
  }

  searchInput.addEventListener("input", () => {
    searchClear.hidden = searchInput.value.length === 0;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => runSearch(searchInput.value), 250);
  });
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      clearTimeout(debounceTimer);
      runSearch(searchInput.value);
      searchInput.blur();
      const q = searchInput.value.trim();
      if (q.length >= 2) { rememberSearch({ k: "q", text: q }); track("search_submit", { q: q.slice(0, 80) }); }
    }
  });
  searchClear.addEventListener("click", () => {
    searchInput.value = "";
    searchClear.hidden = true;
    runSearch("");
    searchInput.focus();
  });
  $("search-retry-btn").addEventListener("click", () => runSearch(searchInput.value));
  $("search-history-clear").addEventListener("click", () => {
    state.searchHistory = [];
    persist();
    renderSearchHistory();
    haptic("light");
  });
  // a track played from the results goes to «Недавнее» too
  stateResults.addEventListener("click", (e) => {
    const row = e.target.closest(".track-row[data-track-id]");
    if (!row || e.target.closest(".row-action")) return;
    const t = (lastSearchResults || []).find((x) => x.id === row.dataset.trackId);
    if (t) {
      rememberSearch({ k: "t", track: slimTrack(t) });
      const rank = (lastSearchResults || []).indexOf(t);
      track("search_pick", { q: (lastSearchQuery || "").trim().slice(0, 80), kind: "track", rank, n: (lastSearchResults || []).length });
    }
  });

  // ============================================================
  // LIBRARY («Моё»)
  // ============================================================
  // ============================================================
  // ORIGINALS. While the search hid the labels' releases, fan remakes got saved in their place; they
  // keep their old id. The server finds the real song under strict rules, the listener confirms.
  // ============================================================
  const ORIG_CHECKED_KEY = "notka_orig_checked";
  const ORIG_PROPOSALS_KEY = "notka_orig_props";
  const ORIG_SCAN_KEY = "notka_orig_scan";
  const lsGet = (k, fallback) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fallback : v; } catch (e) { return fallback; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* a nicety */ } };
  let originalsProposals = lsGet(ORIG_PROPOSALS_KEY, {}); // old id -> { old, neu }
  let originalsScanning = false;

  function savedTracksForScan() {
    const seen = new Map();
    const add = (t) => { if (t && t.id && t.source === "youtube_music" && t.sourceId && !seen.has(t.id)) seen.set(t.id, t); };
    (state.favorites || []).forEach(add);
    (state.playlists || []).forEach((p) => Object.values(p.tracksCache || {}).forEach(add));
    return [...seen.values()];
  }
  async function scanOriginals() {
    if (originalsScanning) return;
    const last = lsGet(ORIG_SCAN_KEY, 0);
    if (Date.now() - last < 6 * 3600 * 1000) return;
    originalsScanning = true;
    try {
      const checked = new Set(lsGet(ORIG_CHECKED_KEY, []));
      const todo = savedTracksForScan().filter((t) => !checked.has(t.id)).slice(0, 120);
      for (let i = 0; i < todo.length; i += 12) {
        const batch = todo.slice(i, i + 12);
        let data = null;
        try {
          const res = await fetch(`${API_BASE_URL}/originals`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ tracks: batch.map((t) => ({ id: t.id, source: t.source, sourceId: t.sourceId, title: t.title, artist: t.artist, artistId: t.artistId || null, duration: t.duration || null })) }),
          });
          if (!res.ok) break;
          data = await res.json();
        } catch (e) { break; }
        const found = (data && data.replacements) || {};
        const retry = new Set((data && data.retry) || []);
        batch.forEach((t) => {
          if (!retry.has(t.id)) checked.add(t.id); // a request that failed is asked again later
          if (found[t.id] && found[t.id].id && found[t.id].id !== t.id) originalsProposals[t.id] = { old: t, neu: found[t.id] };
        });
        lsSet(ORIG_CHECKED_KEY, [...checked].slice(-3000));
        lsSet(ORIG_PROPOSALS_KEY, originalsProposals);
        renderOriginalsCard();
        await new Promise((r) => setTimeout(r, 400));
      }
      lsSet(ORIG_SCAN_KEY, Date.now());
    } finally { originalsScanning = false; }
  }
  function renderOriginalsCard() {
    const card = $("originals-card");
    if (!card) return;
    const n = Object.keys(originalsProposals).length;
    card.hidden = n === 0;
    if (n) $("originals-card-title").textContent = `Нашли оригиналы для ${n} ${plural(n, "трека", "треков", "треков")}`;
  }
  function openOriginalsSheet() {
    const list = $("originals-list");
    list.innerHTML = "";
    Object.entries(originalsProposals).forEach(([oldId, p]) => {
      const li = document.createElement("li");
      li.className = "originals-item";
      const label = document.createElement("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = true;
      box.dataset.oldId = oldId;
      const text = document.createElement("span");
      text.className = "originals-text";
      const now = document.createElement("b");
      now.textContent = `${p.neu.artist || ""} — ${p.neu.title || ""}`;
      const was = document.createElement("i");
      was.className = "was";
      was.textContent = `Сейчас: ${p.old.artist || ""} — ${p.old.title || ""}`;
      text.appendChild(now);
      text.appendChild(was);
      label.appendChild(box);
      label.appendChild(text);
      li.appendChild(label);
      list.appendChild(li);
    });
    openOverlay("originals-sheet");
  }
  function applyOriginals(ids) {
    let done = 0;
    ids.forEach((oldId) => {
      const p = originalsProposals[oldId];
      if (!p) return;
      const neu = p.neu;
      const swapList = (arr) => {
        const i = arr.findIndex((t) => t && t.id === oldId);
        if (i < 0) return false;
        if (arr.some((t) => t && t.id === neu.id)) arr.splice(i, 1); else arr[i] = neu;
        return true;
      };
      let touched = swapList(state.favorites || []);
      if (state.recent) touched = swapList(state.recent) || touched;
      (state.playlists || []).forEach((pl) => {
        const idx = (pl.trackIds || []).indexOf(oldId);
        if (idx < 0) return;
        if (pl.trackIds.includes(neu.id)) pl.trackIds.splice(idx, 1); else pl.trackIds[idx] = neu.id;
        pl.tracksCache = pl.tracksCache || {};
        delete pl.tracksCache[oldId];
        pl.tracksCache[neu.id] = neu;
        touched = true;
      });
      if (touched) done++;
    });
    return done;
  }
  $("originals-card").addEventListener("click", openOriginalsSheet);
  $("originals-skip").addEventListener("click", () => {
    originalsProposals = {};
    lsSet(ORIG_PROPOSALS_KEY, {});
    renderOriginalsCard();
    closeOverlay("originals-sheet");
  });
  $("originals-apply").addEventListener("click", () => {
    const ids = [...document.querySelectorAll("#originals-list input:checked")].map((b) => b.dataset.oldId);
    const done = applyOriginals(ids);
    originalsProposals = {};
    lsSet(ORIG_PROPOSALS_KEY, {});
    if (done) persist();
    closeOverlay("originals-sheet");
    renderOriginalsCard();
    renderLibrary();
    haptic("select");
    showToast(done ? `Заменили: ${done}` : "Ничего не поменяли");
  });

  function renderLibrary() {
    if (isDesktop()) renderSidebar();
    renderOriginalsCard();
    setTimeout(scanOriginals, 1500);
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
    const favs = isGroupedByAlbum("fav") ? albumOrder(state.favorites) : state.favorites;
    fillTrackList(list, favs, "fav", (track) => buildTrackRow(track, { queue: favs, context: "Любимые треки" }));
    $("favorites-group-btn").setAttribute("aria-pressed", isGroupedByAlbum("fav") ? "true" : "false");
    updateSourceButtons();
  }
  // «По альбомам»: a view of a list with the tracks of one album gathered under the album's name (the list itself keeps its order)
  const GROUP_KEY = "notka_group_albums";
  const groupModes = (() => { try { return new Set(JSON.parse(localStorage.getItem(GROUP_KEY) || "[]")); } catch (e) { return new Set(); } })();
  const isGroupedByAlbum = (key) => groupModes.has(key);
  function toggleGroupByAlbum(key) {
    if (groupModes.has(key)) groupModes.delete(key); else groupModes.add(key);
    try { localStorage.setItem(GROUP_KEY, JSON.stringify([...groupModes].slice(-60))); } catch (e) { /* ignore */ }
    haptic("select");
    showToast(groupModes.has(key) ? "Треки собраны по альбомам" : "Обычный порядок");
  }
  const albumKeyOf = (t) => (t.album || "").trim().toLowerCase();
  function albumOrder(tracks) {
    const groups = new Map();
    tracks.forEach((t) => {
      const k = albumKeyOf(t) || " ";
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(t);
    });
    // albums by where they first appear; the tracks without an album stay at the end
    const keys = [...groups.keys()].sort((a, b) => (a === " ") - (b === " "));
    return keys.flatMap((k) => groups.get(k));
  }
  function fillTrackList(list, tracks, key, build) {
    let last = null;
    const grouped = isGroupedByAlbum(key);
    tracks.forEach((track) => {
      if (grouped) {
        const k = albumKeyOf(track) || " ";
        if (k !== last) {
          last = k;
          const count = tracks.filter((t) => (albumKeyOf(t) || " ") === k).length;
          const h = document.createElement("li");
          h.className = "album-group";
          h.innerHTML = `<span class="album-group-name"></span><span class="album-group-count"></span>`;
          h.firstChild.textContent = track.album || "Без альбома";
          h.lastChild.textContent = pluralTracks(count);
          list.appendChild(h);
        }
      }
      list.appendChild(build(track));
    });
  }
  $("favorites-group-btn").addEventListener("click", () => { toggleGroupByAlbum("fav"); renderFavoritesScreen(); });
  $("playlist-group-btn").addEventListener("click", () => { toggleGroupByAlbum(`pl:${currentPlaylistId}`); openPlaylist(currentPlaylistId, true); });
  $("favorites-back-btn").addEventListener("click", goBack);
  $("favorites-play-btn").addEventListener("click", () => playOrToggle("fav", state.favorites, "Любимые треки"));
  $("favorites-shuffle-btn").addEventListener("click", () => shuffleOrToggle("fav"));

  // ============================================================
  // PLAYLIST DETAIL
  // ============================================================
  let currentPlaylistId = null;

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
    const grouped = isGroupedByAlbum(`pl:${playlistId}`);
    const shown = grouped ? albumOrder(tracks) : tracks;
    let n = 0;
    fillTrackList(list, shown, `pl:${playlistId}`, (track) => buildTrackRow(track, { index: ++n, queue: shown, context: playlist.name, heart: true }));
    $("playlist-group-btn").setAttribute("aria-pressed", grouped ? "true" : "false");
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
    shuffleOrToggle(`pl:${currentPlaylistId}`);
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
  // really reorder the playlist (for good), unlike the «Вперемешку» mode
  $("menu-shuffle-order").addEventListener("click", () => {
    closeOverlay("playlist-menu-sheet");
    const tracks = Store.getPlaylistTracks(currentPlaylistId);
    if (tracks.length < 2) { showToast("Мало треков"); return; }
    Store.reorderPlaylist(currentPlaylistId, shuffled(tracks).map((t) => t.id));
    openPlaylist(currentPlaylistId, true);
    haptic("medium");
    showToast("Порядок в плейлисте перемешан");
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
  const SOURCE_CODES = { youtube_music: "ym", soundcloud: "sc", youtube_web: "yw", itunes: "it" };
  const CODE_SOURCES = Object.fromEntries(Object.entries(SOURCE_CODES).map(([k, v]) => [v, k]));
  let botUsername = null;
  async function getBotUsername() {
    if (botUsername) return botUsername;
    const res = await fetch(`${API_BASE_URL}/bot-info`);
    if (!res.ok) throw new Error("bot-info");
    botUsername = (await res.json()).username;
    return botUsername;
  }
  let shareState = null;
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
  let addTracksDebounce = null;
  let addTracksToken = 0;
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
            Store.addTrackToPlaylist(currentPlaylistId, t, !!Store.getSetting("playlistAddToStart"));
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
  let editShredder = null;
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

  // ============================================================
  // PROFILE
  // ============================================================
  function displayName() {
    if (Store.getAccountName()) return Store.getAccountName();
    if (tgUser) return [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") || tgUser.username || "Гость";
    return "Гость";
  }
  function renderAvatarInto(elId, initialId) {
    const el = $(elId);
    if (!el) return;
    const name = displayName();
    const photo = Store.getAccountAvatar() || (tgUser && tgUser.photo_url) || null;
    el.innerHTML = "";
    if (photo) {
      const img = document.createElement("img");
      img.src = photo;
      img.alt = "";
      el.appendChild(img);
    } else {
      const span = document.createElement("span");
      span.id = initialId;
      span.textContent = name.trim().charAt(0).toUpperCase() || "Н";
      el.appendChild(span);
    }
  }
  async function changeAccountAvatar() {
    const dataUrl = await pickAvatarImage();
    if (!dataUrl) return;
    Store.setAccountAvatar(dataUrl);
    renderProfile();
    renderAccountScreen();
  }
  $("account-avatar-edit-btn").addEventListener("click", changeAccountAvatar);

  function renderProfile() {
    $("profile-name").textContent = displayName();
    $("profile-sub").textContent = tgUser && tgUser.username ? `@${tgUser.username}` : (tgUser ? "Telegram" : "Открой Нотку из Telegram, чтобы войти");
    renderAvatarInto("profile-avatar-btn", "profile-initial");

    // цифры слушателя прямо на профиле; тап открывает статистику
    const S = statsFor("all");
    const heard = S.tracks.length > 0 && S.seconds >= 1;
    const minutes = Math.max(1, Math.round(S.seconds / 60));
    $("profile-stats").classList.toggle("is-empty", !heard);
    if (heard) {
      countUp($("pf-minutes"), minutes);
      countUp($("pf-tracks"), S.tracks.length);
      countUp($("pf-artists"), S.artists.length);
      $("pf-minutes-l").textContent = plural(minutes, "минута", "минуты", "минут");
      $("pf-tracks-l").textContent = plural(S.tracks.length, "трек", "трека", "треков");
      $("pf-artists-l").textContent = plural(S.artists.length, "исполнитель", "исполнителя", "исполнителей");
    }

    // под каждым пунктом то, что в нём сейчас выбрано
    const crossfade = Store.getSetting("crossfade") || 0;
    const atmo = lookValue("atmo");
    const theme = PLAYER_THEMES[lookValue("playerTheme")];
    $("pf-sub-account").textContent = `${displayName()}${tgUser && tgUser.username ? ` · @${tgUser.username}` : ""}`;
    $("pf-sub-stats").textContent = heard ? `${minutes.toLocaleString("ru-RU")} ${plural(minutes, "минута", "минуты", "минут")} за всё время` : "Пока тихо";
    $("pf-sub-look").textContent = `${atmo === "none" ? "Без атмосферы" : (ATMOS[atmo] && ATMOS[atmo].name) || "Атмосфера"} · плеер «${theme ? theme.name : "Стандарт"}»`;
    $("pf-sub-sound").textContent = crossfade ? `Плавный переход ${crossfade} с` : "Плавный переход выключен";
    $("pf-sub-about").textContent = ($("about-version").textContent || "").trim() || "Версия 1.1";
    $("pf-version").textContent = `Нотка · ${($("about-version").textContent || "Версия 1.1").trim().toLowerCase()}`;
  }
  function openSupport() {
    const url = "https://t.me/notka_support";
    if (tg && tg.openTelegramLink) tg.openTelegramLink(url);
    else window.open(url, "_blank");
  }
  $("profile-stats").addEventListener("click", () => showScreen("stats"));
  $("pf-invite").addEventListener("click", () => shareInvite());
  $("pf-support").addEventListener("click", openSupport);
  $("profile-back-btn").addEventListener("click", goBack);
  $("menu-stats").addEventListener("click", () => showScreen("stats"));
  $("menu-account").addEventListener("click", () => showScreen("account"));
  $("menu-sound").addEventListener("click", () => showScreen("sound"));
  $("menu-about").addEventListener("click", () => showScreen("about"));
  $("about-support-btn").addEventListener("click", openSupport);

  // ============================================================
  // ACCOUNT (name/avatar from Telegram, local listening stats)
  // ============================================================
  function renderAccountScreen() {
    $("account-name").textContent = displayName();
    renderAvatarInto("account-avatar", "account-initial");
    const platforms = { ios: "iPhone", android: "Android", android_x: "Android", tdesktop: "Telegram Desktop", macos: "Mac", weba: "Telegram Web", webk: "Telegram Web" };
    const where = (tg && platforms[tg.platform]) || "";
    const hhmm = (t) => new Date(t).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    let syncValue = "Включена", syncNote = "Любимое и плейлисты общие на всех устройствах";
    if (!syncOn()) {
      syncValue = "Выключена";
      syncNote = "Нотка открыта не из Telegram. Открой её через бота @notka_app_bot, и всё объединится";
    } else if (syncStatus.code === "auth") {
      syncValue = "Не работает";
      syncNote = "Сессия устарела. Закрой Нотку и открой её заново из Telegram. Нажми, чтобы попробовать ещё раз";
    } else if (syncStatus.code === "big") {
      syncValue = "Не работает";
      syncNote = "Слишком много данных в аккаунте. Удали ненужные плейлисты, или напиши в поддержку";
    } else if (syncStatus.code === "net") {
      syncValue = "Нет связи";
      syncNote = "Попробуем ещё раз сами. Нажми, чтобы проверить сейчас";
    } else if (syncStatus.code === "ok") {
      syncNote = `Последний раз в ${hhmm(syncStatus.at)}${where ? " · это " + where : ""}. Нажми, чтобы обновить сейчас`;
    } else {
      syncNote = "Проверяем…";
    }
    $("account-analytics-val").textContent = state.settings.analyticsOff ? "Выключено" : "Включено";
    $("account-sessions-count").textContent = syncValue;
    $("account-sync-sub").textContent = syncNote;
    const tgName = tgUser ? [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") : "";
    const customName = !!Store.getAccountName(), customPhoto = !!Store.getAccountAvatar();
    $("account-sub").textContent = tgUser && tgUser.username ? `@${tgUser.username}` : "";
    $("acc-name-val").textContent = displayName();
    $("acc-photo-val").textContent = customPhoto ? "Своё" : (tgUser && tgUser.photo_url ? "Из Telegram" : "Не выбрано");
    $("acc-tg-val").textContent = tgUser ? (tgUser.username ? `@${tgUser.username}` : (tgName || "Подключён")) : "Не подключён";
    $("account-restore-tg").hidden = !(tgUser && (customName || customPhoto));
    $("acc-favs").textContent = String(state.favorites.length);
    $("acc-lists").textContent = String(state.playlists.length);
    $("acc-follows").textContent = String(state.followedArtists.length);
  }
  $("account-analytics-row").addEventListener("click", () => {
    Store.setSetting("analyticsOff", !state.settings.analyticsOff);
    if (state.settings.analyticsOff) eventQueue.length = 0;
    haptic("light");
    showToast(state.settings.analyticsOff ? "Выключено" : "Включено, спасибо");
    renderAccountScreen();
  });
  $("account-sessions-row").addEventListener("click", () => {
    if (!syncOn()) { showToast("Открой Нотку из Telegram, чтобы включить синхронизацию"); return; }
    syncDeadAt = 0;
    haptic("light");
    setSyncStatus("idle");
    syncNow();
  });
  $("account-row-name").addEventListener("click", () => $("account-name-row").click());
  $("account-row-photo").addEventListener("click", () => changeAccountAvatar());
  $("account-restore-tg").addEventListener("click", () => {
    Store.setAccountName(null);
    Store.setAccountAvatar(null);
    renderAccountScreen();
    renderProfile();
    haptic("success");
    showToast("Имя и фото из Telegram");
  });

  // копия данных одним текстом: на устройстве хранится всё, и так оно переезжает на новый телефон
  const BACKUP_PREFIX = "NOTKA1:";
  function buildBackup() {
    const keepCover = (p) => (p.cover && p.cover.length > 30000 ? Object.assign({}, p, { cover: null }) : p);
    const data = {
      v: 1, at: Date.now(),
      accountName: state.accountName, favorites: state.favorites, playlists: state.playlists.map(keepCover),
      followedArtists: state.followedArtists, followedMeta: state.followedMeta, playlistFlags: state.playlistFlags,
      settings: state.settings, listens: listensView(), events: state.events,
    };
    return BACKUP_PREFIX + btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  }
  function readBackup(text) {
    const raw = String(text || "").replace(/\s+/g, "");
    if (!raw.startsWith(BACKUP_PREFIX)) throw new Error("not a backup");
    const data = JSON.parse(decodeURIComponent(escape(atob(raw.slice(BACKUP_PREFIX.length)))));
    if (!data || data.v !== 1 || !Array.isArray(data.favorites) || !Array.isArray(data.playlists)) throw new Error("bad backup");
    return data;
  }
  async function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; }
    } catch (e) { /* the fallback below */ }
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch (e) { return false; }
  }
  $("account-backup").addEventListener("click", async () => {
    const text = buildBackup();
    if (await copyText(text)) { haptic("success"); showToast("Копия скопирована. Сохрани её, например, в «Избранное»"); return; }
    // буфер недоступен: показываем текст, его можно скопировать руками
    $("restore-title").textContent = "Копия данных";
    $("restore-text").textContent = "Не получилось скопировать само. Выдели весь текст и скопируй его.";
    $("restore-input").value = text;
    $("restore-confirm").hidden = true;
    openOverlay("restore-modal");
    setTimeout(() => { $("restore-input").focus(); $("restore-input").select(); }, 80);
  });
  $("account-restore").addEventListener("click", () => {
    $("restore-title").textContent = "Восстановить из копии";
    $("restore-text").textContent = "Вставь текст копии. Любимое, плейлисты, подписки и статистика на этом устройстве будут заменены.";
    $("restore-input").value = "";
    $("restore-confirm").hidden = false;
    openOverlay("restore-modal");
    setTimeout(() => $("restore-input").focus(), 80);
  });
  $("restore-cancel").addEventListener("click", () => closeOverlay("restore-modal"));
  $("restore-confirm").addEventListener("click", () => {
    let data;
    try { data = readBackup($("restore-input").value); } catch (e) { haptic("error"); showToast("Это не похоже на копию Нотки"); return; }
    state.accountName = data.accountName || null;
    state.favorites = data.favorites;
    state.playlists = data.playlists;
    state.followedArtists = data.followedArtists || [];
    state.followedMeta = data.followedMeta || {};
    state.playlistFlags = data.playlistFlags || {};
    state.settings = Object.assign(state.settings, data.settings || {});
    state.listens = data.listens || { seconds: 0, plays: 0, tracks: {}, artists: {} };
    // the restored file holds the whole sum: this device carries it, the others' counters start over
    state.remoteListens = null;
    state.listensResetPending = true;
    listensRev++;
    if (data.events) state.events = data.events;
    persist();
    closeOverlay("restore-modal");
    haptic("success");
    showToast("Данные восстановлены");
    setTimeout(() => location.reload(), 700);
  });
  $("account-reset-stats").addEventListener("click", () => openOverlay("reset-stats-modal"));
  $("reset-stats-cancel").addEventListener("click", () => closeOverlay("reset-stats-modal"));
  $("reset-stats-confirm").addEventListener("click", () => {
    state.listens = { seconds: 0, plays: 0, tracks: {}, artists: {}, days: {} };
    state.remoteListens = null; // and the other devices' counters too: it is one account
    state.listensResetPending = true;
    listensRev++;
    persist();
    closeOverlay("reset-stats-modal");
    haptic("success");
    showToast("Статистика сброшена");
  });
  function setSwitch(id, on) {
    const el = $(id);
    if (el) el.setAttribute("aria-checked", on ? "true" : "false");
  }
  // in Telegram the data is kept under the account, so the screens say so
  if (syncOn()) {
    const swap = (el) => {
      if (/хранятся на этом устройстве/.test(el.textContent)) {
        el.textContent = el.textContent
          .replace("Любимое и плейлисты хранятся на этом устройстве", "Любимое, плейлисты и статистика хранятся в аккаунте и совпадают на всех устройствах")
          .replace("Любимое, плейлисты и статистика хранятся на этом устройстве", "Любимое, плейлисты и статистика хранятся в твоём аккаунте Telegram и совпадают на всех устройствах");
      }
    };
    document.querySelectorAll("p, span, div, li").forEach((el) => { if (!el.children.length) swap(el); });
    document.querySelectorAll(".fineprint").forEach((el) => { if (/на этом устройстве/.test(el.textContent)) el.textContent = "Считается по всем твоим устройствам"; });
  }
  $("account-back-btn").addEventListener("click", goBack);
  $("account-invite-btn").addEventListener("click", shareInvite);
  $("account-name-row").addEventListener("click", () => {
    $("account-name-input").value = displayName();
    openOverlay("account-name-modal");
    setTimeout(() => $("account-name-input").focus(), 60);
  });
  $("account-name-cancel").addEventListener("click", () => closeOverlay("account-name-modal"));
  $("account-name-save").addEventListener("click", () => {
    const val = $("account-name-input").value.trim();
    if (!val) return;
    Store.setAccountName(val);
    closeOverlay("account-name-modal");
    renderAccountScreen();
    renderProfile();
    showToast("Имя изменено");
  });

  // ============================================================
  // SOUND & DOWNLOADS
  // ============================================================
  // the crossfade, drawn: the first track fades out while the next fades in, over as many seconds as are set
  function paintCrossfade(val) {
    const o = (val / 12) * 150; // overlap, in the width of the drawing (300)
    const l = 150 - o / 2, r = 150 + o / 2;
    $("xf-path-a").setAttribute("d", `M0,84 L0,22 L${l.toFixed(1)},22 L${r.toFixed(1)},84 Z`);
    $("xf-path-b").setAttribute("d", `M300,84 L300,22 L${r.toFixed(1)},22 L${l.toFixed(1)},84 Z`);
    $("crossfade-value").textContent = val === 0 ? "Выкл" : String(val);
    $("crossfade-unit").textContent = val === 0 ? "" : "сек";
    $("crossfade-slider").style.setProperty("--p", `${(val / 12) * 100}%`);
  }
  function renderSoundScreen() {
    const crossfade = Store.getSetting("crossfade") || 0;
    $("crossfade-slider").value = crossfade;
    paintCrossfade(crossfade);
    $("crossfade-note").textContent = volumeWorks
      ? "Трек мягко затухает в конце, а следующий уже набирает громкость."
      : "На этом устройстве Telegram не даёт менять громкость — переход не сработает.";
    const sw = $("toggle-normalize");
    const on = loudness.supported && !!Store.getSetting("loudness");
    sw.disabled = !loudness.supported;
    sw.setAttribute("aria-checked", on ? "true" : "false");
    $("normalize-sub").textContent = loudness.supported ? "Все треки звучат одинаково громко" : "Здесь это не работает: Нотка открыта не через наш сервер";
    revealIn("screen-sound", true);
  }
  $("toggle-normalize").addEventListener("click", () => {
    const sw = $("toggle-normalize");
    if (sw.disabled) return;
    const on = sw.getAttribute("aria-checked") !== "true";
    sw.setAttribute("aria-checked", on ? "true" : "false");
    Store.setSetting("loudness", on);
    haptic("select");
    loudness.refresh();
  });
  $("sound-back-btn").addEventListener("click", goBack);

  // «Лёгкий режим»: меньше размытия и анимаций для слабых телефонов
  function renderPerfSwitch() {
    const mn = $("toggle-minimal");
    if (mn) mn.setAttribute("aria-checked", isMinimal() ? "true" : "false");
    const sw = $("toggle-lite");
    if (!sw) return;
    const lite = perfProbe.isLite();
    sw.setAttribute("aria-checked", lite ? "true" : "false");
    const sub = $("lite-sub");
    if (sub) sub.textContent = lite && perfProbe.mode() === "auto"
      ? "Включился сам: Нотка тормозила на этом телефоне"
      : "Меньше размытия и анимаций: плавнее и меньше греется";
  }
  document.addEventListener("notka:perf", renderPerfSwitch);
  $("toggle-minimal").addEventListener("click", () => {
    const on = $("toggle-minimal").getAttribute("aria-checked") !== "true";
    Store.setSetting("minimal", on);
    $("toggle-minimal").setAttribute("aria-checked", on ? "true" : "false");
    haptic("select");
    applyLook();
  });
  $("toggle-lite").addEventListener("click", () => {
    const on = $("toggle-lite").getAttribute("aria-checked") !== "true";
    perfProbe.set(on);
    haptic("select");
    renderPerfSwitch();
    showToast(on ? "Лёгкий режим включён" : "Лёгкий режим выключен");
  });
  $("crossfade-slider").addEventListener("input", (e) => {
    const val = parseInt(e.target.value, 10) || 0;
    Store.setSetting("crossfade", val);
    paintCrossfade(val);
    haptic("select");
  });

  // ============================================================
  // ABOUT
  // ============================================================
  $("about-back-btn").addEventListener("click", goBack);

  // «Нотка Плюс» is not on sale yet (payments need the permanent server and
  // the extras themselves), so its screen is shown only in preview mode:
  // five taps on the version line in «О Нотке» switch it on and off.
  function plusPreview() {
    if (window.NOTKA_CONFIG && window.NOTKA_CONFIG.PLUS_PREVIEW) return true;
    try { return localStorage.getItem("notka_plus_preview") === "1"; } catch (e) { return false; }
  }
  let versionTaps = 0, versionTapAt = 0;
  $("about-version").addEventListener("click", () => {
    const now = Date.now();
    versionTaps = now - versionTapAt < 600 ? versionTaps + 1 : 1;
    versionTapAt = now;
    if (versionTaps < 5) return;
    versionTaps = 0;
    const on = !plusPreview();
    try { localStorage.setItem("notka_plus_preview", on ? "1" : "0"); } catch (e) { return; }
    haptic("success");
    showToast(on ? "Предпросмотр «Нотки Плюс» включён — смотри в профиле" : "Предпросмотр «Нотки Плюс» выключен");
  });
  $("menu-plus").addEventListener("click", () => showScreen("plus"));
  // страница Плюса: переключатели внутри карточек-примеров (неделя / месяц, настроение)
  function setupPlusPage() {
    document.querySelectorAll("#plus-panels .px-seg").forEach((seg) => {
      if (seg.id === "plus-stage-tabs") return; // у тем плеера свой обработчик ниже
      const card = seg.closest(".px-card");
      seg.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-k]");
        if (!btn) return;
        seg.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === btn));
        card.querySelectorAll(".v").forEach((v) => v.classList.toggle("is-on", v.dataset.v === btn.dataset.k));
        haptic("select");
      });
    });
  }
  setupPlusPage();
  const plusAtmoBtn = $("plus-atmo-btn");
  if (plusAtmoBtn) plusAtmoBtn.addEventListener("click", () => showScreen("look"));

  // настоящие цифры слушателя и его инициал для витрин «Итоги» и «Друг Нотки»
  function fillPlusLive() {
    const l = listensView() || {};
    const vals = { minutes: Math.round((l.seconds || 0) / 60), plays: l.plays || 0, tracks: Object.keys(l.tracks || {}).length, artists: Object.keys(l.artists || {}).length };
    const words = { minutes: ["минута", "минуты", "минут"], plays: ["прослушивание", "прослушивания", "прослушиваний"], tracks: ["трек", "трека", "треков"], artists: ["исполнитель", "исполнителя", "исполнителей"] };
    document.querySelectorAll("#plus-panels [data-stat]").forEach((el) => {
      const k = el.dataset.stat, n = vals[k];
      el.textContent = n ? n.toLocaleString("ru-RU") : "♪";
      const w = document.querySelector(`#plus-panels [data-word="${k}"]`);
      if (w) w.textContent = n ? (k === "minutes" ? plural(n, ...words[k]) + " с Ноткой" : plural(n, ...words[k])) : "пока тихо, начни слушать";
    });
    const pxStats = $("px-stats");
    if (pxStats) pxStats.classList.toggle("is-empty", !vals.minutes && !vals.tracks && !vals.artists);
    const initial = ($("profile-initial") && $("profile-initial").textContent) || "Н";
    document.querySelectorAll("#plus-panels .fr-initial").forEach((el) => { el.textContent = initial; });
    document.querySelectorAll("#plus-panels [data-ago]").forEach((el) => {
      el.textContent = new Date(Date.now() - Number(el.dataset.ago) * 864e5).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
    });
  }

  $("plus-back-btn").addEventListener("click", goBack);

  // Who has Плюс. Real subscriptions will come from the server once
  // payments are connected; until then, in preview mode, the buy button
  // switches Плюс on and off on this device — to walk the whole path.
  // Real Плюс comes from the server (a promo code now, a payment later): it
  // answers for the Telegram user behind this Mini App. The last answer is
  // remembered, so the app doesn't wait for the network to look right.
  const tgInitData = tgInitRaw;
  function plusUntil() {
    try { return +localStorage.getItem("notka_plus_until") || 0; } catch (e) { return 0; }
  }
  function hasRealPlus() { return plusUntil() * 1000 > Date.now(); }
  function hasPlus() {
    if (hasRealPlus()) return true;
    try { return localStorage.getItem("notka_plus_local") === "1"; } catch (e) { return false; }
  }
  // «Друг Нотки»: the badge in the profile. It grows with the time with Плюс:
  // the day Плюс was first seen here is kept, and that sets its tier.
  const FRIEND_TIERS = [[180, "veteran", "Друг Нотки с первых дней"], [30, "gold", "Друг Нотки"], [0, "new", "Друг Нотки"]];
  function plusSince() {
    try { return +localStorage.getItem("notka_plus_since") || 0; } catch (e) { return 0; }
  }
  function renderFriendBadge() {
    const badge = $("friend-badge");
    if (!badge) return;
    if (!hasPlus()) { badge.hidden = true; return; }
    let since = plusSince();
    if (!since) { since = Date.now(); try { localStorage.setItem("notka_plus_since", String(since)); } catch (e) { /* once more next time */ } }
    const days = (Date.now() - since) / 86400000;
    const tier = FRIEND_TIERS.find(([d]) => days >= d);
    badge.dataset.tier = tier[1];
    badge.querySelector("span").textContent = tier[2];
    badge.dataset.since = since;
    badge.hidden = false;
  }
  $("friend-badge").addEventListener("click", () => {
    haptic("success");
    const since = +$("friend-badge").dataset.since;
    showToast(`С Плюсом с ${new Date(since).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}. Спасибо, что поддерживаешь Нотку`);
  });
  function rememberPlus(until) {
    try { localStorage.setItem("notka_plus_until", String(until || 0)); } catch (e) { /* stays for this session */ }
    syncPlusUI();
    applyLook();
  }
  async function refreshPlus() {
    if (!tgInitData) return;
    try {
      const res = await fetch(`${API_BASE_URL}/plus/status`, { headers: { "X-Telegram-Init-Data": tgInitData } });
      if (!res.ok) return;
      const data = await res.json();
      if (data.known) rememberPlus(data.until);
    } catch (e) { /* the last known answer stays */ }
  }
  function longDate(seconds) {
    return new Date(seconds * 1000).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  }
  const PLUS_PLANS = {
    year: { then: "749 ₽ в год" },
    quarter: { then: "229 ₽ за 3 месяца" },
    month: { then: "89 ₽ в месяц" },
  };
  let plusPlan = "year";
  // плашка с пробным периодом: в первый заход, потом на каждый десятый, и если не заходил 3 дня и больше
  function planBarVisit() {
    let visits = 0, last = 0;
    try { visits = +localStorage.getItem("notka_plus_visits") || 0; last = +localStorage.getItem("notka_plus_last") || 0; } catch (e) { /* no storage: always show */ }
    const show = visits % 10 === 0 || (last && Date.now() - last > 3 * 86400000);
    try { localStorage.setItem("notka_plus_visits", String(visits + 1)); localStorage.setItem("notka_plus_last", String(Date.now())); } catch (e) { /* once more next time */ }
    $("plus-bar").classList.toggle("is-skipped", !show && !hasPlus());
  }
  function syncPlusUI() {
    const on = hasPlus();
    const real = hasRealPlus();
    document.body.classList.toggle("has-plus", on);
    renderFriendBadge();
    $("plus-bar").classList.toggle("is-active", on);
    $("plus-bar").classList.toggle("is-real", real);
    $("plus-buy-btn").textContent = on ? "Выключить Плюс" : "Попробовать 7 дней бесплатно";
    $("plan-buy-btn").textContent = on ? "Выключить Плюс" : "Попробовать 7 дней бесплатно";
    $("plan-buy-btn").hidden = real;
    $("plan-state").hidden = !on;
    $("plan-state").textContent = real ? `Плюс включён до ${longDate(plusUntil())}` : "Плюс включён в режиме предпросмотра. Оплата не списывалась.";
    $("plus-bar-note").textContent = real
      ? `Плюс включён до ${longDate(plusUntil())}`
      : on
      ? "Плюс включён в режиме предпросмотра. Оплата не списывалась."
      : `Потом ${PLUS_PLANS[plusPlan].then}`;
  }
  $("plus-bar-close").addEventListener("click", () => {
    haptic("light");
    $("plus-bar").classList.add("is-dismissed");
  });

  // The stage on top of the page: the themes play live, with the cover of
  // what the listener has on (or had on last), and take turns by themselves.
  const plusStage = $("plus-stage");
  let plusStageTimer = null;
  let plusStageHoldUntil = 0;
  function setPlusStage(name) {
    plusStage.dataset.show = name;
    $("plus-stage-tabs").querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c.dataset.show === name));
  }
  function openPlusScreen() {
    const track = currentTrack || (state.recent || [])[0] || state.favorites[0] || null;
    const art = track && track.artwork ? `url("${hiResArtwork(track.artwork).replace(/"/g, "%22")}")` : "";
    $("plus-disc-art").style.backgroundImage = art;
    $("plus-cassette-art").style.backgroundImage = art;
    $("plus-stage-glow").style.backgroundImage = art;
    $("plus-cd-art").style.backgroundImage = art;
    $("plus-cassette-title").textContent = track ? track.title || "Без названия" : "Твоя музыка";
    $("plus-cassette-artist").textContent = track ? track.artist || "" : "в Нотке Плюс";
    fillPlusLive();
    fillPlusShowcase();
    planBarVisit();
    syncPlusUI();
    $("plus-bar").classList.remove("is-dismissed"); // плашка возвращается при каждом заходе
    revealIn("screen-plus", true);
    setTimeout(perfProbe, 1800);
    clearInterval(plusStageTimer);
    plusStageTimer = setInterval(() => {
      if (currentScreen !== "plus") { clearInterval(plusStageTimer); return; }
      if (Date.now() < plusStageHoldUntil) return;
      const order = ["vinyl", "cassette", "cd"];
      setPlusStage(order[(order.indexOf(plusStage.dataset.show) + 1) % order.length]);
    }, 4200);
  }
  $("plus-stage-tabs").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    haptic("light");
    plusStageHoldUntil = Date.now() + 12000; // the listener chose: no switching for a while
    setPlusStage(chip.dataset.show);
  });
  $("plus-try-btn").addEventListener("click", () => {
    haptic("light");
    setPlayerTheme(plusStage.dataset.show);
    if (currentTrack) showScreen("player");
    else showToast("Тема включена. Запусти любой трек и открой плеер");
  });

  $("plan-opts").addEventListener("click", (e) => {
    const opt = e.target.closest(".plan-opt");
    if (!opt) return;
    plusPlan = opt.dataset.plan;
    $("plan-opts").querySelectorAll(".plan-opt").forEach((o) => {
      o.classList.toggle("is-on", o === opt);
      o.setAttribute("aria-checked", o === opt ? "true" : "false");
    });
    haptic("light");
    syncPlusUI();
  });
  const togglePlusPreview = () => {
    const on = !hasPlus();
    try { localStorage.setItem("notka_plus_local", on ? "1" : "0"); } catch (e) { return; }
    haptic(on ? "success" : "light");
    showToast(on ? "Плюс включён для предпросмотра. Оплата не списывалась" : "Плюс выключен");
    syncPlusUI();
    if (on) keepTriedLook(); else { endLookTry(); applyLook(); }
  };
  $("plus-buy-btn").addEventListener("click", togglePlusPreview);
  $("plan-buy-btn").addEventListener("click", togglePlusPreview);

  // когда внизу страницы виден сам план с кнопкой, плавающая плашка не нужна
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      $("plus-bar").classList.toggle("is-covered", entries.some((e) => e.isIntersecting));
    }, { root: $("screen-plus"), threshold: 0.6 }).observe($("plan-buy-btn"));
  }

  // Real covers for the Plus page: the header's deck of glass cards and the
  // example lists in the panels. A cover is looked up once through the same
  // search the app uses, then kept on this device.
  const PLUS_COVERS_KEY = "notka_plus_covers_v1";
  let plusCoverCache = {};
  try { plusCoverCache = JSON.parse(localStorage.getItem(PLUS_COVERS_KEY) || "{}") || {}; } catch (e) { plusCoverCache = {}; }
  const plusCoverPending = new Map();
  function savePlusCovers() {
    try { localStorage.setItem(PLUS_COVERS_KEY, JSON.stringify(plusCoverCache)); } catch (e) { /* kept for this session only */ }
  }
  function plusCoverFor(query, artistHint) {
    const key = query.trim().toLowerCase();
    if (plusCoverCache[key]) return Promise.resolve(plusCoverCache[key]);
    if (plusCoverPending.has(key)) return plusCoverPending.get(key);
    const p = (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/search?q=${encodeURIComponent(query)}&limit=12`);
        if (!res.ok) return null;
        const list = ((await res.json()).results || []).filter((t) => t.artwork);
        const hint = (artistHint || "").toLowerCase().split(/\s+/)[0];
        const hit = hint ? list.find((t) => (t.artist || "").toLowerCase().split(/[,&]/)[0].includes(hint)) : list[0];
        if (!hit) return null;
        const rec = { title: hit.title, artist: hit.artist, artwork: hit.artwork };
        plusCoverCache[key] = rec;
        savePlusCovers();
        return rec;
      } catch (e) {
        return null;
      } finally {
        plusCoverPending.delete(key);
      }
    })();
    plusCoverPending.set(key, p);
    return p;
  }
  const PLUS_DECK_QUERIES = [
    ["The Weeknd Blinding Lights", "The Weeknd"], ["Кино Группа крови", "Кино"], ["Dua Lipa Houdini", "Dua"],
    ["Coldplay Yellow", "Coldplay"], ["Imagine Dragons Believer", "Imagine"], ["Billie Eilish lovely", "Billie"], ["Nirvana Smells Like Teen Spirit", "Nirvana"],
    ["Linkin Park Numb", "Linkin"], ["Ed Sheeran Shape of You", "Ed"],
  ];
  const cssUrl = (u) => `url("${String(u).replace(/"/g, "%22")}")`;

  // the header: a canvas of horizontal mini players laid out evenly over the
  // whole width and seen in perspective, as if they lay on a table
  let plusDeckTracks = [];
  // примеры на странице Плюса: настоящие карточки с настоящими обложками (свои треки слушателя, затем известные)
  function renderPlusPage() {
    const pool = plusDeckTracks;
    const n = pool.length;
    if (!n) return;
    const at = (i) => pool[((i % n) + n) % n];
    const fillRow = (li, t) => {
      li.querySelector(".px-cv").style.backgroundImage = cssUrl(hiResArtwork(t.artwork));
      li.querySelector("b").textContent = t.title || "";
      li.querySelector("em").textContent = t.artist || "";
    };
    document.querySelectorAll("#px-stack .px-mini").forEach((el, i) => {
      fillRow(el, at(i));
      el.querySelector("u").style.width = [58, 34, 76][i] + "%";
    });
    const sets = { week: [0, 1, 2], month: [3, 4, 5], quarter: [6, 7, 8], bright: [0, 3, 6], calm: [1, 4, 7], work: [2, 5, 8], sad: [3, 6, 0] };
    document.querySelectorAll("#plus-panels .px-views .v").forEach((v) => {
      const idx = sets[v.dataset.v];
      if (!idx) return;
      v.querySelectorAll(".px-row").forEach((li, j) => fillRow(li, at(idx[j])));
    });
  }
  async function fillPlusShowcase() {
    const seen = new Set(), pool = [];
    const add = (t) => {
      if (!t || !t.title || !t.artwork || seen.has(t.artwork) || pool.length >= 6) return;
      seen.add(t.artwork);
      pool.push({ title: t.title, artist: t.artist, artwork: t.artwork });
    };
    if (currentTrack) add(currentTrack);
    (state.favorites || []).forEach(add);
    (state.recent || []).forEach(add);
    plusDeckTracks = pool.slice();
    if (plusDeckTracks.length >= 5) renderPlusPage();
    // fill up with well-known tracks and their real covers (looked up once, then kept)
    const found = await Promise.all(PLUS_DECK_QUERIES.map(([q, a]) => plusCoverFor(q, a)));
    for (const rec of found) {
      if (!rec || plusDeckTracks.length >= 13 || seen.has(rec.artwork)) continue;
      seen.add(rec.artwork);
      plusDeckTracks.push(rec);
    }
    renderPlusPage();
  }

  // ============================================================
  // HOW НОТКА LOOKS — the player theme, the color of the light, the
  // pattern of the background. The standard look is for everyone; the
  // rest belongs to Плюс, and anyone can switch it on for a minute to see
  // it on their own music.
  // ============================================================
  const PLAYER_THEMES = { standard: { name: "Стандарт" }, vinyl: { name: "Винил", plus: true }, cassette: { name: "Кассета", plus: true }, cd: { name: "Диск", plus: true } };
  const LIGHT_PRESETS = {
    sunset: { name: "Закат", palette: DEFAULT_PALETTE },
    ocean: { name: "Океан", palette: { core: "#D6F4FF", warm: "#2FA8FF", mid: "#3B5BFF", deep: "#1B2A8C" } },
    forest: { name: "Лес", palette: { core: "#E9FFD6", warm: "#4FD08A", mid: "#1FA39A", deep: "#145C6B" } },
    rose: { name: "Роза", palette: { core: "#FFE1EC", warm: "#FF6FA3", mid: "#C94BD6", deep: "#5B2A9E" } },
    neon: { name: "Неон", palette: { core: "#E8FFF9", warm: "#2CF5C2", mid: "#9B5CFF", deep: "#2A1A8F" } },
    gold: { name: "Золото", palette: { core: "#FFF3C9", warm: "#FFC24B", mid: "#FF7A3D", deep: "#7A2E1E" } },
    mono: { name: "Серебро", palette: { core: "#FFFFFF", warm: "#C9C4D6", mid: "#8E88A0", deep: "#3B3650" }, free: true },
    // спокойные цвета без Плюса: для тех, у кого розовый режет глаза
    graphite: { name: "Графит", palette: { core: "#E4E6EA", warm: "#9AA0AB", mid: "#5F6672", deep: "#23262D" }, free: true },
    midnight: { name: "Полночь", palette: { core: "#D5E0F2", warm: "#5F7FB8", mid: "#3A4F86", deep: "#141C34" }, free: true },
    moss: { name: "Мох", palette: { core: "#DDE8DA", warm: "#7FA386", mid: "#4A6E5B", deep: "#16261F" }, free: true },
  };
  const BG_PATTERNS = { light: "Свет", prism: "Призма", aurora: "Сияние", horizon: "Горизонт", lava: "Лава" };
  // light: "track" | "preset:<id>" | "pinned" (the palette and cover are in lightPinned)
  const LOOK_DEFAULTS = { playerTheme: "standard", light: "track", bgPattern: "light", atmo: "none" };
  // «Атмосфера»: seasons and nature. Plus ones come with Нотка Плюс; the
  // collectible ones (loot: true) are given for tasks, and until that is
  // built they can be tried, or switched on in preview mode. Each has its
  // own lights (palettes) and its own settings: the first value of every
  // setting is its default.
  const AMOUNT_CHOICES = [["low", "Мало"], ["mid", "Обычно"], ["high", "Много"], ["none", "Нет"]];
  const ONOFF = [["on", "Есть"], ["off", "Нет"]];
  const ATMOS = {
    autumn: {
      name: "Осень",
      lights: { sunset: ["Закат", { core: "#FFE6C4", warm: "#F59B45", mid: "#C8683A", deep: "#4A2416" }], morning: ["Утро", { core: "#FFF1DC", warm: "#F4B779", mid: "#D98A7A", deep: "#46303A" }], dusk: ["Сумерки", { core: "#F6D5C4", warm: "#D9744A", mid: "#8C4A6E", deep: "#2A1830" }] },
      options: [["amount", "Листья", AMOUNT_CHOICES, "low"], ["wind", "Ветер", [["soft", "Лёгкий"], ["calm", "Штиль"], ["gusty", "Порывы"]], "soft"], ["rays", "Лучи", ONOFF, "on"]],
    },
    winter: {
      name: "Зима",
      lights: { ice: ["Лёд", { core: "#EEF6FD", warm: "#8DC3EE", mid: "#6F9BDD", deep: "#1B3260" }], dawn: ["Заря", { core: "#FBEAF1", warm: "#EFA6C2", mid: "#9A9AE0", deep: "#2B3070" }], deep: ["Ночь", { core: "#E4EEFC", warm: "#6D95E8", mid: "#4C5BD0", deep: "#121C58" }] },
      options: [["amount", "Снег", AMOUNT_CHOICES, "low"], ["aurora", "Сияние", ONOFF, "on"], ["frost", "Иней на панелях", ONOFF, "on"]],
    },
    spring: {
      name: "Весна",
      lights: { sakura: ["Сакура", { core: "#FFF4F7", warm: "#F4B6CC", mid: "#D890B4", deep: "#4C3354" }], mint: ["Мята", { core: "#EFFBF4", warm: "#8ED9B8", mid: "#52B0A6", deep: "#1E4048" }], sunrise: ["Рассвет", { core: "#FFF5DE", warm: "#F5C98A", mid: "#EDA0A8", deep: "#4B3052" }] },
      options: [["amount", "Лепестки", AMOUNT_CHOICES, "low"], ["petals", "Цвет лепестков", [["sakura", "Сакура"], ["white", "Белые"], ["mixed", "Вперемешку"]], "sakura"], ["pollen", "Пыльца", ONOFF, "on"]],
    },
    rain: {
      name: "Дождь",
      lights: { grey: ["Серый", { core: "#E2EAF3", warm: "#7FA6CF", mid: "#5D78A8", deep: "#223049" }], dusk: ["Вечер", { core: "#E9E2F2", warm: "#A090D0", mid: "#6670B0", deep: "#242650" }], green: ["Мокрый лес", { core: "#E6F2EA", warm: "#7BBFA0", mid: "#4A8C8C", deep: "#183A40" }] },
      options: [["amount", "Дождь", [["rain", "Дождь"], ["drizzle", "Морось"], ["storm", "Ливень"], ["none", "Нет"]], "drizzle"], ["glass", "Капли на стекле", ONOFF, "on"], ["thunder", "Гроза", [["off", "Нет"], ["on", "Есть"]], "off"]],
    },
    night: {
      name: "Звёздная ночь",
      lights: { indigo: ["Индиго", { core: "#E8EEFB", warm: "#84A0EE", mid: "#7068D4", deep: "#1A1D56" }], teal: ["Сияние", { core: "#E2FBF5", warm: "#5CDCC0", mid: "#5F8CE0", deep: "#12305C" }], violet: ["Фиолет", { core: "#F2E8FD", warm: "#B592F0", mid: "#B672D8", deep: "#2C1A66" }] },
      options: [["amount", "Звёзды", AMOUNT_CHOICES, "low"], ["cons", "Созвездия", ONOFF, "on"], ["meteors", "Падающие звёзды", [["rare", "Редко"], ["often", "Часто"], ["off", "Нет"]], "rare"], ["aurora", "Сияние", ONOFF, "on"]],
    },
    halloween: {
      name: "Хэллоуин", loot: true,
      lights: { candle: ["Свеча", { core: "#FFE0AE", warm: "#F58A2A", mid: "#7C3FC4", deep: "#220C3A" }], toxic: ["Зелье", { core: "#F0FFC8", warm: "#A4F04A", mid: "#1FB07A", deep: "#0A2A1C" }], blood: ["Багровый", { core: "#FFD8D2", warm: "#F04848", mid: "#B02860", deep: "#2A0A14" }] },
      options: [["life", "Огоньки", [["flies", "Светлячки"], ["embers", "Искры"], ["both", "Оба"]], "flies"], ["amount", "Количество", AMOUNT_CHOICES, "low"], ["bats", "Летучие мыши", [["rare", "Редко"], ["often", "Часто"], ["off", "Нет"]], "rare"], ["fog", "Туман", ONOFF, "on"], ["moon", "Луна", ONOFF, "on"], ["webs", "Паутина", ONOFF, "on"]],
    },
    newyear: {
      name: "Новый год", loot: true,
      lights: { gold: ["Золото", { core: "#FFF3D8", warm: "#EDC261", mid: "#5C76C8", deep: "#0C1C48" }], silver: ["Серебро", { core: "#FFFFFF", warm: "#D3E1FA", mid: "#93ABE4", deep: "#101F4C" }], ruby: ["Рубин", { core: "#FFE8E4", warm: "#F2796F", mid: "#B8365A", deep: "#3A0E22" }] },
      options: [["garland", "Гирлянда", [["warm", "Тёплая"], ["color", "Цветная"], ["cold", "Холодная"], ["off", "Нет"]], "warm"], ["bokeh", "Огни вдали", ONOFF, "on"], ["glitter", "Блёстки", [["on", "Есть"], ["off", "Нет"]], "on"]],
    },
  };
  // the settings of one atmosphere: what is saved over what is the default
  function atmoSettings(id) {
    const a = ATMOS[id];
    if (!a) return {};
    const saved = (Store.getSetting("atmoOpts") || {})[id] || {};
    const out = { light: Object.keys(a.lights)[0] };
    a.options.forEach(([key, , choices, def]) => { out[key] = choices.some((c) => c[0] === saved[key]) ? saved[key] : def; });
    if (a.lights[saved.light] && lightOpen(a.lights[saved.light])) out.light = saved.light;
    return out;
  }
  const atmoPalette = (id) => ATMOS[id].lights[atmoSettings(id).light][1];
  // a light can be a reward of its own: it is shown once it is won
  const lightOpen = (light) => !light[2] || ownsItem(light[2]);
  function setAtmoSetting(id, key, value) {
    const all = Object.assign({}, Store.getSetting("atmoOpts") || {});
    all[id] = Object.assign({}, all[id] || {}, { [key]: value });
    Store.setSetting("atmoOpts", all);
  }
  function atmoOwned(id) {
    const a = ATMOS[id];
    if (!a) return false;
    if (!a.loot) return hasPlus();
    return ownsItem("atmo_" + id) || (plusPreview() && hasPlus());
  }
  const freeLight = (v) => typeof v === "string" && v.startsWith("preset:") && !!(LIGHT_PRESETS[v.slice(7)] || {}).free;
  const lookAllowed = (key, value) => value === LOOK_DEFAULTS[key] || (key === "atmo" ? atmoOwned(value) : (key === "light" && freeLight(value)) || hasPlus());
  const LOOK_TRY_MS = 60000;
  let lookTried = {}; // what is switched on for a try, without Плюс
  let lookTryTimer = null;

  function lookKnown(key, value) {
    if (key === "playerTheme") return !!PLAYER_THEMES[value];
    if (key === "bgPattern") return !!BG_PATTERNS[value];
    if (key === "atmo") return value === "none" || !!ATMOS[value];
    return value === "track" || value === "pinned" || (typeof value === "string" && value.startsWith("preset:") && !!LIGHT_PRESETS[value.slice(7)]);
  }
  // Seasonal atmospheres (Halloween, New Year…) wear only their own event page and the try-on screen.
  // Everywhere else the app keeps the brand look: rose and peach light on the plum ground.
  const SEASONS_ONLY_ON_EVENT_PAGE = true;
  function lookValue(key) {
    if (key === "atmo" && currentScreen === "event" && eventById(currentEventId)) return eventById(currentEventId).atmo;
    if (key in lookTried) return lookTried[key];
    if (key === "atmo" && SEASONS_ONLY_ON_EVENT_PAGE && currentScreen !== "look") return LOOK_DEFAULTS.atmo;
    const saved = Store.getSetting(key);
    return lookKnown(key, saved) && lookAllowed(key, saved) ? saved : LOOK_DEFAULTS[key];
  }
  function pinnedLight() {
    return lookTried.lightPinned || Store.getSetting("lightPinned") || null;
  }
  function paintLight() {
    const mode = lookValue("light");
    let palette = trackLight.palette || DEFAULT_PALETTE, art = trackLight.art;
    if (mode.startsWith("preset:")) { palette = LIGHT_PRESETS[mode.slice(7)].palette; art = null; }
    else if (mode === "pinned" && pinnedLight()) { palette = pinnedLight().palette; art = pinnedLight().artwork; }
    const atmo = lookValue("atmo");
    if (atmo !== "none") { palette = atmoPalette(atmo); art = null; } // the season's own light (only on its event page)
    if (isMinimal()) art = null; // минимализм: ровный фон без размытой обложки под светом
    showArtUnderLight(art || null);
    applyPalette(palette);
  }
  // «Минимализм»: ровный тёмный фон без света и атмосфер (в духе Spotify). Бесплатный, хранится в настройках.
  const isMinimal = () => !!Store.getSetting("minimal");
  function applyLook() {
    document.documentElement.classList.toggle("minimal", isMinimal());
    const minSw = $("toggle-minimal");
    if (minSw) minSw.setAttribute("aria-checked", isMinimal() ? "true" : "false");
    const theme = lookValue("playerTheme");
    document.body.dataset.playerTheme = theme;
    document.body.dataset.bg = lookValue("bgPattern");
    $("light").dataset.bg = document.body.dataset.bg; // the light alone wears the pattern: the little previews must not follow it
    const atmo = lookValue("atmo");
    document.body.dataset.atmo = atmo;
    const atmoSet = atmo === "none" ? {} : Object.assign(atmoSettings(atmo), currentScreen === "event" ? { bats: "often", life: "both" } : {});
    // every setting is also an attribute of the body, for the style sheet to answer
    Object.keys(document.body.dataset).filter((k) => /^atmo[A-Z]/.test(k)).forEach((k) => delete document.body.dataset[k]);
    Object.entries(atmoSet).forEach(([k, v]) => { document.body.dataset["atmo" + k[0].toUpperCase() + k.slice(1)] = v; });
    if (window.Atmosphere) Atmosphere.set(isMinimal() ? "none" : atmo, isMinimal() ? {} : atmoSet);
    document.querySelectorAll("#atmo-stage .atmo-card").forEach((c) => { c.classList.toggle("is-on", c.dataset.atmo === atmo); c.setAttribute("aria-pressed", c.dataset.atmo === atmo ? "true" : "false"); });
    renderAtmoOptions(atmo, atmoSet);
    paintLight();
    syncPrism();
    // every picker shows what is on now
    $("theme-row-state").textContent = PLAYER_THEMES[theme].name;
    const mark = (el, on) => { el.classList.toggle("is-on", on); el.setAttribute("aria-pressed", on ? "true" : "false"); };
    document.querySelectorAll(".theme-opt, .look-slide").forEach((opt) => mark(opt, opt.dataset.theme === theme));
    document.querySelectorAll(".pattern-opt").forEach((opt) => mark(opt, opt.dataset.bg === lookValue("bgPattern")));
    const light = lookValue("light");
    document.querySelectorAll(".swatch").forEach((opt) => mark(opt, opt.dataset.light === light));
    const pin = light === "pinned" && pinnedLight();
    document.querySelectorAll(".look-cover").forEach((opt) => mark(opt, !!pin && opt.dataset.art === pin.artwork));
    const trying = Object.keys(lookTried).length > 0;
    $("look-try").hidden = !trying;
    const lootTried = "atmo" in lookTried && !!ATMOS[lookTried.atmo].loot;
    $("look-try").querySelector("span").textContent = lootTried ? "На пробу, минута · выдаётся за задания" : "На пробу, минута";
    const lootEvent = lootTried ? eventsCfg.find((e) => e.atmo === lookTried.atmo && e.status === "active") : null;
    $("look-try-keep").hidden = lootTried && !lootEvent;
    $("look-try-keep").textContent = lootTried ? "К заданиям" : "Оставить с Плюсом";
    if (lootTried) $("look-try").querySelector("span").textContent = "На пробу, минута";
    $("look-note").hidden = hasPlus();
    $("theme-try").hidden = !("playerTheme" in lookTried);
    if ("playerTheme" in lookTried) $("theme-try-text").textContent = `«${PLAYER_THEMES[theme].name}» — тема Плюса`;
  }
  function endLookTry() {
    clearTimeout(lookTryTimer);
    lookTryTimer = null;
    lookTried = {};
  }
  function setLook(key, value, pinned) {
    if (lookAllowed(key, value)) {
      delete lookTried[key];
      if (key === "light") delete lookTried.lightPinned;
      if (pinned) Store.setSetting("lightPinned", pinned);
      Store.setSetting(key, value);
      if (!Object.keys(lookTried).length) endLookTry();
    } else {
      // not a subscriber: it is on for a minute, then everything goes back
      lookTried[key] = value;
      if (pinned) lookTried.lightPinned = pinned;
      const lootTried = "atmo" in lookTried && !!ATMOS[lookTried.atmo].loot;
      clearTimeout(lookTryTimer);
      lookTryTimer = setTimeout(() => {
        endLookTry();
        applyLook();
        showToast(lootTried ? "Эта тема выдаётся за задания" : "Это оформление остаётся с Ноткой Плюс");
      }, LOOK_TRY_MS);
    }
    applyLook();
  }
  // Плюс was just switched on while something was being tried: it stays
  function keepTriedLook() {
    const tried = lookTried;
    endLookTry();
    if (tried.lightPinned) Store.setSetting("lightPinned", tried.lightPinned);
    ["playerTheme", "light", "bgPattern", "atmo"].forEach((key) => { if (key in tried && lookAllowed(key, tried[key])) Store.setSetting(key, tried[key]); });
    applyLook();
  }
  const setPlayerTheme = (name) => setLook("playerTheme", name);

  $("player-theme-btn").addEventListener("click", () => { closeOverlay("track-menu-sheet"); openOverlay("player-theme-sheet"); });
  $("player-theme-close").addEventListener("click", () => closeOverlay("player-theme-sheet"));
  document.querySelectorAll(".theme-opts").forEach((box) => box.addEventListener("click", (e) => {
    const opt = e.target.closest(".theme-opt");
    if (!opt) return;
    haptic("light");
    setPlayerTheme(opt.dataset.theme);
  }));
  $("theme-try-keep").addEventListener("click", () => { closeOverlay("player-theme-sheet"); showScreen("plus"); });
  $("look-try-keep").addEventListener("click", () => {
    const loot = lookTried.atmo && ATMOS[lookTried.atmo] && ATMOS[lookTried.atmo].loot;
    const ev = loot ? eventsCfg.find((e) => e.atmo === lookTried.atmo && e.status === "active") : null;
    if (ev) openEvent(ev.id); else showScreen("plus");
  });

  // ---- the «Оформление» screen ----
  function renderAtmoStage() {
    const stage = $("atmo-stage");
    if (stage.children.length) return;
    const card = (id, name, tag) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "atmo-card" + (id === "none" ? " is-off" : "");
      b.dataset.atmo = id;
      const view = document.createElement("span");
      view.className = "atmo-view";
      if (id !== "none") for (let i = 0; i < 3; i++) {
        const piece = document.createElement("i");
        piece.style.cssText = `--x:${[18, 52, 84][i]}%;--d:${[5.2, 6.8, 8.4][i]}s;--w:${[-1.2, -3.4, -5.2][i]}s`;
        view.appendChild(piece);
      }
      const label = document.createElement("span");
      label.className = "atmo-name";
      label.textContent = name;
      if (tag) label.insertAdjacentHTML("beforeend", tag);
      b.appendChild(view);
      b.appendChild(label);
      return b;
    };
    stage.appendChild(card("none", "Обычная", ""));
    Object.entries(ATMOS).forEach(([id, a]) => stage.appendChild(card(id, a.name, a.loot ? '<span class="tag tag-loot">Коллекция</span>' : '<span class="tag tag-plus">Плюс</span>')));
  }
  $("atmo-stage").addEventListener("click", (e) => {
    const c = e.target.closest(".atmo-card");
    if (!c) return;
    haptic("light");
    setLook("atmo", c.dataset.atmo);
  });
  // the settings of the chosen atmosphere: one row for the light and one for each setting
  let atmoOptsFor = null;
  function renderAtmoOptions(atmo, current) {
    const box = $("atmo-opts");
    if (!box) return;
    if (atmo === "none") {
      atmoOptsFor = null;
      box.innerHTML = "";
      return;
    }
    const key = atmo + JSON.stringify(current);
    if (key === atmoOptsFor) return;
    atmoOptsFor = key;
    const a = ATMOS[atmo];
    const row = (setting, title, choices, value) => `<div class="atmo-opt"><span class="atmo-opt-t">${title}</span><div class="atmo-opt-row">${choices.map(([v, name]) => `<button class="chip${v === value ? " active" : ""}" type="button" data-setting="${setting}" data-v="${v}">${name}</button>`).join("")}</div></div>`;
    box.innerHTML = row("light", "Свет", Object.entries(a.lights).filter(([, l]) => lightOpen(l)).map(([v, l]) => [v, l[0]]), current.light) + a.options.map(([setting, title, choices]) => row(setting, title, choices, current[setting])).join("");
  }
  $("atmo-opts").addEventListener("click", (e) => {
    const c = e.target.closest(".chip");
    const atmo = lookValue("atmo");
    if (!c || atmo === "none") return;
    haptic("light");
    setAtmoSetting(atmo, c.dataset.setting, c.dataset.v);
    applyLook();
  });
  // every pattern is shown as a little screen with the same light on it
  function renderPatterns() {
    const box = $("look-patterns");
    if (box.children.length) return;
    const orbs = ["violet", "magenta", "orange", "rim", "rim-b", "core"].map((n) => `<span class="orb orb-${n}"></span>`).join("");
    const ui = '<span class="pv-ui"><i class="a"></i><i class="b"></i><i class="c"></i><i class="d1"></i><i class="e1"></i></span>';
    box.innerHTML = Object.entries(BG_PATTERNS).map(([id, name]) => `<button class="pattern-opt" type="button" data-bg="${id}"><span class="pattern-thumb" data-bg="${id}" aria-hidden="true"><span class="pv"><span class="light-group"><span class="light-shape"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>${orbs}</span>${ui}</span></span><span class="pattern-name">${name}</span></button>`).join("");
  }
  // Every pattern card is a small living light (several blurred, blended orbs). Seven of them
  // moving at once, under the real light, is what froze weak phones the moment a pattern was
  // picked. Only the cards that are on the screen move.
  let patternWatch = null;
  function watchPatternCards() {
    if (patternWatch || !("IntersectionObserver" in window)) return;
    patternWatch = new IntersectionObserver((entries) => {
      entries.forEach((en) => en.target.classList.toggle("is-off", !en.isIntersecting));
    }, { root: null, threshold: 0.05 });
    document.querySelectorAll("#look-patterns .pattern-opt").forEach((el) => {
      el.classList.add("is-off");
      patternWatch.observe(el);
    });
  }
  function renderLookScreen() {
    renderAtmoStage();
    renderPatterns();
    watchPatternCards();
    const colors = $("look-colors");
    if (!colors.children.length) {
      const swatch = (value, name, p) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "swatch" + (p ? "" : " swatch-auto");
        b.dataset.light = value;
        const orb = document.createElement("i");
        if (p) { orb.style.setProperty("--a", p.core); orb.style.setProperty("--b", p.warm); orb.style.setProperty("--c", p.mid); orb.style.setProperty("--d", p.deep); }
        b.appendChild(orb);
        b.appendChild(document.createTextNode(name));
        return b;
      };
      colors.appendChild(swatch("track", "Как у трека", null));
      Object.entries(LIGHT_PRESETS).forEach(([id, preset]) => colors.appendChild(swatch(`preset:${id}`, preset.name, preset.palette)));
      Array.from(colors.children).forEach((el, i) => el.style.setProperty("--i", i));
    }
    // the themes on the stage wear the cover of what is on now (or was on last)
    const worn = currentTrack || (state.recent || [])[0] || state.favorites[0] || null;
    const wornArt = worn && worn.artwork ? `url("${hiResArtwork(worn.artwork).replace(/"/g, "%22")}")` : "";
    const stage = $("look-stage");
    stage.querySelectorAll(".js-art").forEach((el) => { el.style.backgroundImage = wornArt; });
    stage.querySelector(".js-title").textContent = worn ? worn.title || "Без названия" : "Твоя музыка";
    stage.querySelector(".js-artist").textContent = worn ? worn.artist || "" : "в Нотке";
    // covers to take the colors from: what is on now, what was on lately, the favorites
    const covers = $("look-covers");
    covers.innerHTML = "";
    const seen = new Set();
    const pin = pinnedLight();
    const sources = [currentTrack].concat(state.recent || [], state.favorites).filter((t) => t && t.artwork);
    if (pin) sources.unshift({ artwork: pin.artwork, title: pin.title, id: "pinned" });
    sources.forEach((t) => {
      const art = hiResArtwork(t.artwork);
      if (seen.has(art) || seen.size >= 14) return;
      seen.add(art);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "look-cover";
      b.dataset.art = art;
      b.setAttribute("aria-label", `Цвета обложки «${t.title || ""}»`);
      const cover = document.createElement("span");
      cover.className = "cover";
      setCoverEl(cover, t.artwork, t.id);
      b.appendChild(cover);
      b.addEventListener("click", async () => {
        haptic("light");
        const palette = await paletteFromArtwork(t.artwork);
        if (!palette) { showToast("Не получилось взять цвета этой обложки"); return; }
        setLook("light", "pinned", { palette, artwork: art, title: t.title || "" });
      });
      b.style.setProperty("--i", covers.children.length);
      covers.appendChild(b);
    });
    $("look-covers-title").hidden = covers.children.length === 0;
    applyLook();
    renderPerfSwitch();
    revealIn("screen-look", true);
    // the theme that is on stands in view
    const on = stage.querySelector(".look-slide.is-on");
    if (on) stage.scrollLeft = Math.max(0, on.offsetLeft - 20);
  }
  $("look-stage").addEventListener("click", (e) => {
    const slide = e.target.closest(".look-slide");
    if (!slide) return;
    haptic("light");
    slide.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
    setPlayerTheme(slide.dataset.theme);
  });
  $("look-colors").addEventListener("click", (e) => {
    const opt = e.target.closest(".swatch");
    if (!opt) return;
    haptic("light");
    setLook("light", opt.dataset.light);
  });
  $("look-patterns").addEventListener("click", (e) => {
    const opt = e.target.closest(".pattern-opt");
    if (!opt) return;
    haptic("light");
    setLook("bgPattern", opt.dataset.bg);
  });
  $("menu-look").addEventListener("click", () => showScreen("look"));
  $("look-back-btn").addEventListener("click", goBack);

  // once, after the first screen: what the app remembers (it is also the answer to «what do you store?»)
  (function dataNotice() {
    const box = $("data-notice");
    if (!box || Store.getSetting("dataNoticeSeen")) return;
    let tries = 0;
    const attempt = () => {
      if (Store.getSetting("dataNoticeSeen")) return;
      if (currentScreen === "splash" || currentScreen === "onboarding" || tries++ > 40) {
        if (tries <= 40) setTimeout(attempt, 1500);
        return;
      }
      box.hidden = false;
    };
    setTimeout(attempt, 2500);
    $("data-notice-ok").addEventListener("click", () => {
      box.hidden = true;
      Store.setSetting("dataNoticeSeen", true);
      haptic("light");
    });
  })();

  applyLook();
  syncPlusUI();
  refreshPlus();  syncPlusUI();
  refreshPlus();


  // little pictures of the rewards
  const svgUri = (s) => "data:image/svg+xml," + encodeURIComponent(s);
  const EVENT_ICONS = {
    atmo_halloween: svgUri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><defs><radialGradient id='m' cx='32%' cy='28%' r='85%'><stop offset='0' stop-color='#fffbea'/><stop offset='.55' stop-color='#ffe0ae'/><stop offset='1' stop-color='#ffb066'/></radialGradient></defs><path d='M31 5a19 19 0 1 0 13 29A16 16 0 0 1 31 5z' fill='url(#m)' stroke='#fff' stroke-opacity='.7' stroke-width='.8'/><path d='M14 14c3-5 8-8 13-8-5 2-9 6-10 11z' fill='#fff' opacity='.7'/><circle cx='37' cy='13' r='1.8' fill='#ffd9a0'/><circle cx='42' cy='21' r='1.3' fill='#ffd9a0'/></svg>"),
  };
  EVENT_ICONS.plus_3 = svgUri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><defs><linearGradient id='p' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#ffe7c4'/><stop offset='.55' stop-color='#ff9d5a'/><stop offset='1' stop-color='#ff5f86'/></linearGradient></defs><rect x='6' y='6' width='36' height='36' rx='11' fill='url(#p)' stroke='#fff' stroke-opacity='.7' stroke-width='.9'/><path d='M24 14v20M14 24h20' stroke='#fff' stroke-width='4.2' stroke-linecap='round'/><path d='M12 17c2-4 6-6 10-6-4 2-7 5-8 9z' fill='#fff' opacity='.55'/><text x='35' y='41' font-size='11' font-weight='800' fill='#fff' font-family='sans-serif' text-anchor='middle'>3</text></svg>");
  EVENT_ICONS.plus_10 = svgUri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><defs><linearGradient id='p' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#fff1c9'/><stop offset='.5' stop-color='#ffb35c'/><stop offset='1' stop-color='#ff5f9a'/></linearGradient></defs><rect x='6' y='6' width='36' height='36' rx='11' fill='url(#p)' stroke='#fff' stroke-opacity='.8' stroke-width='.9'/><path d='M24 14v20M14 24h20' stroke='#fff' stroke-width='4.2' stroke-linecap='round'/><path d='M12 17c2-4 6-6 10-6-4 2-7 5-8 9z' fill='#fff' opacity='.55'/><text x='34' y='41' font-size='10' font-weight='800' fill='#fff' font-family='sans-serif' text-anchor='middle'>10</text></svg>");
  const EVENT_ICON_FALLBACK = svgUri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><path d='M24 4l5.5 12.5 13.5 1.3-10.2 9 3 13.2L24 33l-11.8 7 3-13.2L5 17.8l13.5-1.3z' fill='#e9c46a'/></svg>");
  const eventIcon = (item) => EVENT_ICONS[item] || EVENT_ICON_FALLBACK;

  // ============================================================
  // СОБЫТИЯ: tasks that count themselves, rewards that open themselves
  // ============================================================
  // The server has the events (see events_store.py) and keeps who has what;
  // the app counts the tasks, because it is the one that sees the listening.
  const EVENTS_CACHE = "notka_events_cfg";
  let eventsCfg = [];
  try { eventsCfg = JSON.parse(localStorage.getItem(EVENTS_CACHE)) || []; } catch (e) { eventsCfg = []; }
  let currentEventId = null;
  function eventById(id) { return eventsCfg.find((e) => e.id === id) || null; }
  function activeEvents() { return eventsCfg.filter((e) => e.status === "active"); }
  function taskValue(eventId, task) {
    const v = (state.events.progress[eventId] || {})[task.id];
    return Array.isArray(v) ? v.length : +v || 0;
  }
  function eventPoints(ev) { return ev.tasks.filter((t) => !t.locked && taskValue(ev.id, t) >= t.target).length; }

  // something happened that a task may be waiting for
  function eventNote(kind, value, quiet) {
    let changed = false;
    activeEvents().forEach((ev) => ev.tasks.forEach((t) => {
      if (t.kind !== kind || t.locked || t.day > (ev.dayNow || 0)) return;
      const p = state.events.progress[ev.id] || (state.events.progress[ev.id] = {});
      if (t.unique) {
        const set = Array.isArray(p[t.id]) ? p[t.id] : (p[t.id] = []);
        if (set.length < t.target && !set.includes(String(value))) { set.push(String(value)); changed = true; }
      } else if (taskValue(ev.id, t) < t.target) {
        p[t.id] = Math.min(t.target, (+p[t.id] || 0) + value);
        changed = true;
      }
    }));
    if (!changed) return;
    reconcileEvents(true);
    if (!quiet) persist();
    scheduleEventSync();
  }
  // the rewards that need no number open here, at once; the numbered one waits for the server
  function reconcileEvents(announce) {
    activeEvents().forEach((ev) => {
      const points = eventPoints(ev);
      ev.tiers.forEach((tier) => {
        if (tier.plusDays || points < tier.points || ownsItem(tier.item)) return;
        state.events.items.push(tier.item);
        if (announce) announceReward(tier);
      });
    });
    renderEventUI();
  }
  // a reward is won: a moment of its own, one after another
  const rewardQueue = [];
  function announceReward(tier) {
    haptic("success");
    rewardQueue.push(tier);
    if ($("reward-pop").hidden) setTimeout(showNextReward, 350);
  }
  function showNextReward() {
    const tier = rewardQueue.shift();
    if (!tier) return;
    const pop = $("reward-pop");
    $("rp-img").src = eventIcon(tier.item);
    $("rp-title").textContent = tier.title;
    $("rp-text").textContent = tier.text;
    const isTheme = tier.item.startsWith("atmo_");
    $("rp-use").hidden = !isTheme;
    $("rp-use").dataset.atmo = isTheme ? tier.item.slice(5) : "";
    pop.hidden = false;
    const sparks = $("rp-sparks");
    const burstAt = (delay) => setTimeout(() => { if (!pop.hidden) PumpkinArt.burst(sparks, innerWidth / 2, innerHeight * 0.38, 26); }, delay);
    burstAt(250); burstAt(650); burstAt(1100);
  }
  function closeReward() {
    $("reward-pop").hidden = true;
    renderEventUI();
    if (rewardQueue.length) setTimeout(showNextReward, 300);
  }
  $("rp-ok").addEventListener("click", () => { haptic("light"); closeReward(); });
  $("rp-use").addEventListener("click", () => {
    const id = $("rp-use").dataset.atmo;
    closeReward();
    if (id) { setLook("atmo", id); showToast("Тема включена, выключить её можно в «Оформлении»"); }
  });
  let eventSyncTimer = null;
  function scheduleEventSync() {
    clearTimeout(eventSyncTimer);
    eventSyncTimer = setTimeout(syncEvents, 2500);
  }
  function mergeMine(ev, mine, quiet) {
    if (!mine) return;
    if (mine.plusUntil) rememberPlus(mine.plusUntil);
    const had = new Set(state.events.items);
    (mine.items || []).forEach((item) => {
      if (had.has(item)) return;
      state.events.items.push(item);
      const tier = ev.tiers.find((t) => t.item === item);
      if (tier && !quiet) announceReward(tier);
    });
    // what the server knows from another phone is not lost
    const p = state.events.progress[ev.id] || (state.events.progress[ev.id] = {});
    ev.tasks.forEach((t) => {
      if (t.locked) return;
      const server = Math.min(t.target, +((mine.progress || {})[t.id]) || 0);
      if (t.unique) {
        const set = Array.isArray(p[t.id]) ? p[t.id] : (p[t.id] = []);
        while (set.length < server) set.push("~" + set.length);
      } else if (server > (+p[t.id] || 0)) p[t.id] = server;
    });
    persist();
    renderEventUI();
    applyLook();
  }
  async function syncEvents() {
    for (const ev of activeEvents()) {
      const progress = {};
      ev.tasks.forEach((t) => { if (!t.locked) progress[t.id] = taskValue(ev.id, t); });
      try {
        const res = await fetch(`${API_BASE_URL}/events/sync`, { method: "POST", headers: { "content-type": "application/json", "X-Telegram-Init-Data": tgInitData }, body: JSON.stringify({ event: ev.id, progress }) });
        if (res.ok) mergeMine(ev, await res.json(), false);
      } catch (e) { /* the next change tries again */ }
    }
  }
  async function refreshEvents() {
    try {
      const res = await fetch(`${API_BASE_URL}/events`, { headers: { "X-Telegram-Init-Data": tgInitData } });
      if (!res.ok) return;
      eventsCfg = (await res.json()).events || [];
      try { localStorage.setItem(EVENTS_CACHE, JSON.stringify(eventsCfg)); } catch (e) { /* the list is fetched again */ }
      // today's visit first, so that a day the server already knows is not counted twice
      eventNote("visit", dayKey(Date.now()));
      eventsCfg.forEach((ev) => mergeMine(ev, ev.mine, true));
      reconcileEvents(true);
      syncEvents();
    } catch (e) { /* the cached list stays */ }
  }
  window.Atmosphere && (Atmosphere.onCatch = (what) => { if (what === "bat") eventNote("bat", 1); });

  // ---- the banner on Home and the page of the event ----
  const daysWord = (n) => `${n} ${plural(n, "день", "дня", "дней")}`;
  // the face of the pumpkin lights at 2, 3, 5 and 7 finished tasks; the whole of it at the last
  const PUMPKIN_STEPS = [2, 3, 5, 7];
  const dateOfDay = (ev, day) => new Date(new Date(ev.start + "T12:00:00").getTime() + (day - 1) * 86400000).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  let bannerPumpkinFor = null;
  function renderEventUI() {
    const banner = $("home-event");
    const ev = activeEvents()[0];
    banner.hidden = !ev;
    if (ev) {
      const points = eventPoints(ev), total = ev.tasks.length;
      const today = ev.tasks.find((t) => t.day === ev.dayNow && !t.locked);
      const todayDone = today && taskValue(ev.id, today) >= today.target;
      $("event-banner-title").textContent = ev.title;
      $("event-banner-word").textContent = ev.title;
      $("event-banner-kicker").textContent = points >= total ? "Всё горит" : ev.dayNow <= total ? `День ${ev.dayNow} из ${total}` : `Ещё ${daysWord(ev.days)}`;
      $("event-banner-sub").innerHTML = points >= total ? "Все задания выполнены" : todayDone ? `Сегодня готово · <b id="event-banner-count">${points}/${total}</b>` : `Зажги тыкву · <b id="event-banner-count">${points}/${total}</b>`;
      $("event-banner-bars").innerHTML = Array.from({ length: total }, (_, i) => `<i class="${points > i ? "is-on" : ""}"></i>`).join("");
      const holder = $("event-banner-pk");
      if (bannerPumpkinFor !== ev.id) { holder.innerHTML = PumpkinArt.svg(); bannerPumpkinFor = ev.id; }
      PumpkinArt.lightTo(holder, points, { total, steps: PUMPKIN_STEPS });
    }
    if (currentScreen === "event") renderEventScreen();
  }

  // what to do about each kind of task, and where it leads
  const TASK_GO = {
    listen: { label: "Включить музыку", run: () => showScreen("home") },
    night: { label: "Включить музыку", run: () => showScreen("home") },
    mood: { label: "Выбрать настроение", run: () => showScreen("mood") },
    fav: { label: "Найти треки", run: () => showScreen("search") },
    playlist: { label: "Найти треки", run: () => showScreen("search") },
    share: { label: "Выбрать плейлист", run: () => showScreen("library") },
    bat: { label: "Лови мышей здесь", run: () => { haptic("light"); showToast("Нажми на летучую мышь, когда она пролетает"); } },
  };
  const isOpen = (ev, t) => !t.locked && t.day <= (ev.dayNow || 0);
  const isDone = (ev, t) => isOpen(ev, t) && taskValue(ev.id, t) >= t.target;
  // today's task first, then the ones that were missed (the oldest first)
  function nextTask(ev) {
    const open = ev.tasks.filter((t) => isOpen(ev, t) && !isDone(ev, t));
    return open.find((t) => t.day === ev.dayNow) || open[0] || null;
  }
  const taskLine = (ev, t) => {
    const v = taskValue(ev.id, t);
    return v >= t.target ? "Готово" : `${Math.floor(v)} из ${t.target}${t.unit ? " " + t.unit : ""}`;
  };
  let eventLitShown = -1;
  let eventScreenFresh = false;
  function renderEventScreen() {
    const ev = eventById(currentEventId);
    if (!ev) return;
    const points = eventPoints(ev), total = ev.tasks.length;
    $("event-days").textContent = ev.status === "active" ? (ev.dayNow <= total ? `День ${ev.dayNow} из ${total}` : `Ещё ${daysWord(ev.days)}`) : "Завершено";
    const title = $("event-title");
    title.textContent = ev.title;
    title.style.setProperty("--len", String(ev.title.length));
    $("event-count").textContent = String(points);
    $("event-count-of").innerHTML = `из ${total}<br>заданий выполнено`;

    // the pumpkin: built once, lit up part by part each time the page is opened
    const stage = $("event-stage");
    if (!stage.firstElementChild) {
      stage.innerHTML = PumpkinArt.svg();
      stage.addEventListener("click", (e) => {
        const r = stage.getBoundingClientRect();
        stage.classList.remove("is-boop"); void stage.offsetWidth; stage.classList.add("is-boop");
        PumpkinArt.burst(stage, e.clientX - r.left, e.clientY - r.top, 14);
        haptic("light");
      });
      const look = (e) => {
        const r = stage.getBoundingClientRect();
        const nx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / 220));
        const ny = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / 260));
        stage.style.setProperty("--px", `${(nx * 6).toFixed(1)}px`);
        stage.style.setProperty("--py", `${(ny * 5).toFixed(1)}px`);
      };
      window.addEventListener("touchmove", (e) => { if (currentScreen === "event" && e.touches[0]) look(e.touches[0]); }, { passive: true });
      window.addEventListener("mousemove", (e) => { if (currentScreen === "event") look(e); });
    }
    const light = { total, steps: PUMPKIN_STEPS };
    if (eventScreenFresh || eventLitShown < 0) {
      eventScreenFresh = false;
      PumpkinArt.lightTo(stage, points, Object.assign({ animate: true, delay: 600, onStep: (c) => { haptic("light"); const r = stage.getBoundingClientRect(); PumpkinArt.burst(stage, r.width / 2, r.height * 0.55, 6); } }, light));
    } else if (points !== eventLitShown) {
      PumpkinArt.lightTo(stage, points, light);
    }
    eventLitShown = points;

    // the days, as a calendar of ten small lights: done, today, missed, still closed
    $("event-calendar").innerHTML = ev.tasks.map((t) => {
      const done = isDone(ev, t), open = isOpen(ev, t);
      const cls = done ? "is-done" : !open ? "is-closed" : t.day === ev.dayNow ? "is-today" : "is-missed";
      return `<span class="cal-day ${cls}" title="${open ? "" : `Откроется ${dateOfDay(ev, t.day)}`}">${done ? '<svg width="14" height="14" aria-hidden="true"><use href="#i-check"/></svg>' : t.day}</span>`;
    }).join("");

    // what to do next, in one card
    const next = $("event-next");
    const task = nextTask(ev);
    if (points >= total) {
      next.className = "event-next glass is-done";
      next.innerHTML = `<span class="event-next-k">Готово</span><b class="event-next-t">Тыква горит ярче всех</b><span class="event-next-s">Все задания выполнены. Награды уже у тебя.</span>`;
    } else if (!task) {
      const tomorrow = ev.tasks.find((t) => t.day === (ev.dayNow || 0) + 1);
      next.className = "event-next glass";
      next.innerHTML = `<span class="event-next-k">Сегодня готово</span><b class="event-next-t">Новое задание завтра</b><span class="event-next-s">${tomorrow ? `Откроется ${dateOfDay(ev, tomorrow.day)}` : "Заходи завтра"}</span>`;
    } else {
      const go = TASK_GO[task.kind];
      next.className = "event-next glass";
      next.innerHTML = `<span class="event-next-k">${task.day === ev.dayNow ? `Задание дня ${task.day}` : `Пропущено · день ${task.day}`}</span><b class="event-next-t">${task.title}</b><span class="event-next-s">${taskLine(ev, task)}</span>${go && go.run ? `<br><button class="event-next-btn" type="button" id="event-next-btn">${go.label}<svg width="18" height="18" aria-hidden="true"><use href="#i-chevron"/></svg></button>` : ""}`;
      const btn = $("event-next-btn");
      if (btn) btn.addEventListener("click", () => { haptic("light"); go.run(); });
    }

    $("event-rewards").innerHTML = ev.tiers.map((tier) => {
      const open = ownsItem(tier.item) || (tier.plusDays && points >= tier.points && hasRealPlus());
      const left = tier.points - points;
      const sub = open ? "Получено" : left > 0 ? `Ещё ${left} ${plural(left, "задание", "задания", "заданий")}` : "Скоро";
      return `<li class="event-reward glass ${open ? "is-open" : "is-locked"}" data-item="${tier.item}"><span class="er-medal"><img alt="" src="${eventIcon(tier.item)}"></span><span class="er-text"><b>${tier.title}</b><em>${sub}</em></span><span class="er-pts">${tier.points}</span></li>`;
    }).join("");
    $("event-debug").hidden = !plusPreview();
    // the tasks that have opened, and the days that have not (only their date shows)
    $("event-tasks").innerHTML = ev.tasks.map((t) => {
      if (!isOpen(ev, t)) return `<li class="event-task glass is-closed"><span class="et-n">${t.day}</span><span class="et-body"><b>Задание дня ${t.day}</b><em>Откроется ${dateOfDay(ev, t.day)}</em></span></li>`;
      const v = taskValue(ev.id, t), done = v >= t.target, go = TASK_GO[t.kind];
      const canGo = !done && go && go.run;
      return `<li class="event-task glass${done ? " is-done" : ""}"${canGo ? ` data-go="${t.kind}"` : ""}><span class="et-n">${done ? '<svg width="18" height="18" aria-hidden="true"><use href="#i-check"/></svg>' : t.day}</span><span class="et-body"><b>${t.title}</b><span class="et-bar"><i style="--w:${Math.min(1, v / t.target).toFixed(3)}"></i></span><em>${taskLine(ev, t)}</em></span>${canGo ? '<span class="et-go"><svg width="18" height="18" aria-hidden="true"><use href="#i-chevron"/></svg></span>' : ""}</li>`;
    }).join("");
  }
  $("event-tasks").addEventListener("click", (e) => {
    const li = e.target.closest(".event-task[data-go]");
    if (li && TASK_GO[li.dataset.go].run) { haptic("light"); TASK_GO[li.dataset.go].run(); }
  });
  // ---- checking an event without doing its tasks (preview mode) ----
  function completeTask(ev, t) {
    const p = state.events.progress[ev.id] || (state.events.progress[ev.id] = {});
    if (t.unique) p[t.id] = Array.from({ length: t.target }, (_, i) => (p[t.id] && p[t.id][i]) || `test${i}`);
    else p[t.id] = t.target;
  }
  function finishChecking(ev) {
    reconcileEvents(true);
    persist();
    syncEvents();
    renderEventScreen();
  }
  $("evd-day").addEventListener("click", async () => {
    haptic("light");
    try { await fetch(`${API_BASE_URL}/events/advance`, { method: "POST" }); } catch (e) { /* nothing then */ }
    await refreshEvents();
    showToast("Открыт следующий день");
  });
  $("evd-next").addEventListener("click", () => {
    const ev = eventById(currentEventId);
    const t = ev && nextTask(ev);
    if (!t) { showToast("Все задания уже выполнены"); return; }
    haptic("light");
    completeTask(ev, t);
    finishChecking(ev);
  });
  $("evd-all").addEventListener("click", () => {
    const ev = eventById(currentEventId);
    if (!ev) return;
    haptic("light");
    ev.tasks.forEach((t) => { if (isOpen(ev, t)) completeTask(ev, t); });
    finishChecking(ev);
  });
  $("evd-reset").addEventListener("click", async () => {
    const ev = eventById(currentEventId);
    if (!ev) return;
    haptic("light");
    try { await fetch(`${API_BASE_URL}/events/reset`, { method: "POST", headers: { "content-type": "application/json", "X-Telegram-Init-Data": tgInitData }, body: JSON.stringify({ event: ev.id }) }); } catch (e) { /* only the phone is reset then */ }
    delete state.events.progress[ev.id];
    const mine = new Set(ev.tiers.map((t) => t.item));
    state.events.items = state.events.items.filter((it) => !mine.has(it));
    ev.dayNow = 0;
    persist();
    eventLitShown = -1;
    eventScreenFresh = true;
    eventNote("visit", dayKey(Date.now()));
    renderEventUI();
    applyLook();
    refreshEvents();
    showToast("Событие сброшено");
  });
  function openEvent(id) {
    currentEventId = id;
    haptic("light");
    eventScreenFresh = true;
    showScreen("event");
    refreshEvents();
  }
  $("home-event").addEventListener("click", () => { const ev = activeEvents()[0]; if (ev) openEvent(ev.id); });
  $("event-back-btn").addEventListener("click", goBack);
  // a reward is tapped: shown again if it is won, or what is still needed
  $("event-rewards").addEventListener("click", (e) => {
    const li = e.target.closest(".event-reward");
    const ev = eventById(currentEventId);
    if (!li || !ev) return;
    const tier = ev.tiers.find((t) => t.item === li.dataset.item);
    haptic("light");
    if (ownsItem(tier.item)) { rewardQueue.push(tier); showNextReward(); return; }
    const left = tier.points - eventPoints(ev);
    showToast(left > 0 ? `${tier.title}: ещё ${left} ${plural(left, "задание", "задания", "заданий")}` : "Тираж уже разобран");
  });
  renderEventUI();
  refreshEvents();

  // ---- promo code: typed in by hand, or brought by a link from an ad ----
  const promoInput = $("promo-input");
  const PROMO_PROBLEMS = {
    NOT_FOUND: "Такого промокода нет. Проверь, нет ли опечатки.",
    BAD_CODE: "Такого промокода нет. Проверь, нет ли опечатки.",
    EXPIRED: "Этот промокод уже не действует.",
    EXHAUSTED: "Этот промокод уже разобрали — активации закончились.",
    ALREADY_USED: "Этот промокод уже был активирован на твоём аккаунте.",
    TOO_MANY_TRIES: "Слишком много попыток. Попробуй через час.",
    NOT_IN_TELEGRAM: "Промокод можно активировать только из Telegram.",
  };
  function promoError(text) {
    $("promo-error").textContent = text || "";
    $("promo-error").hidden = !text;
  }
  function openPromo(code) {
    promoInput.value = code || "";
    promoError("");
    $("promo-confirm").classList.remove("is-busy");
    $("promo-step-enter").hidden = false;
    $("promo-step-done").hidden = true;
    openOverlay("promo-modal");
    if (code) redeemPromo();
    else setTimeout(() => promoInput.focus(), 60);
  }
  async function redeemPromo() {
    const code = promoInput.value.trim();
    if (!code) { promoInput.focus(); return; }
    if ($("promo-confirm").classList.contains("is-busy")) return;
    promoError("");
    $("promo-confirm").classList.add("is-busy");
    let data = null, problem = null;
    try {
      const res = await fetch(`${API_BASE_URL}/plus/redeem`, {
        method: "POST",
        headers: { "content-type": "application/json", "X-Telegram-Init-Data": tgInitData },
        body: JSON.stringify({ code }),
      });
      const body = await res.json();
      if (res.ok) data = body;
      else problem = PROMO_PROBLEMS[body && body.error && body.error.code] || "Не получилось активировать промокод. Попробуй ещё раз.";
    } catch (e) {
      problem = "Нет связи с Ноткой. Попробуй ещё раз.";
    }
    $("promo-confirm").classList.remove("is-busy");
    if (!data) { promoError(problem); haptic("error"); return; }
    rememberPlus(data.until);
    keepTriedLook();
    haptic("success");
    $("promo-done-until").textContent = `${data.days} ${plural(data.days, "день", "дня", "дней")} Плюса — до ${longDate(data.until)}`;
    // a limited run is felt when the number is seen
    $("promo-done-left").textContent = data.limit > 1 ? `Ты в числе первых ${data.limit}. Осталось активаций: ${data.left}` : "";
    $("promo-step-enter").hidden = true;
    $("promo-step-done").hidden = false;
  }
  $("plus-promo-btn").addEventListener("click", () => openPromo(""));
  $("promo-cancel").addEventListener("click", () => closeOverlay("promo-modal"));
  $("promo-done-btn").addEventListener("click", () => closeOverlay("promo-modal"));
  $("promo-confirm").addEventListener("click", redeemPromo);
  promoInput.addEventListener("keydown", (e) => { if (e.key === "Enter") redeemPromo(); });
  promoInput.addEventListener("input", () => promoError(""));

  // ============================================================
  // LISTENING STATS (local)
  // ============================================================
  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if ([2, 3, 4].includes(m10) && ![12, 13, 14].includes(m100)) return few;
    return many;
  }
  function dayKey(ms) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  // What was heard in a period: "all" comes from the running totals, a
  // number of days — from the per-day records (kept for a month).
  function statsFor(period) {
    const L = listensView();
    let seconds = L.seconds, plays = L.plays, tracks, artists;
    if (period === "all") {
      tracks = Object.values(L.tracks).map((x) => ({ track: x.track, plays: x.plays, seconds: x.seconds }));
      artists = Object.entries(L.artists).map(([name, a]) => ({ name, plays: a.plays, seconds: a.seconds }));
    } else {
      const since = dayKey(Date.now() - (period - 1) * 86400000);
      const t = {}, a = {};
      seconds = 0; plays = 0;
      Object.entries(L.days || {}).forEach(([key, day]) => {
        if (key < since) return;
        seconds += day.s; plays += day.p;
        Object.entries(day.t).forEach(([id, v]) => { const x = t[id] || (t[id] = [0, 0]); x[0] += v[0]; x[1] += v[1]; });
        Object.entries(day.a).forEach(([name, v]) => { const x = a[name] || (a[name] = [0, 0]); x[0] += v[0]; x[1] += v[1]; });
      });
      tracks = Object.entries(t).filter(([id]) => L.tracks[id]).map(([id, v]) => ({ track: L.tracks[id].track, plays: v[0], seconds: v[1] }));
      artists = Object.entries(a).map(([name, v]) => ({ name, plays: v[0], seconds: v[1] }));
    }
    tracks.sort((x, y) => y.plays - x.plays || y.seconds - x.seconds);
    artists.sort((x, y) => y.seconds - x.seconds);
    const albums = {};
    tracks.forEach((x) => {
      const tr = x.track;
      if (!tr.album || !tr.albumId) return;
      const al = albums[tr.albumId] || (albums[tr.albumId] = { track: tr, seconds: 0 });
      al.seconds += x.seconds;
    });
    return { seconds, plays, tracks, artists, albums: Object.values(albums).sort((x, y) => y.seconds - x.seconds) };
  }

  // An artist's face: the photo we already know, else the cover of their
  // most played track — and the real photo is fetched once and remembered.
  function artistRef(name) {
    const a = listensView().artists[name] || {};
    if (a.artistId) return { artistId: a.artistId, source: a.source };
    const hit = Object.values(listensView().tracks).find((x) => x.track.artist === name && x.track.artistId);
    return hit ? { artistId: hit.track.artistId, source: hit.track.source } : {};
  }
  function artistFace(name) {
    const a = listensView().artists[name] || {};
    if (a.photo) return a.photo;
    if (state.followedMeta[name] && state.followedMeta[name].photo) return state.followedMeta[name].photo;
    const own = Object.values(listensView().tracks).filter((x) => x.track.artist === name && x.track.artwork).sort((x, y) => y.seconds - x.seconds)[0];
    return own ? own.track.artwork : null;
  }
  const artistPhotoAsked = new Set();
  async function fetchArtistPhoto(name) {
    const a = listensView().artists[name];
    if (!a || a.photo || artistPhotoAsked.has(name)) return null;
    artistPhotoAsked.add(name);
    const ref = artistRef(name);
    if (!ref.artistId || !ref.source) return null;
    try {
      const res = await fetch(`${API_BASE_URL}/artist?source=${encodeURIComponent(ref.source)}&id=${encodeURIComponent(ref.artistId)}`);
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.photo) return null;
      a.photo = data.photo;
      persist();
      return data.photo;
    } catch (e) { return null; }
  }

  function countUp(el, to) {
    const from = +el.dataset.n || 0;
    el.dataset.n = to;
    const start = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - start) / 700);
      el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))).toLocaleString("ru-RU");
      if (k < 1 && +el.dataset.n === to) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // How long that is, in terms of something from life.
  function minutesNote(m) {
    if (m < 20) return "Только начало. Дальше — больше.";
    if (m < 60) return "Почти целый альбом от первой до последней песни.";
    if (m < 150) return "Столько идёт хороший фильм в кино.";
    if (m < 400) return "Как долететь из Москвы до Новосибирска — всю дорогу в наушниках.";
    if (m < 1440) return "Целый рабочий день, только с музыкой.";
    if (m < 10080) return "Больше суток чистой музыки без пауз.";
    return "Больше недели чистой музыки без пауз.";
  }

  function revealStats() { revealIn("screen-stats", true); }

  let statsPeriod = "all";
  let statsToken = 0;
  function renderStatsScreen() {
    const token = ++statsToken;
    const S = statsFor(statsPeriod);
    const body = $("stats-body");
    const empty = !S.tracks.length || S.seconds < 1;
    body.hidden = empty;
    $("stats-lede").hidden = !empty;
    if (empty) {
      $("stats-lede").textContent = listensView().plays
        ? (statsPeriod === 7 ? "За эту неделю пока тихо. Включи что-нибудь — и цифры появятся." : "За этот месяц пока тихо. Включи что-нибудь — и цифры появятся.")
        : "Послушай пару треков — и здесь появится твоя статистика.";
      return;
    }
    const minutes = Math.max(1, Math.round(S.seconds / 60));
    $("stats-num-minutes").classList.toggle("is-long", minutes >= 1000);
    countUp($("stats-num-minutes"), minutes);
    $("stats-label-minutes").textContent = plural(minutes, "минута", "минуты", "минут");
    $("stats-note").textContent = minutesNote(minutes);
    countUp($("stats-num-plays"), S.plays);
    $("stats-label-plays").textContent = plural(S.plays, "прослушивание", "прослушивания", "прослушиваний");
    countUp($("stats-num-tracks"), S.tracks.length);
    $("stats-label-tracks").textContent = plural(S.tracks.length, "трек", "трека", "треков");
    countUp($("stats-num-artists"), S.artists.length);
    $("stats-label-artists").textContent = plural(S.artists.length, "исполнитель", "исполнителя", "исполнителей");

    const openArtist = (name) => openArtistScreen(name, [], artistRef(name));
    const top = S.artists[0];
    const heroMinutes = Math.max(1, Math.round(top.seconds / 60));
    $("stats-hero-name").textContent = top.name;
    $("stats-hero-sub").textContent = `${heroMinutes} ${plural(heroMinutes, "минута", "минуты", "минут")} вместе`;
    const paintHero = (url) => {
      setCoverEl($("stats-hero-cover"), url ? hiResArtwork(url) : null, top.name);
      $("stats-hero-glow").style.backgroundImage = url ? `url("${url.replace(/"/g, "%22")}")` : "";
    };
    paintHero(artistFace(top.name));
    $("stats-hero").onclick = () => openArtist(top.name);

    const shelf = $("stats-top-artists");
    shelf.innerHTML = "";
    const rest = S.artists.slice(1, 8);
    $("stats-artists-block").hidden = !rest.length;
    const faces = [[top.name, paintHero]];
    rest.forEach((a, i) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "shelf-card";
      card.style.setProperty("--i", i);
      const wrap = document.createElement("span");
      wrap.className = "rank-pair";
      const cover = document.createElement("span");
      cover.className = "cover";
      setCoverEl(cover, artistFace(a.name), a.name);
      const rank = document.createElement("span");
      rank.className = "rank-num";
      rank.setAttribute("aria-hidden", "true");
      rank.textContent = String(i + 2);
      wrap.appendChild(rank);
      wrap.appendChild(cover);
      const title = document.createElement("span");
      title.className = "shelf-title";
      title.textContent = a.name;
      const m = Math.max(1, Math.round(a.seconds / 60));
      const sub = document.createElement("span");
      sub.className = "shelf-sub";
      sub.textContent = `${m} мин`;
      card.appendChild(wrap);
      card.appendChild(title);
      card.appendChild(sub);
      card.addEventListener("click", () => openArtist(a.name));
      shelf.appendChild(card);
      faces.push([a.name, (url) => setCoverEl(cover, url, a.name)]);
    });

    const list = $("stats-top-tracks");
    list.innerHTML = "";
    const topTracks = S.tracks.slice(0, 3).map((x) => x.track);
    topTracks.forEach((t, i) => list.appendChild(buildTrackRow(t, { index: i + 1, queue: topTracks, context: "Статистика" })));

    const albumShelf = $("stats-top-albums");
    albumShelf.innerHTML = "";
    const albums = S.albums.slice(0, 5);
    $("stats-albums-block").hidden = !albums.length;
    albums.forEach((al, i) => {
      const tr = al.track;
      const card = document.createElement("button");
      card.type = "button";
      card.className = "shelf-card";
      card.style.setProperty("--i", i);
      const cover = document.createElement("span");
      cover.className = "cover";
      setCoverEl(cover, hiResArtwork(tr.artwork), tr.albumId);
      const title = document.createElement("span");
      title.className = "shelf-title";
      title.textContent = tr.album;
      const sub = document.createElement("span");
      sub.className = "shelf-sub";
      sub.textContent = tr.artist || "";
      card.appendChild(cover);
      card.appendChild(title);
      card.appendChild(sub);
      card.addEventListener("click", () => openAlbumById(tr.source, tr.albumId, tr.album, tr.artist));
      albumShelf.appendChild(card);
    });

    revealStats();

    // real photos arrive one by one and replace the stand-in covers
    (async () => {
      for (const [name, paint] of faces) {
        const photo = await fetchArtistPhoto(name);
        if (token !== statsToken) return;
        if (photo) paint(photo);
      }
    })();
  }
  $("stats-periods").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    statsPeriod = chip.dataset.period === "all" ? "all" : +chip.dataset.period;
    $("stats-periods").querySelectorAll(".chip").forEach((c) => {
      c.classList.toggle("active", c === chip);
      c.setAttribute("aria-selected", c === chip ? "true" : "false");
    });
    haptic("light");
    renderStatsScreen();
  });
  $("stats-back-btn").addEventListener("click", goBack);

  // ============================================================
  // ИТОГИ: карточки месяца и всего времени, которыми можно поделиться
  // ============================================================
  let recapPeriod = "30";
  let recapCards = [];
  function recapData() {
    const all = recapPeriod === "all";
    const S = statsFor(all ? "all" : 30);
    if (!S.tracks.length || S.seconds < 1) return [];
    const minutes = Math.max(1, Math.round(S.seconds / 60));
    const cards = [{ type: "minutes", kicker: all ? "Всё время в Нотке" : "Твой месяц в Нотке", minutes, word: `${plural(minutes, "минута", "минуты", "минут")} музыки`, note: minutesNote(minutes), tracks: S.tracks.length, artists: S.artists.length }];
    const top = S.artists[0];
    if (top) {
      const m = Math.max(1, Math.round(top.seconds / 60));
      cards.push({ type: "artist", kicker: "Исполнитель № 1", name: top.name, photo: artistFace(top.name), sub: `${m} ${plural(m, "минута", "минуты", "минут")} вместе` });
    }
    if (S.tracks.length >= 2) cards.push({ type: "tracks", kicker: "Чаще всего играло", rows: S.tracks.slice(0, 5).map((x) => ({ title: x.track.title, sub: x.track.artist || "", art: x.track.artwork, seed: x.track.id })) });
    if (S.artists.length >= 3) cards.push({ type: "artists", kicker: "Твоя пятёрка", rows: S.artists.slice(0, 5).map((a) => { const m = Math.max(1, Math.round(a.seconds / 60)); return { title: a.name, sub: `${m} ${plural(m, "минута", "минуты", "минут")}`, art: artistFace(a.name), seed: a.name }; }) });
    return cards;
  }
  function recapCardEl(card, i) {
    const el = document.createElement("article");
    el.className = "rcp-card";
    el.dataset.v = String(i % 4);
    const mk = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
    const top = mk("div", "rcp-top");
    const brand = mk("span", "rcp-brand");
    brand.innerHTML = '<svg aria-hidden="true"><use href="#logo-note"/></svg>';
    brand.appendChild(document.createTextNode("нотка"));
    top.append(brand, mk("span", "rcp-pill", card.kicker));
    el.appendChild(top);
    if (card.type === "minutes") {
      const num = mk("b", "rcp-num", card.minutes.toLocaleString("ru-RU"));
      if (String(card.minutes).length >= 4) num.classList.add("is-long");
      el.append(num, mk("span", "rcp-word", card.word), mk("p", "rcp-note", card.note));
      const plate = mk("div", "rcp-plate");
      [[card.tracks, plural(card.tracks, "трек", "трека", "треков")], [card.artists, plural(card.artists, "исполнитель", "исполнителя", "исполнителей")]].forEach(([n, w]) => {
        const st = mk("span", "rcp-stat");
        st.append(mk("b", "", String(n)), mk("span", "", w));
        plate.appendChild(st);
      });
      el.appendChild(plate);
    } else if (card.type === "artist") {
      el.classList.add("is-artist");
      const head = mk("div", "rcp-artist-head");
      head.append(mk("b", "rcp-name", card.name), mk("span", "rcp-word", card.sub));
      const disc = mk("div", "rcp-disc");
      const cv = mk("span");
      setCoverEl(cv, card.photo ? hiResArtwork(card.photo) : null, card.name);
      disc.appendChild(cv);
      el.append(head, disc);
    } else {
      const list = mk("div", "rcp-list");
      card.rows.forEach((r, n) => {
        const row = mk("div", "rcp-row" + (card.type === "artists" ? " is-round" : ""));
        const cv = mk("span", "cover");
        setCoverEl(cv, r.art ? hiResArtwork(r.art) : null, r.seed);
        const t = mk("span", "t");
        t.append(mk("b", "", r.title), mk("em", "", r.sub));
        row.append(mk("i", "", String(n + 1)), cv, t);
        list.appendChild(row);
      });
      el.appendChild(list);
    }
    return el;
  }
  function renderRecap() {
    recapCards = recapData();
    const empty = !recapCards.length;
    $("recap-body").hidden = empty;
    $("recap-empty").hidden = !empty;
    if (empty) return;
    const deck = $("recap-deck");
    deck.textContent = "";
    recapCards.forEach((c, i) => deck.appendChild(recapCardEl(c, i)));
    deck.scrollLeft = 0;
    const dots = $("recap-dots");
    dots.textContent = "";
    recapCards.forEach((_, i) => { const d = document.createElement("i"); if (i === 0) d.className = "is-on"; dots.appendChild(d); });
    revealIn("screen-recap", true);
  }
  function recapIndex() {
    const deck = $("recap-deck");
    const first = deck.firstElementChild;
    if (!first) return 0;
    const step = first.offsetWidth + 12;
    return Math.max(0, Math.min(recapCards.length - 1, Math.round(deck.scrollLeft / step)));
  }
  $("recap-deck").addEventListener("scroll", () => {
    const i = recapIndex();
    $("recap-dots").querySelectorAll("i").forEach((d, n) => d.classList.toggle("is-on", n === i));
  }, { passive: true });
  $("recap-periods").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    recapPeriod = chip.dataset.period;
    $("recap-periods").querySelectorAll(".chip").forEach((c) => {
      c.classList.toggle("active", c === chip);
      c.setAttribute("aria-selected", c === chip ? "true" : "false");
    });
    haptic("light");
    renderRecap();
  });
  $("recap-back-btn").addEventListener("click", goBack);
  $("recap-modal-close").addEventListener("click", () => closeOverlay("recap-modal"));
  function openRecap() {
    if (!hasPlus()) { showToast("Итоги входят в Нотку Плюс"); showScreen("plus"); return; }
    showScreen("recap");
  }
  $("stats-recap-btn").addEventListener("click", openRecap);
  $("plus-recap-btn").addEventListener("click", openRecap);

  // карточка как картинка
  const loadShareImgOnce = (url) => new Promise((resolve) => {
    if (!url) { resolve(null); return; }
    const img = new Image();
    const timer = setTimeout(() => resolve(null), 8000);
    img.crossOrigin = "anonymous";
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = url;
  });
  // обложка иногда не успевает с первого раза: одна повторная попытка
  const loadShareImg = async (url) => (await loadShareImgOnce(url)) || (await loadShareImgOnce(url));
  function coverFit(ctx, img, x, y, w, h) {
    const k = Math.max(w / img.width, h / img.height);
    const iw = w / k, ih = h / k;
    ctx.drawImage(img, (img.width - iw) / 2, (img.height - ih) / 2, iw, ih, x, y, w, h);
  }
  function roundPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function wrapLines(ctx, text, maxW, maxLines) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = "";
    words.forEach((w) => {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    });
    if (line) lines.push(line);
    return lines.slice(0, maxLines);
  }
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  function lumOf(color) {
    try {
      const c = document.createElement("canvas"); c.width = c.height = 1;
      const x = c.getContext("2d", { willReadFrequently: true });
      x.fillStyle = color; x.fillRect(0, 0, 1, 1);
      const d = x.getImageData(0, 0, 1, 1).data;
      return (0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2]) / 255;
    } catch (e) { return 0.5; }
  }
  function themeColors() {
    const css = getComputedStyle(document.documentElement);
    const col = (n, d) => (css.getPropertyValue(n) || d).trim() || d;
    return { core: col("--c-core", "#FFE9DF"), warm: col("--c-warm", "#FFA6B8"), mid: col("--c-mid", "#FF4FA0"), deep: col("--c-deep", "#44112F") };
  }
  // логотип Нотки для картинок: знак из двух модулей (прямоугольник и четверть круга)
  const LOGO_PATHS = [new Path2D("M120 120C86.8629 120 60 93.1371 60 60V0H120V120Z"), new Path2D("M0 120H60V60C60 26.8629 33.1371 0 0 0V120Z")];
  function drawLogo(ctx, x, y, size, color) {
    ctx.save();
    ctx.translate(x, y);
    const k = size / 120;
    ctx.scale(k, k);
    ctx.fillStyle = color;
    LOGO_PATHS.forEach((p) => ctx.fill(p));
    ctx.restore();
  }
  const SHARE_FONT = "Onest, system-ui, -apple-system, sans-serif";
  const BRAND_FONT = "Unbounded, Onest, system-ui, sans-serif";
  // вертикальная плашка из стекла, как в карточках с цитатами
  function glassPlate(ctx, x, y, w, h, r, strong) {
    roundPath(ctx, x, y, w, h, r);
    ctx.fillStyle = strong ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.13)"; ctx.fill();
    ctx.strokeStyle = strong ? "rgba(255,255,255,0.32)" : "rgba(255,255,255,0.24)"; ctx.lineWidth = 2.5; ctx.stroke();
  }
  async function renderRecapImage(card, index) {
    try { await document.fonts.load("800 100px Onest"); await document.fonts.load("700 46px Unbounded"); } catch (e) { /* the system font is fine */ }
    const W = 1080, H = 1350, F = SHARE_FONT;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.textBaseline = "alphabetic";
    const th = themeColors();
    const deep = rgbOf(th.deep), warm = rgbOf(th.warm), mid = rgbOf(th.mid);
    ctx.fillStyle = rgba(mixRgb(deep, [12, 10, 18], 0.6), 1); ctx.fillRect(0, 0, W, H);
    const v = index % 4;
    const lights = [[[120, 80, 780, warm, 0.8], [1080, 800, 740, mid, 0.66]], [[1060, 80, 760, warm, 0.8], [0, 900, 740, mid, 0.66]], [[540, 1350, 860, warm, 0.76], [0, 120, 700, mid, 0.66]], [[0, 1350, 780, warm, 0.78], [1080, 150, 740, mid, 0.66]]][v];
    lights.forEach(([x, y, r, col, al]) => glowAt(ctx, x, y, r, col, al));
    const pad = 84;
    // метка и подпись периода
    drawLogo(ctx, pad, 76, 60, "rgba(255,255,255,0.92)");
    ctx.fillStyle = "rgba(255,255,255,0.92)"; ctx.font = `800 44px ${F}`;
    ctx.font = `700 46px ${BRAND_FONT}`; try { ctx.letterSpacing = "-2px"; } catch (e) { /* the plain spacing is fine */ }
    ctx.fillText("нотка", pad + 76, 126);
    try { ctx.letterSpacing = "0px"; } catch (e) { /* ok */ }
    ctx.font = `700 40px ${F}`;
    const kick = cutText(ctx, card.kicker, 520);
    const kw = ctx.measureText(kick).width + 64;
    glassPlate(ctx, W - 60 - kw, 64, kw, 90, 45, false);
    ctx.fillStyle = "#fff";
    ctx.fillText(kick, W - 60 - kw + 32, 124);
    ctx.fillStyle = "#fff";
    if (card.type === "minutes") {
      const num = card.minutes.toLocaleString("ru-RU");
      const size = num.length >= 6 ? 290 : num.length >= 4 ? 350 : 420;
      ctx.font = `800 ${size}px ${F}`;
      ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = 36;
      ctx.fillText(num, pad - 10, 640);
      ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
      ctx.font = `800 82px ${F}`;
      ctx.fillText(card.word, pad, 750);
      ctx.fillStyle = "rgba(255,255,255,0.78)"; ctx.font = `500 46px ${F}`;
      wrapLines(ctx, card.note, W - pad * 2, 3).forEach((l, i) => ctx.fillText(l, pad, 835 + i * 60));
      const px = 60, ph = 190, py = H - 60 - ph, pw = W - 120;
      glassPlate(ctx, px, py, pw, ph, 56, false);
      const stats = [[card.tracks, plural(card.tracks, "трек", "трека", "треков")], [card.artists, plural(card.artists, "исполнитель", "исполнителя", "исполнителей")]];
      stats.forEach(([n, w], i) => {
        const cx = px + pw * (i * 2 + 1) / 4;
        ctx.textAlign = "center";
        ctx.fillStyle = "#fff"; ctx.font = `800 84px ${F}`; ctx.fillText(String(n), cx, py + 98);
        ctx.fillStyle = "rgba(255,255,255,0.75)"; ctx.font = `500 40px ${F}`; ctx.fillText(w, cx, py + 154);
        ctx.textAlign = "left";
      });
      ctx.fillStyle = "rgba(255,255,255,0.22)"; ctx.fillRect(px + pw / 2 - 1, py + 40, 2, ph - 80);
    } else if (card.type === "artist") {
      ctx.font = `800 132px ${F}`;
      const lines = wrapLines(ctx, card.name, W - pad * 2, 3);
      ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = 30;
      ctx.fillStyle = "#fff";
      lines.forEach((l, i) => ctx.fillText(l, pad, 300 + i * 126));
      ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
      ctx.font = `800 62px ${F}`; ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillText(card.sub, pad, 300 + lines.length * 126 + 22);
      const img = await loadShareImg(card.photo ? hiResArtwork(card.photo) : null);
      const dx = 690, dy = 1400, dr = 640;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = 70; ctx.shadowOffsetY = 24;
      ctx.fillStyle = "#1a0b16"; ctx.beginPath(); ctx.arc(dx, dy, dr + 12, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.beginPath(); ctx.arc(dx, dy, dr, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = rgba(mid, 1); ctx.fillRect(dx - dr, dy - dr, dr * 2, dr * 2);
      if (img) { ctx.translate(dx, dy); ctx.rotate(-0.22); coverFit(ctx, img, -dr, -dr, dr * 2, dr * 2); ctx.rotate(0.22); ctx.translate(-dx, -dy); }
      ctx.strokeStyle = "rgba(0,0,0,0.2)"; ctx.lineWidth = 2;
      for (let rr = 140; rr < dr; rr += 14) { ctx.beginPath(); ctx.arc(dx, dy, rr, 0, Math.PI * 2); ctx.stroke(); }
      const sheen = ctx.createLinearGradient(dx - dr, dy - dr, dx + dr * 0.6, dy + dr * 0.6);
      sheen.addColorStop(0, "rgba(255,255,255,0.24)"); sheen.addColorStop(0.5, "rgba(255,255,255,0)"); sheen.addColorStop(1, "rgba(255,255,255,0.08)");
      ctx.fillStyle = sheen; ctx.fillRect(dx - dr, dy - dr, dr * 2, dr * 2);
      ctx.restore();
    } else {
      const round = card.type === "artists";
      const imgs = await Promise.all(card.rows.map((r) => loadShareImg(r.art ? hiResArtwork(r.art) : null)));
      const rh = 168, gap = 20, x0 = 60, w0 = W - 120, y0 = 250;
      card.rows.forEach((r, i) => {
        const y = y0 + i * (rh + gap);
        glassPlate(ctx, x0, y, w0, rh, 48, i === 0);
        ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.font = `800 52px ${F}`; ctx.textAlign = "center";
        ctx.fillText(String(i + 1), x0 + 54, y + rh / 2 + 18);
        ctx.textAlign = "left";
        const s = 120, cx = x0 + 100, cy = y + (rh - s) / 2;
        ctx.save();
        if (round) { ctx.beginPath(); ctx.arc(cx + s / 2, cy + s / 2, s / 2, 0, Math.PI * 2); ctx.closePath(); } else roundPath(ctx, cx, cy, s, s, 30);
        ctx.clip();
        if (imgs[i]) coverFit(ctx, imgs[i], cx, cy, s, s); else { ctx.fillStyle = "rgba(255,255,255,0.2)"; ctx.fillRect(cx, cy, s, s); }
        ctx.restore();
        const tx = cx + s + 30, tmax = x0 + w0 - tx - 36;
        ctx.fillStyle = "#fff"; ctx.font = `800 52px ${F}`;
        ctx.fillText(cutText(ctx, r.title, tmax), tx, y + 76);
        ctx.fillStyle = "rgba(255,255,255,0.74)"; ctx.font = `500 40px ${F}`;
        ctx.fillText(cutText(ctx, r.sub, tmax), tx, y + 128);
      });
    }
    return canvasToBlob(canvas);
  }

  // PNG of a big canvas can come back empty on a phone short of memory: then a JPEG, which is lighter
  function canvasToBlob(canvas) {
    return new Promise((resolve) => {
      try {
        canvas.toBlob((b) => {
          if (b) return resolve(b);
          try { canvas.toBlob((b2) => resolve(b2), "image/jpeg", 0.92); } catch (e) { resolve(null); }
        }, "image/png");
      } catch (e) { resolve(null); }
    });
  }

  // Inside Telegram (Android above all) a plain «download» link in the web view saves nothing and
  // says nothing. Telegram's own «save file» does the job, but takes a link: the picture is put on
  // the server for a quarter of an hour and the link is handed over.
  async function saveImageViaTelegram(blob, name) {
    if (!(tg && typeof tg.downloadFile === "function" && tgAtLeast("8.0") && tgInitRaw)) return false;
    try {
      const res = await fetch(`${API_BASE_URL}/card`, {
        method: "POST",
        headers: { "content-type": blob.type || "image/png", "X-Telegram-Init-Data": tgInitRaw },
        body: blob,
      });
      if (!res.ok) return false;
      const { url } = await res.json();
      const base = (API_BASE_URL || window.location.origin).replace(/\/$/, "");
      const ext = blob.type === "image/jpeg" ? ".jpg" : ".png";
      const fileName = name.replace(/\.[a-z]+$/i, "") + ext;
      return await new Promise((resolve) => {
        try { tg.downloadFile({ url: base + url, file_name: fileName }, (ok) => resolve(!!ok)); }
        catch (e) { resolve(false); }
      });
    } catch (e) {
      return false;
    }
  }

  // отправка картинки: только сама картинка, без подписи.
  // На телефоне открывается системное «Поделиться»; там, где его нет (компьютер, Telegram Desktop),
  // показываем картинку с кнопками «Скачать» и «Скопировать».
  let lastShareBlob = null, lastShareName = "notka.png";
  async function shareImageBlob(blob, name) {
    const file = new File([blob], name, { type: blob.type || "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); haptic("success"); return; }
      catch (e) { if (e && e.name === "AbortError") return; /* else the next way */ }
    }
    if (await saveImageViaTelegram(blob, name)) { haptic("success"); showToast("Картинка сохранена"); return; }
    lastShareBlob = blob; lastShareName = name;
    $("recap-preview").src = URL.createObjectURL(blob);
    openOverlay("recap-modal");
  }
  $("recap-modal-download").addEventListener("click", async () => {
    if (!lastShareBlob) return;
    if (await saveImageViaTelegram(lastShareBlob, lastShareName)) { showToast("Картинка сохранена"); return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(lastShareBlob);
    a.download = lastShareName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast("Если картинка не сохранилась, нажми на неё и удерживай");
  });
  $("recap-modal-copy").addEventListener("click", async () => {
    if (!lastShareBlob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": lastShareBlob })]);
      showToast("Скопировано. Вставь в чат");
    } catch (e) {
      showToast("Не получилось скопировать, нажми «Скачать»");
    }
  });
  $("recap-share-btn").addEventListener("click", async () => {
    const btn = $("recap-share-btn");
    if (btn.disabled) return;
    const index = recapIndex();
    const card = recapCards[index];
    if (!card) return;
    btn.disabled = true;
    haptic("light");
    try {
      const blob = await renderRecapImage(card, index);
      if (!blob) throw new Error("no image");
      await shareImageBlob(blob, "notka-itogi.png");
    } catch (e) {
      showToast("Не получилось собрать картинку. Попробуй ещё раз");
    } finally {
      btn.disabled = false;
    }
  });

  // ============================================================
  // ЦИТАТА ИЗ ПЕСНИ: выбираешь строки в тексте и получаешь карточку
  // ============================================================
  let quotePicking = false;
  const quotePicked = new Set();
  let quoteStyle = "light";
  let quoteCtx = { before: [], after: [], frac: null };
  let quoteLines = [];
  let quoteTrack = null;
  let quoteToken = 0;
  let quoteUrl = "";
  const QUOTE_MAX = 2;
  function quoteBarText() {
    const n = quotePicked.size;
    $("quote-bar-text").textContent = n ? `${n} ${plural(n, "строка", "строки", "строк")} выбрано` : "Выбери 1–2 строки";
    $("quote-bar-make").disabled = !n;
  }
  function startQuotePick() {
    if (!lyricsOpen || !lyricsData || !lyricsData.lines.length) return;
    quotePicking = true;
    quotePicked.clear();
    lyricsList.classList.add("is-picking");
    document.body.classList.add("quote-picking");
    $("player-quote-btn").setAttribute("aria-pressed", "true");
    $("quote-bar").hidden = false;
    quoteBarText();
    haptic("light");
  }
  function endQuotePick() {
    quotePicking = false;
    quotePicked.clear();
    lyricsList.classList.remove("is-picking");
    document.body.classList.remove("quote-picking");
    lyricsList.querySelectorAll(".is-picked").forEach((li) => li.classList.remove("is-picked"));
    $("player-quote-btn").setAttribute("aria-pressed", "false");
    $("quote-bar").hidden = true;
  }
  function toggleQuoteLine(li) {
    const i = +li.dataset.i;
    if (quotePicked.has(i)) { quotePicked.delete(i); li.classList.remove("is-picked"); }
    else {
      if (quotePicked.size >= QUOTE_MAX) { showToast(`Можно выбрать до ${QUOTE_MAX} строк`); return; }
      quotePicked.add(i); li.classList.add("is-picked");
    }
    haptic("select");
    quoteBarText();
  }
  $("player-quote-btn").addEventListener("click", () => { if (quotePicking) endQuotePick(); else startQuotePick(); });
  $("quote-bar-cancel").addEventListener("click", endQuotePick);

  function rgbOf(color) {
    try {
      const c = document.createElement("canvas"); c.width = c.height = 1;
      const x = c.getContext("2d", { willReadFrequently: true });
      x.fillStyle = color; x.fillRect(0, 0, 1, 1);
      const d = x.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2]];
    } catch (e) { return [120, 80, 120]; }
  }
  const rgba = (rgb, a) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
  const mixRgb = (a, b, k) => a.map((v, i) => Math.round(v * (1 - k) + b[i] * k));
  function glowAt(ctx, x, y, r, rgb, alpha) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(rgb, alpha)); g.addColorStop(1, rgba(rgb, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, 1080, 1350);
  }
  function fitText(ctx, lines, maxW, sizes, maxH, lhK) {
    for (const size of sizes) {
      ctx.font = `800 ${size}px ${SHARE_FONT}`;
      let wrapped = [];
      lines.forEach((ln) => { wrapped = wrapped.concat(wrapLines(ctx, ln, maxW, 9)); });
      if (wrapped.length * size * lhK <= maxH) return { size, wrapped };
    }
    const size = sizes[sizes.length - 1];
    ctx.font = `800 ${size}px ${SHARE_FONT}`;
    let wrapped = [];
    lines.forEach((ln) => { wrapped = wrapped.concat(wrapLines(ctx, ln, maxW, 9)); });
    return { size, wrapped: wrapped.slice(0, Math.floor(maxH / (size * lhK))) };
  }
  function cutText(ctx, str, maxW) {
    let t = String(str);
    while (ctx.measureText(t).width > maxW && t.length > 3) t = t.slice(0, -2);
    return t === String(str) ? t : t.trimEnd() + "…";
  }
  async function renderQuoteImage(track, lines, style) {
    try { await document.fonts.load("800 100px Onest"); await document.fonts.load("700 46px Unbounded"); } catch (e) { /* the system font is fine */ }
    const W = 1080, H = 1350, F = SHARE_FONT;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.textBaseline = "alphabetic";
    const th = themeColors();
    const art = track.artwork ? hiResArtwork(track.artwork) : null;
    const img = await loadShareImg(art);
    let pal = null;
    try { pal = art ? await paletteFromArtwork(track.artwork) : null; } catch (e) { pal = null; }
    pal = pal || th;
    const deep = rgbOf(pal.deep), warm = rgbOf(pal.warm), mid = rgbOf(pal.mid), core = rgbOf(pal.core);
    const night = [26, 11, 22];
    // фон: тёмный и живой свет, как в самой Нотке
    ctx.fillStyle = rgba(mixRgb(deep, night, 0.6), 1); ctx.fillRect(0, 0, W, H);
    if (style === "light") { glowAt(ctx, 160, 260, 760, warm, 0.8); glowAt(ctx, 960, 700, 720, mid, 0.65); glowAt(ctx, 560, 90, 420, core, 0.35); }
    else { glowAt(ctx, 900, 1150, 980, warm, 0.75); glowAt(ctx, 120, 220, 760, mid, 0.6); glowAt(ctx, 540, 640, 420, core, 0.2); }
    const pad = 84;
    // метка Нотки
    drawLogo(ctx, pad, 76, 60, "rgba(255,255,255,0.92)");
    ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.font = `800 44px ${F}`;
    ctx.font = `700 46px ${BRAND_FONT}`; try { ctx.letterSpacing = "-2px"; } catch (e) { /* the plain spacing is fine */ }
    ctx.fillText("нотка", pad + 76, 126);
    try { ctx.letterSpacing = "0px"; } catch (e) { /* ok */ }

    if (style === "light") {
      // как текст в плеере Нотки: слева, поющаяся строка горит и чуть крупнее, соседние приглушены
      const cw = W - pad * 2;
      const prev = quoteCtx.before.length ? quoteCtx.before[quoteCtx.before.length - 1] : "";
      const next = quoteCtx.after.length ? quoteCtx.after[0] : "";
      const regionTop = 190, regionBottom = H - 60 - 250 - 36, regionH = regionBottom - regionTop;
      let layout = null;
      for (const size of [82, 76, 70, 64, 58, 52, 48]) {
        const big = Math.round(size * 1.3);
        const wrapGroup = (arr, cap, fs) => { ctx.font = `700 ${fs}px ${F}`; return arr.reduce((acc, ln) => acc.concat(wrapLines(ctx, ln, cw, 9)), []).slice(0, cap); };
        const g = [wrapGroup(prev ? [prev] : [], 2, size), wrapGroup(lines, 9, big), wrapGroup(next ? [next] : [], 2, size)];
        const gaps = (g[0].length ? 1 : 0) + (g[2].length ? 1 : 0);
        const h = (g[0].length + g[2].length) * size * 1.2 + g[1].length * big * 1.14 + gaps * size * 0.5;
        layout = { size, big, g, h };
        if (h <= regionH) break;
      }
      const { size: S, big: BIG, g: groups, h: blockH } = layout;
      let y = regionTop + (regionH - Math.min(blockH, regionH)) / 2;
      groups.forEach((grp, gi) => {
        if (!grp.length) return;
        const fs = gi === 1 ? BIG : S;
        ctx.font = `${gi === 1 ? 800 : 700} ${fs}px ${F}`;
        ctx.fillStyle = gi === 1 ? "#fff" : gi === 0 ? "rgba(255,255,255,0.36)" : "rgba(255,255,255,0.5)";
        if (gi === 1) { ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 2; }
        const lhh = gi === 1 ? fs * 1.14 : fs * 1.2;
        grp.forEach((ln) => { ctx.fillText(ln, pad, y + fs * 0.88); y += lhh; });
        ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        y += S * 0.5;
      });
      // плеер
      const sx = 60, sh = 250, sy = H - 60 - sh, sw = W - 120;
      roundPath(ctx, sx, sy, sw, sh, 64);
      ctx.fillStyle = "rgba(255,255,255,0.14)"; ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.26)"; ctx.lineWidth = 2.5; ctx.stroke();
      const cs = 154, cx0 = sx + 34, cy0 = sy + 30;
      ctx.save(); roundPath(ctx, cx0, cy0, cs, cs, 36); ctx.clip();
      if (img) coverFit(ctx, img, cx0, cy0, cs, cs); else { ctx.fillStyle = rgba(warm, 1); ctx.fillRect(cx0, cy0, cs, cs); }
      ctx.restore();
      const tx = cx0 + cs + 34, tmax = sw - (tx - sx) - 34 - 130 - 24;
      ctx.fillStyle = "#fff"; ctx.font = `800 58px ${F}`;
      ctx.fillText(cutText(ctx, track.title || "", tmax), tx, cy0 + 70);
      ctx.fillStyle = "rgba(255,255,255,0.74)"; ctx.font = `500 46px ${F}`;
      ctx.fillText(cutText(ctx, track.artist || "", tmax), tx, cy0 + 130);
      const bx = sx + sw - 34 - 65, by = cy0 + cs / 2;
      ctx.fillStyle = "#F4EFFF"; ctx.beginPath(); ctx.arc(bx, by, 65, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#16101f";
      roundPath(ctx, bx - 23, by - 27, 15, 54, 5); ctx.fill();
      roundPath(ctx, bx + 8, by - 27, 15, 54, 5); ctx.fill();
      const frac = quoteCtx.frac == null ? 0.38 : Math.max(0.03, Math.min(0.97, quoteCtx.frac));
      const px0 = sx + 38, pw = sw - 76, py = sy + sh - 44;
      roundPath(ctx, px0, py, pw, 11, 6); ctx.fillStyle = "rgba(255,255,255,0.24)"; ctx.fill();
      roundPath(ctx, px0, py, Math.max(11, pw * frac), 11, 6); ctx.fillStyle = "#fff"; ctx.fill();
    } else {
      // цитата и большая пластинка с тонармом, как в темах плеера
      const fit = fitText(ctx, lines, W - pad * 2, [118, 108, 98, 90, 82, 74, 66, 58, 50], 440, 1.1);
      const lh = fit.size * 1.1;
      const textH = fit.wrapped.length * lh;
      const top = 230 + Math.max(0, (440 - textH) / 2);
      ctx.fillStyle = "#fff"; ctx.font = `800 ${fit.size}px ${F}`;
      ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = 24;
      fit.wrapped.forEach((ln, i) => ctx.fillText(ln, pad, top + fit.size * 0.88 + i * lh));
      ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
      // пластинка
      const dx = 690, dy = 1390, dr = 630;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = 70; ctx.shadowOffsetY = 24;
      ctx.fillStyle = "#1a0b16"; ctx.beginPath(); ctx.arc(dx, dy, dr + 12, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.beginPath(); ctx.arc(dx, dy, dr, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = rgba(mid, 1); ctx.fillRect(dx - dr, dy - dr, dr * 2, dr * 2);
      if (img) { ctx.translate(dx, dy); ctx.rotate(-0.22); coverFit(ctx, img, -dr, -dr, dr * 2, dr * 2); ctx.rotate(0.22); ctx.translate(-dx, -dy); }
      ctx.strokeStyle = "rgba(0,0,0,0.22)"; ctx.lineWidth = 2;
      for (let rr = 140; rr < dr; rr += 14) { ctx.beginPath(); ctx.arc(dx, dy, rr, 0, Math.PI * 2); ctx.stroke(); }
      const sheen = ctx.createLinearGradient(dx - dr, dy - dr, dx + dr * 0.6, dy + dr * 0.6);
      sheen.addColorStop(0, "rgba(255,255,255,0.24)"); sheen.addColorStop(0.5, "rgba(255,255,255,0)"); sheen.addColorStop(1, "rgba(255,255,255,0.08)");
      ctx.fillStyle = sheen; ctx.fillRect(dx - dr, dy - dr, dr * 2, dr * 2);
      ctx.restore();
      ctx.fillStyle = rgba(warm, 1); ctx.beginPath(); ctx.arc(dx, dy, 92, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(dx, dy, 92, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "#1a0b16"; ctx.beginPath(); ctx.arc(dx, dy, 16, 0, Math.PI * 2); ctx.fill();
      // тонарм
      const ax = 985, ay = 850, hx = 790, hy = 1215;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10;
      ctx.strokeStyle = "#F4EFFF"; ctx.lineCap = "round"; ctx.lineWidth = 18;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.fillStyle = "#16101f"; ctx.beginPath(); ctx.arc(ax, ay, 46, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#F4EFFF"; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(ax, ay, 46, 0, Math.PI * 2); ctx.stroke();
      ctx.translate(hx, hy); ctx.rotate(Math.atan2(hy - ay, hx - ax) - Math.PI / 2);
      ctx.fillStyle = "#F4EFFF"; roundPath(ctx, -26, -6, 52, 96, 14); ctx.fill();
      ctx.restore();
      // название и исполнитель на стеклянной плашке
      const pw = 560, ph = 150, px = W - 60 - pw, py = 56;
      roundPath(ctx, px, py, pw, ph, 52);
      ctx.fillStyle = "rgba(255,255,255,0.14)"; ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.26)"; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.font = `800 52px ${F}`;
      ctx.fillText(cutText(ctx, track.title || "", pw - 72), px + 36, py + 68);
      ctx.fillStyle = "rgba(255,255,255,0.75)"; ctx.font = `500 42px ${F}`;
      ctx.fillText(cutText(ctx, track.artist || "", pw - 72), px + 36, py + 118);
    }
    return canvasToBlob(canvas);
  }
  async function paintQuotePreview() {
    const token = ++quoteToken;
    $("quote-preview").style.opacity = "0.4";
    let blob = null;
    try { blob = await renderQuoteImage(quoteTrack, quoteLines, quoteStyle); } catch (e) { blob = null; }
    if (token !== quoteToken) return;
    if (!blob) {
      $("quote-preview").style.opacity = "";
      showToast("Не получилось собрать картинку. Нажми стиль ещё раз");
      return;
    }
    if (quoteUrl) URL.revokeObjectURL(quoteUrl);
    quoteUrl = URL.createObjectURL(blob);
    $("quote-preview").src = quoteUrl;
    $("quote-preview").style.opacity = "";
    $("quote-preview").dataset.ready = "1";
  }
  new MutationObserver(() => document.body.classList.toggle("quote-sheet-open", $("quote-sheet").classList.contains("open")))
    .observe($("quote-sheet"), { attributes: true, attributeFilter: ["class"] });
  $("quote-bar-make").addEventListener("click", () => {
    if (!quotePicked.size || !currentTrack || !lyricsData) return;
    quoteTrack = currentTrack;
    const idx = [...quotePicked].sort((a, b) => a - b);
    quoteLines = idx.map((i) => lyricsData.lines[i].text);
    const all = lyricsData.lines;
    quoteCtx = {
      before: all.slice(Math.max(0, idx[0] - 2), idx[0]).map((l) => l.text).filter(Boolean),
      after: all.slice(idx[idx.length - 1] + 1, idx[idx.length - 1] + 3).map((l) => l.text).filter(Boolean),
      frac: lyricsData.synced && (quoteTrack.duration || audio.duration) ? all[idx[0]].t / (quoteTrack.duration || audio.duration) : null,
    };
    $("quote-preview").dataset.ready = "";
    openOverlay("quote-sheet");
    paintQuotePreview();
  });
  $("quote-styles").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    quoteStyle = chip.dataset.style;
    $("quote-styles").querySelectorAll(".chip").forEach((c) => { c.classList.toggle("active", c === chip); c.setAttribute("aria-selected", c === chip ? "true" : "false"); });
    haptic("light");
    paintQuotePreview();
  });
  $("quote-share-btn").addEventListener("click", async () => {
    const btn = $("quote-share-btn");
    if (btn.disabled || !quoteTrack) return;
    btn.disabled = true;
    try {
      const blob = await renderQuoteImage(quoteTrack, quoteLines, quoteStyle);
      if (!blob) throw new Error("no image");
      closeOverlay("quote-sheet");
      await shareImageBlob(blob, "notka-citata.png");
      endQuotePick();
    } catch (e) {
      showToast("Не получилось собрать картинку. Попробуй ещё раз");
    } finally {
      btn.disabled = false;
    }
  });


  // ============================================================
  // PLAYBACK
  // ============================================================
  const audio = $("audio");
  let currentTrackId = null;
  let currentTrack = null;
  let currentQueue = [];
  let originalQueue = [];
  let currentQueueIndex = -1;
  let mymixActive = false;
  let currentMixKey = null; // which mix the queue is (see saveMixResume), null outside a mix
  let currentContextLabel = "Нотка";
  let isLoading = false;
  let isStarting = false; // between a tap and the first sound of that track
  let playToken = 0;
  let resolveAbort = null;
  let failStreak = 0;
  let shuffleOn = false;
  const queuedIds = new Set(); // tracks put in the queue by hand (see queueTrack)
  let currentSource = null; // "fav" | "pl:<id>" | "album:<title>" | "artist:<name>" | "mix"

  // «Вперемешку» is a mode of a list, not a way to start it: pressing it only switches the mode (remembered per list),
  // «Слушать» then plays in order or shuffled by that mode. If the list is playing now the mode applies at once.
  const SHUFFLE_KEY = "notka_shuffle_modes";
  const shuffleModes = (() => {
    try { return new Set(JSON.parse(localStorage.getItem(SHUFFLE_KEY) || "[]")); } catch (e) { return new Set(); }
  })();
  function saveShuffleModes() {
    try { localStorage.setItem(SHUFFLE_KEY, JSON.stringify([...shuffleModes].slice(-60))); } catch (e) { /* ignore */ }
  }
  function playOrToggle(source, tracks, context) {
    if (currentSource === source && currentTrack) { togglePlayPause(); return; }
    startFrom(source, tracks, context, shuffleModes.has(source));
  }
  function shuffleOrToggle(source) {
    const on = !shuffleModes.has(source);
    if (on) shuffleModes.add(source); else shuffleModes.delete(source);
    saveShuffleModes();
    haptic("select");
    if (currentSource === source && currentTrack) {
      shuffleOn = on;
      currentQueue = on ? withShuffledTail(originalQueue, currentTrack) : originalQueue.slice();
      currentQueueIndex = currentQueue.findIndex((t) => t.id === currentTrack.id);
      showToast(on ? "Перемешали" : "По порядку");
    } else {
      showToast(on ? "Вперемешку: включится, когда нажмёте «Слушать»" : "По порядку");
    }
    syncModeButtons();
  }
  function startFrom(source, tracks, context, shuffle) {
    if (!tracks.length) return;
    shuffleOn = shuffle;
    const first = shuffle ? tracks[Math.floor(Math.random() * tracks.length)] : tracks[0];
    playTrack(first, tracks, { context, source });
    syncModeButtons();
  }
  function updateSourceButtons() {
    [
      ["favorites-play-btn", "favorites-shuffle-btn", () => "fav"],
      ["playlist-play-btn", "playlist-shuffle-btn", () => `pl:${currentPlaylistId}`],
      ["album-play-btn", "album-shuffle-btn", () => `album:${$("album-title").textContent}`],
      ["artist-play-btn", "artist-shuffle-btn", () => `artist:${$("artist-name").textContent}`],
    ].forEach(([playId, shuffleId, key]) => {
      const btn = $(playId);
      if (!btn) return;
      const current = !!currentTrack && currentSource === key();
      btn.classList.toggle("is-current", current);
      const label = current ? (audio.paused ? "Продолжить" : "Пауза") : "Слушать";
      btn.querySelector(".pill-label").textContent = label;
      btn.setAttribute("aria-label", label === "Слушать" ? (shuffleModes.has(key()) ? "Слушать вперемешку" : "Слушать по порядку") : label);
      const sb = shuffleId && $(shuffleId);
      if (sb) sb.setAttribute("aria-pressed", shuffleModes.has(key()) ? "true" : "false");
    });
    const mix = $("mymix-card");
    if (mix) updateMymixCardUI();
  }
  let repeatMode = "off"; // off | all | one

  function setLoading(on) {
    isLoading = on;
    document.body.classList.toggle("is-loading", on);
    refreshRowStates();
  }

  function setPlaying(on) {
    document.body.classList.toggle("is-playing", on);
    const label = on ? "Пауза" : "Включить";
    $("mp-play-btn").setAttribute("aria-label", label);
    $("player-play-btn").setAttribute("aria-label", label);
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = on ? "playing" : "paused";
    // Closing the Mini App mid-song would silently kill the music.
    if (tg && tgAtLeast("6.2")) {
      try { on ? tg.enableClosingConfirmation() : tg.disableClosingConfirmation(); } catch (e) { /* ignore */ }
    }
    updateMymixCardUI();
    updateSourceButtons();
    syncPrism();
  }

  function updateMymixCardUI() {
    const card = $("mymix-card");
    if (!card) return;
    const current = mymixActive && !!currentTrack;
    card.classList.toggle("is-current", current);
    card.classList.toggle("playing", current && !audio.paused);
    $("mymix-sub").textContent = current
      ? `${currentTrack.title || "Без названия"} · ${currentTrack.artist || ""}`
      : mixResumeFor("mymix")
        ? `Продолжить: ${mixResumeFor("mymix").track.title || "Без названия"} · ${mixResumeFor("mymix").track.artist || ""}`
      : state.favorites.length || state.playlists.length
        ? "Похожее на твои любимые треки и плейлисты"
        : "Отметь треки сердцем — и микс подберёт похожее";
    $("mymix-play-btn").setAttribute("aria-label", mymixActive && currentTrack && !audio.paused ? "Пауза" : "Включить «Мой микс»");
    paintMixArt();
    paintBeat();
    syncViz();
  }

  function setMiniPlayerFor(track) {
    $("mp-title").textContent = track.title || "Без названия";
    $("mp-artist").textContent = track.artist || "Неизвестный исполнитель";
    setCoverEl($("mp-art"), track.artwork, track.id);
  }

  function setFullPlayerFor(track) {
    $("player-title").textContent = track.title || "Без названия";
    $("player-artist").textContent = track.artist || "Неизвестный исполнитель";
    setCoverEl($("player-art"), hiResArtwork(track.artwork), track.id);
    // the cassette theme wears the cover as its label
    const art = hiResArtwork(track.artwork);
    $("cassette-art").style.backgroundImage = art ? `url("${art.replace(/"/g, "%22")}")` : "";
    $("cassette-title").textContent = track.title || "Без названия";
    $("cassette-artist").textContent = track.artist || "";
    syncPlayerFav();
    if (window.refreshPlayerInfo) window.refreshPlayerInfo();
  }
  function syncPlayerFav() {
    const on = !!currentTrack && Store.isFavorite(currentTrack.id);
    $("player-fav-btn").setAttribute("aria-pressed", on ? "true" : "false");
    $("player-fav-btn").setAttribute("aria-label", on ? "Убрать из любимого" : "В любимое");
    $("mp-fav-btn").setAttribute("aria-pressed", on ? "true" : "false");
    $("mp-fav-btn").setAttribute("aria-label", on ? "Убрать из любимого" : "В любимое");
    $("mp-fav-ph").setAttribute("aria-pressed", on ? "true" : "false");
    $("mp-fav-ph").setAttribute("aria-label", on ? "Убрать из любимого" : "В любимое");
    if (currentTrack) syncRowHearts(currentTrack.id);
  }

  function setMediaSession(track) {
    if (!("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title || "Без названия",
        artist: track.artist || "",
        album: track.album || currentContextLabel || "Нотка",
        // the lock screen / notification wants a big, square image
        artwork: track.artwork
          ? [{ src: hiResArtwork(track.artwork), sizes: "544x544", type: "image/jpeg" }, { src: track.artwork, sizes: "120x120", type: "image/jpeg" }]
          : [],
      });
    } catch (e) { /* older WebViews */ }
  }
  if ("mediaSession" in navigator) {
    const ms = navigator.mediaSession;
    const safe = (action, fn) => { try { ms.setActionHandler(action, fn); } catch (e) { /* unsupported */ } };
    safe("play", () => { if (audio.src) audio.play().catch(() => {}); });
    safe("pause", () => audio.pause());
    safe("previoustrack", () => playAdjacent(-1));
    safe("nexttrack", () => playAdjacent(1));
    safe("seekto", (d) => { if (d && typeof d.seekTime === "number") audio.currentTime = d.seekTime; });
  }

  // Если трек не играет, ищем ему замену: тот же трек от другой загрузки (другой источник, тот же исполнитель, та же длина)
  const altTried = new Set();
  async function findEquivalent(track) {
    try {
      const q = `${track.artist || ""} ${track.title || ""}`.trim();
      if (!q) return null;
      const res = await fetch(`${API_BASE_URL}/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) return null;
      const data = await res.json();
      const norm = (s) => String(s || "").toLowerCase().replace(/\(.*?\)|\[.*?\]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      const t0 = norm(track.title), a0 = norm(track.artist);
      const firstWord = (s) => s.split(" ")[0] || "";
      return (data.results || []).find((c) => c.id !== track.id && c.sourceId !== track.sourceId
        && norm(c.title) === t0
        && (!a0 || norm(c.artist).includes(firstWord(a0)) || a0.includes(firstWord(norm(c.artist))))
        && (!track.duration || !c.duration || Math.abs(c.duration - track.duration) <= 10)) || null;
    } catch (e) { return null; }
  }

  async function playTrack(track, queue, opts) {
    opts = opts || {};
    // leaving a mix for something else: keep its place
    if (currentMixKey && !opts.keepQueue && opts.mixKey !== currentMixKey) saveMixResume();
    const token = ++playToken;
    if (resolveAbort) resolveAbort.abort();
    resolveAbort = typeof AbortController !== "undefined" ? new AbortController() : null;

    currentTrackId = track.id;
    currentTrack = track;
    if (!opts.keepQueue) {
      queuedIds.clear();
      originalQueue = queue && queue.length ? queue.slice() : [track];
      currentQueue = shuffleOn ? withShuffledTail(originalQueue, track) : originalQueue.slice();
    }
    currentQueueIndex = currentQueue.findIndex((t) => t.id === track.id);
    if (!opts.keepQueue) {
      mymixActive = !!opts.mymix;
      currentSource = opts.source || null;
      currentMixKey = opts.mixKey || null;
    }
    // Where this track is playing "from" — shown in the full-player header
    // ("Мой микс" / an album or playlist name / "Поиск"…). When neither is
    // given (skipping to the next track in the same queue, say) we simply
    // keep showing whatever context was already on screen.
    if (opts.mymix) currentContextLabel = opts.context || "Мой микс";
    else if (opts.context) currentContextLabel = opts.context;
    else if (track.album && currentQueue.length <= 1) currentContextLabel = track.album;
    $("player-context").textContent = currentContextLabel === "Поиск" ? "Из поиска" : currentContextLabel;

    audio.pause();
    setPlaying(false);
    setLoading(true);
    isStarting = true;
    if (!opts.startAt) resumeAt = 0;
    setMiniPlayerFor(track);
    setFullPlayerFor(track);
    setMediaSession(track);
    updateDock();
    renderQueueSheet();
    lightForTrack(track);
    loadLyrics();
    resetProgress(track);
    saveResume(true, opts.startAt || 0);
    extendMixIfNeeded();
    haptic("light");

    try {
      // The backend downloads the track (or finds it already on disk) and
      // only then says "ready" — so a track that can't be played comes
      // back as an error with a reason, not as a silent player.
      const res = await fetch(`${API_BASE_URL}/prepare?${prepareQuery(track)}`, resolveAbort ? { signal: resolveAbort.signal } : undefined);
      if (token !== playToken) return;
      if (!res.ok) {
        let code = null;
        try {
          const body = await res.json();
          code = body && body.error && body.error.code;
        } catch (e) { /* body wasn't JSON — fall through with code=null */ }
        const err = new Error(`HTTP ${res.status}`);
        err.code = code;
        throw err;
      }
      // Played through our own backend, not the source's direct link:
      // those links are tied to the IP that resolved them (this computer),
      // so a phone hitting them over the internet gets cut off mid-stream.
      audio.src = `${API_BASE_URL}/stream?${trackQuery(track)}`;
      if (opts.startAt > 2) audio.addEventListener("loadedmetadata", () => { try { audio.currentTime = opts.startAt; } catch (e) { /* starts over */ } }, { once: true });
      await audio.play();
      if (token !== playToken) return;
      rememberRecent(track);
      track_play(track, opts);
      failStreak = 0;
      isStarting = false;
      setLoading(false);
      setPlaying(true);
      prepareNextTrack();
    } catch (err) {
      if (token !== playToken || (err && err.name === "AbortError")) return;
      console.error(err);
      sendEvent("play_error", { id: track.id, code: (err && err.code) || "net", retried: !!opts.retried });
      // a source answers «no» now and then for one request: the same track once more. Only when the
      // request itself did not get through; an answer «could not» from the server already means that
      // both of its routes were tried, a second go would only double the wait
      if (!opts.retried && !(err && err.code)) {
        await new Promise((r) => setTimeout(r, 800));
        if (token !== playToken) return;
        playTrack(track, currentQueue, { keepQueue: true, retried: true, altTried: opts.altTried, startAt: opts.startAt });
        return;
      }
      // the chosen record does not play (the source said no): the equal one with the same title and
      // artist is looked for while the player still shows «loading», so no error is flashed first
      if (!opts.altTried && !altTried.has(track.id)) {
        altTried.add(track.id);
        const alt = await findEquivalent(track);
        if (token !== playToken) return;
        if (alt) {
          const swap = (arr) => { const i = arr.findIndex((t) => t.id === track.id); if (i >= 0) arr[i] = alt; };
          swap(currentQueue); swap(originalQueue);
          playTrack(alt, currentQueue, { keepQueue: true, altTried: true });
          return;
        }
      }
      isStarting = false;
      setLoading(false);
      setPlaying(false);
      haptic("error");
      const hasNext = currentQueueIndex >= 0 && currentQueueIndex < currentQueue.length - 1;
      if (hasNext && failStreak < 3) {
        failStreak++;
        showToast(`«${track.title || "Трек"}» недоступен, включаем следующий`);
        setTimeout(() => { if (token === playToken) playAdjacent(1, { auto: true }); }, 900);
        return;
      }
      failStreak = 0;
      mymixActive = false;
      updateMymixCardUI();
      showToast(err && err.code === "TRACK_NOT_FOUND" ? "Трек не найден в официальном каталоге" : "Не удалось включить трек");
    }
  }

  function track_play(t, opts) {
    track("play", { id: t.id, a: (t.artist || "").slice(0, 60), src: String((opts && opts.source) || currentSource || "").slice(0, 20), ctx: String(currentContextLabel || "").slice(0, 30) });
  }

  function trackQuery(track) {
    return `source=${encodeURIComponent(track.source)}&id=${encodeURIComponent(track.sourceId)}`;
  }
  // the same, with what the server needs to remember how the track sounds (once, in the background)
  function prepareQuery(track) {
    return `${trackQuery(track)}&title=${encodeURIComponent((track.title || "").slice(0, 160))}&artist=${encodeURIComponent((track.artist || "").slice(0, 160))}&duration=${Math.round(track.duration || 0)}`;
  }

  // While a track plays, the backend gets the next one ready, so the
  // switch between tracks doesn't wait for a download.
  let preparedId = null;
  function prepareNextTrack() {
    const next = currentQueue[currentQueueIndex + 1];
    if (!next || next.id === preparedId) return;
    preparedId = next.id;
    fetch(`${API_BASE_URL}/prepare?${prepareQuery(next)}`).catch(() => {});
  }

  function withShuffledTail(queue, current) {
    const rest = queue.filter((t) => t.id !== current.id);
    return [current, ...shuffled(rest)];
  }

  // ---- the small player survives leaving the app: the track, its place in the queue and the second it
  // stopped at are kept on the device; on the next start the small player holds the same track, paused,
  // and ▶ goes on from that second ----
  const RESUME_KEY = "notka_resume_v1";
  let resumeAt = 0; // the second a restored (not yet started) track goes on from
  let lastResumeSave = 0;
  function saveResume(force, posOverride) {
    if (!currentTrack || !currentTrack.id) return;
    if (isStarting && posOverride == null) return; // between two tracks the audio still holds the old one
    const now = Date.now();
    if (!force && now - lastResumeSave < 4000) return;
    lastResumeSave = now;
    const started = !!audio.getAttribute("src");
    const pos = posOverride != null ? posOverride : (started ? audio.currentTime || 0 : resumeAt);
    const idx = Math.max(0, currentQueueIndex);
    const from = Math.max(0, idx - 3), to = Math.min(currentQueue.length, idx + 40);
    const slice = currentQueue.slice(from, to);
    try {
      localStorage.setItem(RESUME_KEY, JSON.stringify({ track: currentTrack, pos: Math.floor(pos), queue: slice.length ? slice : [currentTrack], index: slice.length ? idx - from : 0, ctx: currentContextLabel, at: now }));
    } catch (e) { /* a nicety: the storage may be full */ }
  }
  function restoreResume() {
    if (currentTrack) return;
    let r = null;
    try { r = JSON.parse(localStorage.getItem(RESUME_KEY)); } catch (e) { r = null; }
    if (!r || !r.track || !r.track.id || !r.track.source || Date.now() - (r.at || 0) > 30 * 86400 * 1000) return;
    currentTrack = r.track;
    currentTrackId = r.track.id;
    currentQueue = Array.isArray(r.queue) && r.queue.length ? r.queue.filter((t) => t && t.id) : [r.track];
    if (!currentQueue.length) currentQueue = [r.track];
    originalQueue = currentQueue.slice();
    currentQueueIndex = currentQueue.findIndex((t) => t.id === r.track.id);
    if (currentQueueIndex < 0) { currentQueue.unshift(r.track); originalQueue = currentQueue.slice(); currentQueueIndex = 0; }
    if (r.ctx) { currentContextLabel = r.ctx; $("player-context").textContent = r.ctx === "Поиск" ? "Из поиска" : r.ctx; }
    resumeAt = Math.max(0, +r.pos || 0);
    setMiniPlayerFor(currentTrack);
    setFullPlayerFor(currentTrack);
    lightForTrack(currentTrack);
    const dur = +currentTrack.duration || 0;
    if (dur) {
      renderProgress(Math.min(100, (resumeAt / dur) * 100), resumeAt);
      $("player-time-total").textContent = formatDuration(dur);
    }
    updateDock();
  }
  window.addEventListener("pagehide", () => saveResume(true));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") saveResume(true); });

  function togglePlayPause() {
    if (!audio.getAttribute("src")) {
      if (currentTrack && !isLoading) {
        const startAt = resumeAt;
        resumeAt = 0;
        playTrack(currentTrack, currentQueue, { keepQueue: true, startAt });
      }
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
  audio.addEventListener("pause", () => { setPlaying(false); saveResume(true); });
  audio.addEventListener("waiting", () => { if (!audio.paused) setLoading(true); });
  audio.addEventListener("playing", () => setLoading(false));

  // The stream broke mid-track (the network changed, the connection
  // dropped). Reconnect once from the same second; if that fails too, say
  // so instead of sitting silent. Failures at the start of a track are
  // playTrack's own business.
  let streamRetryAt = 0;
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
  const lyricsBox = $("player-lyrics");
  const lyricsList = $("lyrics-lines");
  const lyricsCache = new Map(); // track id -> { lines, synced }
  let lyricsOpen = false;
  let lyricsTrackId = null; // whose text is on screen (or being fetched)
  let lyricsData = null;
  let lyricsActive = -1;
  let lyricsTouchedAt = 0;

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

  let lyricsFetchTimer = 0;
  let lyricsAbort = null;
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
  let lyricsGlide = 0;
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

  // A swipe down puts the player away like a card: it stays whole and follows the finger, the page it came
  // from shows from under it, the tab bar and the small player are there from the first moment. Let go far
  // enough and it slides down and fades at the very end, otherwise it settles back. Only position and
  // opacity move (that is what stays smooth on a weak phone). On the cover from anywhere but the controls;
  // over the text only when it is at its very top (the text follows the song, so it rarely is); the top bar
  // and the title block fold the player always.
  let playerPull = null;
  let pullBehind = null;
  let pullBehindName = null;
  const pullScreen = $("screen-player"); // (the swipe code further down names it too, but declares it later)
  const pullDock = () => [bottomNav, miniPlayer];
  const pullStyle = (dy, animate, fade) => {
    const k = Math.min(1, dy / 700);
    pullScreen.style.transition = animate ? "transform 0.34s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.34s ease-in" : "none";
    pullScreen.style.transform = `translate3d(0, ${dy}px, 0) scale(${(1 - k * 0.08).toFixed(3)})`;
    pullScreen.style.opacity = fade ? "0" : "1";
    const appear = String(Math.min(1, dy / 90).toFixed(3));
    if (pullBehind) {
      pullBehind.style.transition = animate ? "opacity 0.34s ease-out" : "none";
      pullBehind.style.opacity = fade ? "1" : String(Math.min(1, 0.35 + dy / 200).toFixed(3));
    }
    pullDock().forEach((el) => { el.style.transition = animate ? "opacity 0.3s ease-out" : "none"; el.style.opacity = fade ? "1" : appear; });
  };
  const pullReset = () => {
    pullScreen.style.transition = "";
    pullScreen.style.transform = "";
    pullScreen.style.opacity = "";
    pullScreen.style.willChange = "";
    if (pullBehind) { pullBehind.style.transition = ""; pullBehind.style.opacity = ""; pullBehind.style.willChange = ""; }
    // (the small player's own entrance animation stays switched off here: putting it back now would
    // start it again, and the player would blink after it was put away; updateDock() puts it back
    // when the element is hidden, so the next real appearance has its entrance)
    pullDock().forEach((el) => { el.style.transition = ""; el.style.opacity = ""; });
    document.body.classList.remove("player-pulling");
  };
  function pullBegin() {
    const below = navStack[navStack.length - 2];
    pullBehindName = below && below.name !== "player" && screens[below.name] ? below.name : "home";
    pullBehind = screens[pullBehindName] || null;
    if (pullBehind) {
      pullBehind.style.opacity = "0.35";
      pullBehind.style.willChange = "opacity";
      // the page comes up already in place: its cards and rows must not play their entrance (they slide in
      // from the side for three quarters of a second, right when the player is leaving)
      pullBehind.classList.add("no-enter");
      pullBehind.hidden = false; // the page under the player
    }
    // the tab bar and the small player are shown now, as they will be on that page: so they do not
    // pop in with their own entrance when the player is already gone
    const tabs = TAB_SCREENS.has(pullBehindName) && !isDesktop();
    const mini = !!currentTrack && !NO_MINI_SCREENS.has(pullBehindName);
    pullDock().forEach((el) => { el.style.animation = "none"; el.style.opacity = "0"; });
    bottomNav.hidden = !tabs;
    miniPlayer.hidden = !mini;
    document.body.classList.toggle("no-tabbar", !tabs);
    // the light takes the pose of the page it is going back to while the player is still being moved,
    // not with a jump after it is gone
    document.body.dataset.screen = pullBehindName;
    document.body.classList.add("player-pulling");
  }
  pullScreen.addEventListener("touchstart", (e) => {
    playerPull = null;
    if (e.touches.length !== 1 || !currentTrack || currentScreen !== "player") return;
    if (document.body.classList.contains("quote-picking") || openOverlays.length) return;
    if (isDesktop()) return;
    if (e.target.closest("#player-progress-track, .scrub, .scrub-times, button, input, a, .theme-try")) return;
    if (e.target.closest("#player-lyrics") && lyricsBox.scrollTop > 0) return;
    if (artGrab) return; // a record or a cassette is being turned by the finger
    if (pullScreen.scrollTop > 2) return; // the track's information is being scrolled
    pullScreen.style.willChange = "transform, opacity"; // its own layer before the first move, not in the middle of it
    playerPull = { x: e.touches[0].clientX, y: e.touches[0].clientY, dy: 0, locked: false, t: performance.now(), inText: !!e.target.closest("#player-lyrics"), raf: 0 };
  }, { passive: true });
  pullScreen.addEventListener("touchmove", (e) => {
    if (!playerPull) return;
    const dx = e.touches[0].clientX - playerPull.x, dy = e.touches[0].clientY - playerPull.y;
    if (!playerPull.locked) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) { pullScreen.style.willChange = ""; playerPull = null; return; } // sideways: the other swipe
      if (dy < -10) { pullScreen.style.willChange = ""; playerPull = null; return; } // upwards: the text scrolls
      if (dy < 12) return;
      if (lyricsOpen && playerPull.inText && lyricsBox.scrollTop > 0) { pullScreen.style.willChange = ""; playerPull = null; return; }
      playerPull.locked = true;
      lyricsTouchedAt = Date.now();
      pullBegin();
    }
    playerPull.dy = Math.max(0, dy);
    if (!playerPull.raf) {
      const p = playerPull;
      p.raf = requestAnimationFrame(() => { p.raf = 0; if (playerPull === p) pullStyle(p.dy * 0.95, false, false); });
    }
  }, { passive: true });
  const endPlayerPull = (e) => {
    if (!playerPull) return;
    const p = playerPull;
    playerPull = null;
    cancelAnimationFrame(p.raf);
    if (!p.locked) { pullScreen.style.willChange = ""; return; }
    const speed = p.dy / Math.max(1, performance.now() - p.t);
    const go = e && e.type === "touchend" && (p.dy > 120 || (p.dy > 50 && speed > 0.55));
    if (!go) {
      // back into place; the page under it is put away again, the light and the dock go back to the player's pose
      pullStyle(0, true, false);
      if (pullBehind) pullBehind.style.opacity = "0";
      pullDock().forEach((el) => { el.style.opacity = "0"; });
      document.body.dataset.screen = "player";
      setTimeout(() => {
        if (currentScreen === "player" && pullBehind) pullBehind.hidden = true;
        pullReset();
        pullBehind = null;
        updateDock(); // the tab bar and the small player as the player page has them (none)
      }, 360);
      return;
    }
    haptic("light");
    pullStyle(window.innerHeight * 0.6, true, true);
    setTimeout(() => {
      // the app really goes back; the page is already there and stays as it was
      goBack({ keep: true });
      requestAnimationFrame(() => { pullReset(); pullBehind = null; });
    }, 340);
  };
  pullScreen.addEventListener("touchend", endPlayerPull);
  pullScreen.addEventListener("touchcancel", endPlayerPull);
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
  // ---- sleep timer ----
  let sleepAt = 0;          // ms timestamp, 0 = off
  let sleepAfterTrack = false;
  let sleepTimer = null;
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
  // «В любимое»: the heart springs, a ring goes out from it and a scatter of small hearts in the brand's
  // colours flies off (the way the heart reaction does in Telegram); taking it back only deflates the heart
  const HEART_COLORS = ["#FF5C95", "#FF7BA9", "#FF9EBE", "#FFB6CC"];
  function heartBurst(anchor) {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    if (!r.width && !r.height) return;
    const host = document.createElement("span");
    host.className = "heart-burst";
    host.setAttribute("aria-hidden", "true");
    host.style.left = `${r.left + r.width / 2}px`;
    host.style.top = `${r.top + r.height / 2}px`;
    const ring = document.createElement("i");
    ring.className = "heart-ring";
    host.appendChild(ring);
    // a few small hearts rise and drift apart, one after another, and fade (not a burst)
    const n = 6;
    for (let k = 0; k < n; k++) {
      const spread = (k - (n - 1) / 2) / ((n - 1) / 2); // -1 … 1
      const sp = document.createElement("i");
      sp.className = "heart-spark";
      sp.style.setProperty("--dx", `${(spread * 34 + (Math.random() - 0.5) * 10).toFixed(1)}px`);
      sp.style.setProperty("--dy", `${-(46 + Math.random() * 26).toFixed(1)}px`);
      sp.style.setProperty("--sc", (0.7 + Math.random() * 0.5).toFixed(2));
      sp.style.setProperty("--rot", `${Math.round(spread * 22 + (Math.random() - 0.5) * 14)}deg`);
      sp.style.setProperty("--d", `${60 + k * 55}ms`);
      sp.style.setProperty("--c", HEART_COLORS[k % HEART_COLORS.length]);
      sp.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-heart-fill"/></svg>';
      host.appendChild(sp);
    }
    document.body.appendChild(host);
    setTimeout(() => host.remove(), 1700);
  }
  function heartPop(buttons, liked) {
    buttons.forEach((b) => {
      if (!b) return;
      b.classList.remove("heart-pop", "heart-unlike");
      void b.offsetWidth;
      b.classList.add(liked ? "heart-pop" : "heart-unlike");
      setTimeout(() => b.classList.remove("heart-pop", "heart-unlike"), 850);
    });
  }
  $("player-fav-btn").addEventListener("click", () => {
    if (!currentTrack) return;
    const isFav = Store.toggleFavorite(currentTrack);
    haptic(isFav ? "success" : "light");
    const hearts = [$("player-fav-btn"), $("mp-fav-btn"), $("mp-fav-ph")];
    heartPop(hearts, isFav);
    if (isFav) heartBurst(hearts.find((el) => el && el.getClientRects().length));
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

  // ============================================================
  // TRACK MENU SHEET
  // ============================================================
  let trackMenuTrack = null;
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
    if (on) heartBurst($("menu-track-fav").querySelector("svg"));
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

  // ============================================================
  // ALBUM / ARTIST
  // For tracks sourced from youtube_music (which carry a real
  // albumId/artistId from ytmusicapi's browse endpoints), these screens
  // load real metadata + cover art from the backend's /album and /artist
  // endpoints. Tracks from providers that don't expose album/artist ids
  // (soundcloud, youtube_web fallback) still use a lightweight client-side
  // grouped view derived from whatever track list is currently in view
  // (see README).
  // ============================================================
  let currentArtistTracks = [];

  function renderArtistShell(name) {
    $("artist-name").textContent = name;
    setCoverEl($("artist-avatar"), null, name);
    $("artist-listeners").textContent = "Загрузка…";
    syncFollow(name);
    $("artist-tracks").innerHTML = "";
    $("artist-albums").innerHTML = "";
    $("artist-singles").innerHTML = "";
    $("artist-singles").hidden = true;
    $("artist-singles-label").hidden = true;
  }
  function syncFollow(name) {
    const on = Store.isArtistFollowed(name);
    $("artist-follow-label").textContent = on ? "В подписках" : "Подписаться";
    $("artist-follow-btn").setAttribute("aria-pressed", on ? "true" : "false");
  }

  function renderArtistAlbumShelf(elId, labelId, albums, source, emptyText) {
    const el = $(elId);
    const label = $(labelId);
    if (!albums || !albums.length) {
      if (emptyText) {
        el.hidden = false;
        if (label) label.hidden = false;
        el.innerHTML = `<p class="shelf-empty">${escapeHtml(emptyText)}</p>`;
      } else {
        el.hidden = true;
        if (label) label.hidden = true;
        el.innerHTML = "";
      }
      return;
    }
    el.hidden = false;
    if (label) label.hidden = false;
    el.innerHTML = "";
    albums.forEach((a) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "shelf-card";
      const cover = document.createElement("span");
      cover.className = "cover";
      setCoverEl(cover, a.cover, a.id);
      const t = document.createElement("span");
      t.className = "shelf-title";
      t.textContent = a.title;
      const y = document.createElement("span");
      y.className = "shelf-sub";
      y.textContent = a.year || "";
      card.appendChild(cover);
      card.appendChild(t);
      card.appendChild(y);
      card.addEventListener("click", () => openAlbumById(a.source || source, a.id, a.title, $("artist-name").textContent));
      el.appendChild(card);
    });
  }

  function renderArtistAlbumsRow(albums, source) {
    albums = albums || [];
    const fullAlbums = albums.filter((a) => a.type !== "single");
    const singles = albums.filter((a) => a.type === "single");
    renderArtistAlbumShelf("artist-albums", "artist-albums-label", fullAlbums, source, albums.length ? null : "У Нотки пока нет отдельных альбомов — только список треков");
    renderArtistAlbumShelf("artist-singles", "artist-singles-label", singles, source, null);
  }

  function renderArtistFallbackTracks(name, contextTracks) {
    const tracks = (contextTracks || []).filter((t) => t.artist === name);
    currentArtistTracks = tracks;
    $("artist-listeners").textContent = `${pluralTracks(tracks.length)} в Нотке`;
    const list = $("artist-tracks");
    list.innerHTML = "";
    tracks.slice(0, 8).forEach((t) => list.appendChild(buildTrackRow(t, { queue: tracks, context: name })));
    renderArtistAlbumsRow([], null);
  }

  let currentArtistMeta = {};
  let artistToken = 0;
  async function openArtistScreen(artistName, contextTracks, meta, isBack) {
    if (!artistName) return;
    meta = meta || {};
    const token = ++artistToken;
    currentArtistMeta = { artistId: meta.artistId || null, source: meta.source || null, photo: null };
    renderArtistShell(artistName);
    showScreen("artist", isBack ? { replace: true } : { params: { artistName, contextTracks, meta } });

    // a track without its own artist id (it came from SoundCloud when YouTube Music was slow, or
    // from an old list): find the artist by name, so the page still gets albums and the full list
    if (!(meta.artistId && meta.source)) {
      try {
        const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), 12000) : 0;
        let data = null;
        try {
          const res = await fetch(`${API_BASE_URL}/artists?q=${encodeURIComponent(artistName)}&limit=5`, ctrl ? { signal: ctrl.signal } : undefined);
          data = res.ok ? await res.json() : null;
        } finally { clearTimeout(timer); }
        if (token !== artistToken) return;
        const want = artistName.trim().toLowerCase();
        const hit = ((data && data.results) || []).find((a) => (a.name || "").trim().toLowerCase() === want);
        if (hit && hit.id && hit.source) {
          meta = Object.assign({}, meta, { artistId: hit.id, source: hit.source });
          currentArtistMeta.artistId = hit.id;
          currentArtistMeta.source = hit.source;
        }
      } catch (e) { /* the page falls back to what the search finds */ }
    }

    if (meta.artistId && meta.source) {
      try {
        const base = `${API_BASE_URL}/artist?source=${encodeURIComponent(meta.source)}&id=${encodeURIComponent(meta.artistId)}`;
        // the request can never hang for good: after the limit the page falls back to the search-based one
        const getArtist = async (fast, ms) => {
          const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
          const timer = ctrl ? setTimeout(() => ctrl.abort(), ms) : 0;
          try {
            const res = await fetch(fast ? `${base}&fast=1` : base, ctrl ? { signal: ctrl.signal } : undefined);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
          } finally { clearTimeout(timer); }
        };
        const paint = (artist) => {
          currentArtistTracks = artist.topTracks || [];
          currentArtistMeta.photo = artist.photo || null;
          // an iTunes artist comes back as its fuller YouTube Music page
          if (artist.id && artist.source) { currentArtistMeta.artistId = artist.id; currentArtistMeta.source = artist.source; }
          $("artist-name").textContent = artist.name || artistName;
          setCoverEl($("artist-avatar"), artist.photo, artistName);
          $("artist-listeners").textContent = artist.subscribers || `${pluralTracks(currentArtistTracks.length)} в Нотке`;
          const list = $("artist-tracks");
          list.innerHTML = "";
          currentArtistTracks.slice(0, 8).forEach((t) => list.appendChild(buildTrackRow(t, { queue: currentArtistTracks, context: artist.name || artistName })));
          renderArtistAlbumsRow(artist.albums || [], artist.source || meta.source);
          updateSourceButtons();
        };
        // first the short page (about a second), then the full one replaces it by itself
        const quick = await getArtist(true, 20000);
        if (token !== artistToken) return; // another artist was opened meanwhile
        paint(quick);
        getArtist(false, 40000).then((full) => { if (token === artistToken) paint(full); }).catch((e) => console.warn("artist: full page not loaded", e));
        return;
      } catch (e) {
        if (token !== artistToken) return;
        console.error(e);
        showToast("Не удалось загрузить исполнителя");
        // fall through to the grouped client-side fallback below
      }
    }

    let tracks = (contextTracks || []).filter((t) => t.artist === artistName);
    if (tracks.length < 2) {
      try {
        const res = await fetch(`${API_BASE_URL}/search?q=${encodeURIComponent(artistName)}`);
        const data = await res.json();
        const extra = (data.results || []).filter((t) => t.artist === artistName);
        if (extra.length) tracks = extra;
      } catch (e) { /* ignore — fall back to whatever we had */ }
    }
    if (token !== artistToken) return;
    renderArtistFallbackTracks(artistName, tracks);
  }
  $("artist-back-btn").addEventListener("click", goBack);
  {
    const pa = $("player-artist");
    pa.setAttribute("role", "link");
    pa.tabIndex = 0;
    const openFromPlayer = () => {
      const t = currentTrack;
      if (!t || !t.artist) return;
      haptic("light");
      openArtistScreen(t.artist, currentQueue.length ? currentQueue : [t], { artistId: t.artistId, source: t.source });
    };
    pa.addEventListener("click", openFromPlayer);
    pa.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openFromPlayer(); } });
  }
  // «О треке»: under the player, scrolled up to (as in Spotify): a small card of the artist, the album
  // and who made the track (credits)
  {
    const credits = $("pi-credits"), source = $("pi-source"), section = $("player-info");
    // one row per person with all they did, instead of lists by role: producers and authors are often the same people
    const ROLES = [["producers", "Продюсер"], ["writers", "Автор"], ["engineers", "Звукорежиссёр"], ["performers", "Участвовал"]];
    const infoCache = new Map();
    let infoFor = null, infoTimer = 0;
    const listeners = (v) => {
      const n = String(v || "").replace(/subscribers?/i, "").trim();
      return n ? `${n} слушателей` : "";
    };
    function paintInfo(t, extra) {
      $("pi-name").textContent = t.artist || "Неизвестный исполнитель";
      $("pi-sub").textContent = extra.listeners ? listeners(extra.listeners) : "";
      const photo = extra.photo || t.artwork;
      // the card is the artist's photo, whole, with the name over its lower edge (as «About the artist» in Spotify)
      const big = photo ? hiResArtwork(photo) || photo : "";
      const ph = $("pi-photo");
      ph.style.backgroundImage = big ? `url("${String(big).replace(/"/g, "%22")}")` : "";
      ph.classList.toggle("is-empty", !big);
      $("pi-artist").onclick = () => { haptic("light"); openArtistScreen(t.artist, [t], { artistId: t.artistId, source: t.source }); };
      const albumBtn = $("pi-album");
      albumBtn.hidden = !t.album;
      if (t.album) {
        $("pi-album-title").textContent = t.album;
        const year = extra.year || (extra.credits && extra.credits.released ? String(extra.credits.released).slice(0, 4) : "");
        const label = extra.credits && extra.credits.label ? String(extra.credits.label).split(",")[0] : "";
        const count = extra.tracks ? `${extra.tracks} ${plural(extra.tracks, "трек", "трека", "треков")}` : "";
        $("pi-album-sub").textContent = [year, count, label].filter(Boolean).join(" · ");
        setCoverEl($("pi-album-cover"), t.artwork, t.album);
        albumBtn.onclick = () => { haptic("light"); if (t.albumId) openAlbumById(t.source, t.albumId, t.album, t.artist); else openAlbumScreen(t); };
      }
      credits.innerHTML = "";
      const c = extra.credits;
      const people = new Map();
      if (c && c.found) {
        ROLES.forEach(([key, role]) => {
          (c[key] || []).filter(Boolean).forEach((name) => {
            const k = name.toLowerCase();
            if (!people.has(k)) people.set(k, { name, roles: [] });
            const p = people.get(k);
            if (!p.roles.includes(role)) p.roles.push(role);
          });
        });
      }
      // the artist's own line stays first when they are among the makers
      const list = [...people.values()].sort((x, y) => (y.roles.length - x.roles.length) || (x.name === t.artist ? -1 : 0));
      let any = list.length > 0;
      if (any) {
        const head = document.createElement("h3");
        head.className = "pi-credits-title";
        head.textContent = "Над треком работали";
        credits.appendChild(head);
        const ul = document.createElement("ul");
        ul.className = "pi-people";
        const LIMIT = 6;
        list.forEach((p, k) => {
          const li = document.createElement("li");
          if (k >= LIMIT) li.hidden = true;
          const av = document.createElement("span");
          av.className = "pi-av";
          av.textContent = (p.name.trim()[0] || "?").toUpperCase();
          av.style.setProperty("--h", String(330 + ((p.name.charCodeAt(0) * 37 + p.name.length * 17) % 55))); // rose to coral: the brand's own range
          const tx = document.createElement("span");
          tx.className = "pi-person";
          const n = document.createElement("b"); n.textContent = p.name;
          const r = document.createElement("i"); r.textContent = p.roles.join(", ");
          tx.appendChild(n); tx.appendChild(r);
          li.appendChild(av); li.appendChild(tx);
          ul.appendChild(li);
        });
        credits.appendChild(ul);
        if (list.length > LIMIT) {
          const more = document.createElement("button");
          more.type = "button";
          more.className = "pi-more";
          more.textContent = `Показать всех (${list.length})`;
          more.addEventListener("click", () => { ul.querySelectorAll("li[hidden]").forEach((li) => { li.hidden = false; }); more.remove(); });
          credits.appendChild(more);
        }
      }
      source.textContent = any && c.sources && c.sources.length ? `Данные: ${c.sources.join(", ")}` : "";
    }
    async function loadInfo(t) {
      if (!t) return;
      if (infoCache.has(t.id)) { paintInfo(t, infoCache.get(t.id)); return; }
      paintInfo(t, {});
      const base = API_BASE_URL;
      const get = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const [alb, art, cr] = await Promise.all([
        t.albumId ? get(`${base}/album?source=${encodeURIComponent(t.source)}&id=${encodeURIComponent(t.albumId)}`) : null,
        t.artistId ? get(`${base}/artist?source=${encodeURIComponent(t.source)}&id=${encodeURIComponent(t.artistId)}&fast=true`) : null,
        get(`${base}/credits?title=${encodeURIComponent(t.title || "")}&artist=${encodeURIComponent(t.artist || "")}&duration=${Math.round(t.duration || 0)}`),
      ]);
      const extra = {
        year: alb && alb.year ? String(alb.year) : "",
        tracks: alb && alb.tracks ? alb.tracks.length : 0,
        listeners: art && art.subscribers ? art.subscribers : "",
        photo: art && art.photo ? art.photo : "",
        credits: cr,
      };
      infoCache.set(t.id, extra);
      if (currentTrack && currentTrack.id === t.id) paintInfo(t, extra);
    }
    // made when the track changes (a moment later, so flipping through tracks asks for nothing)
    window.refreshPlayerInfo = function refreshPlayerInfo() {
      clearTimeout(infoTimer);
      const t = currentTrack;
      section.hidden = !t;
      if (!t || infoFor === t.id) return;
      infoFor = t.id;
      paintInfo(t, infoCache.get(t.id) || {});
      infoTimer = setTimeout(() => loadInfo(t), 600);
    };
  }
  // a double tap on the cover opens the track's album
  {
    let lastTap = 0;
    document.querySelector(".player-art-wrap").addEventListener("click", (e) => {
      if (document.body.classList.contains("lyrics-open") || e.target.closest("#theme-try, #player-lyrics")) return;
      const now = Date.now();
      if (now - lastTap > 340) { lastTap = now; return; }
      lastTap = 0;
      const t = currentTrack;
      if (!t) return;
      haptic("medium");
      if (t.albumId) openAlbumById(t.source, t.albumId, t.album, t.artist);
      else if (t.album) openAlbumScreen(t);
      else showToast("У этого трека нет альбома");
    });
  }
  $("artist-play-btn").addEventListener("click", () => {
    if (!currentArtistTracks.length) { showToast("Нет треков"); return; }
    playOrToggle(`artist:${$("artist-name").textContent}`, currentArtistTracks, $("artist-name").textContent);
  });
  $("artist-shuffle-btn").addEventListener("click", () => shuffleOrToggle(`artist:${$("artist-name").textContent}`));
  $("album-shuffle-btn").addEventListener("click", () => shuffleOrToggle(`album:${$("album-title").textContent}`));
  $("artist-follow-btn").addEventListener("click", () => {
    const name = $("artist-name").textContent;
    const on = Store.toggleArtistFollow(name, {
      artistId: currentArtistMeta.artistId || null,
      source: currentArtistMeta.source || null,
      photo: currentArtistMeta.photo || null,
    });
    syncFollow(name);
    renderLibrary();
    haptic(on ? "success" : "light");
    showToast(on ? `${name} теперь в подписках` : `${name} больше не в подписках`);
  });

  let currentAlbumTracks = [];
  let currentAlbumMeta = { artist: "", artistId: null, source: null };

  function renderAlbumTrackList(tracks, contextTitle) {
    currentAlbumTracks = tracks;
    const list = $("album-tracks");
    list.innerHTML = "";
    tracks.forEach((t, i) => list.appendChild(buildTrackRow(t, { index: i + 1, queue: tracks, context: contextTitle, heart: true })));
  }

  // Single-track pseudo-album view, used when a track carries no real
  // albumId (soundcloud / youtube_web fallback) — honest simplification
  // (see README).
  function openAlbumScreen(track, isBack) {
    albumToken++;
    currentAlbumMeta = { artist: track.artist || "", artistId: track.artistId || null, source: track.source || null };
    $("album-title").textContent = track.title || "";
    $("album-artist-link").textContent = track.artist || "";
    $("album-meta").textContent = "Сингл · 1 трек";
    setCoverEl($("album-cover"), track.artwork, track.id);
    renderAlbumTrackList([track], track.title || "");
    showScreen("album", isBack ? { replace: true } : { params: { track } });
    updateSourceButtons();
  }

  // Real album view, loaded from the backend for youtube_music tracks.
  let albumToken = 0;
  async function openAlbumById(source, albumId, fallbackTitle, fallbackArtist, isBack) {
    if (!source || !albumId) return;
    const token = ++albumToken;
    currentAlbumMeta = { artist: fallbackArtist || "", artistId: null, source };
    $("album-title").textContent = fallbackTitle || "Альбом";
    $("album-artist-link").textContent = fallbackArtist || "";
    $("album-meta").textContent = "Загрузка…";
    setCoverEl($("album-cover"), null, albumId);
    renderAlbumTrackList([], fallbackTitle || "Альбом");
    showScreen("album", isBack ? { replace: true } : { params: { source, albumId, title: fallbackTitle, artist: fallbackArtist } });
    try {
      const url = `${API_BASE_URL}/album?source=${encodeURIComponent(source)}&id=${encodeURIComponent(albumId)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const album = await res.json();
      if (token !== albumToken) return; // another album was opened meanwhile
      currentAlbumMeta = { artist: album.artist || "", artistId: album.artistId || null, source: album.source || source };
      $("album-title").textContent = album.title || fallbackTitle || "Альбом";
      $("album-artist-link").textContent = album.artist || fallbackArtist || "";
      $("album-meta").textContent = `Альбом${album.year ? " · " + album.year : ""} · ${pluralTracks((album.tracks || []).length)}`;
      setCoverEl($("album-cover"), album.cover, albumId);
      renderAlbumTrackList(album.tracks || [], album.title || fallbackTitle || "Альбом");
      updateSourceButtons();
    } catch (e) {
      if (token !== albumToken) return;
      console.error(e);
      showToast("Не удалось загрузить альбом");
      $("album-meta").textContent = "Альбом";
    }
  }
  $("album-back-btn").addEventListener("click", goBack);
  $("album-play-btn").addEventListener("click", () => {
    if (!currentAlbumTracks.length) { showToast("Нет треков"); return; }
    playOrToggle(`album:${$("album-title").textContent}`, currentAlbumTracks, $("album-title").textContent);
  });
  $("album-artist-link").addEventListener("click", () => {
    if (currentAlbumMeta.artist) {
      openArtistScreen(currentAlbumMeta.artist, currentAlbumTracks, {
        artistId: currentAlbumMeta.artistId,
        source: currentAlbumMeta.source,
      });
    }
  });

  // ============================================================
  // PROGRESS + SCRUBBING
  // ============================================================
  const progressTrack = $("player-progress-track");
  const progressFill = $("player-progress-fill");
  const progressThumb = $("player-progress-thumb");
  const miniProgress = $("mp-progress");
  const miniScrub = $("mp-scrub");
  const miniTimeCur = $("mp-time-cur");
  const miniTimeTot = $("mp-time-tot");

  let isScrubbing = false;

  // ---- a theme can be touched. A tap pauses or plays. A record or a
  // disc is turned by the finger: a full turn is a quarter of a minute of
  // music. A cassette is wound by a drag across it: its width is a minute.
  const artWrap = document.querySelector(".player-art-wrap");
  const TURN_SECONDS = 15, CASSETTE_SECONDS = 60;
  let artGrab = null;
  const artTheme = () => document.body.dataset.playerTheme || "standard";
  artWrap.addEventListener("pointerdown", (e) => {
    if (artTheme() === "standard" || document.body.classList.contains("lyrics-open") || !currentTrack) return;
    if (e.target.closest("#theme-try, #player-lyrics")) return;
    const el = artTheme() === "cassette" ? playerCassette : $("player-art");
    const r = el.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    artGrab = { id: e.pointerId, x: e.clientX, y: e.clientY, cx, cy, width: r.width, moved: false, turned: 0, angle: Math.atan2(e.clientY - cy, e.clientX - cx), from: audio.currentTime || 0, to: null, tick: 0, at: performance.now(), prev: 0 };
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
      scratch.start(artTheme());
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
    // how fast the hand turns: the scratch follows it
    const nowMs = performance.now();
    const turnedNow = artTheme() === "cassette" ? (e.clientX - g.x) * 2 : g.turned;
    const dt = Math.max(8, nowMs - g.at);
    scratch.move(((turnedNow - g.prev) / dt) * 1000, turnedNow);
    g.prev = turnedNow;
    g.at = nowMs;
  });
  // ---- the sound of turning a player by hand. Soft and short, each player its own:
  //   vinyl: a gentle scratch, a filtered breath with a «wiu» that slides with the hand;
  //   cd: little musical blips, one for every notch the disc is turned (a pentatonic scale, so it always sounds good);
  //   cassette: the tape winding: a low whirr with a light flutter, higher forward, lower back.
  // Quiet by design (the music steps back a little under it). Can be switched off in the settings. ----
  const scratch = (() => {
    let ctx = null, master = null;
    let kind = "vinyl";
    let noise = null, noiseFilter = null, noiseGain = null;
    let tone = null, toneGain = null, vib = null, vibGain = null;
    let ducked = false, lastNotch = null, lastBlip = 0;
    const enabled = () => Store.getSetting("scratchSound") !== false;
    const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21]; // pentatonic, in semitones above A3
    function build() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.7;
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -22; comp.ratio.value = 4;
      master.connect(comp); comp.connect(ctx.destination);
      // a breath of noise (soft, not hiss): looped, band-passed
      const len = Math.floor(ctx.sampleRate * 1.5);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.06 * w) / 1.06; d[i] = last * 3.2; } // brown-ish noise
      noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
      noiseFilter = ctx.createBiquadFilter(); noiseFilter.type = "bandpass"; noiseFilter.frequency.value = 900; noiseFilter.Q.value = 5;
      noiseGain = ctx.createGain(); noiseGain.gain.value = 0;
      noise.connect(noiseFilter); noiseFilter.connect(noiseGain); noiseGain.connect(master);
      // the tone that follows the hand
      tone = ctx.createOscillator(); tone.type = "triangle"; tone.frequency.value = 200;
      toneGain = ctx.createGain(); toneGain.gain.value = 0;
      vib = ctx.createOscillator(); vib.frequency.value = 5.5;
      vibGain = ctx.createGain(); vibGain.gain.value = 0;
      vib.connect(vibGain); vibGain.connect(tone.frequency);
      tone.connect(toneGain); toneGain.connect(master);
      noise.start(); tone.start(); vib.start();
      return true;
    }
    function start(player) {
      if (!enabled()) return;
      kind = player === "cd" || player === "cassette" ? player : "vinyl";
      try {
        if (!ctx && !build()) return;
        if (ctx.state === "suspended") ctx.resume();
        tone.type = kind === "cassette" ? "sine" : "triangle";
        noiseFilter.Q.value = kind === "cassette" ? 1.2 : 5;
        lastNotch = null;
        duck(true);
      } catch (e) { ctx = null; }
    }
    function duck(on) {
      if (typeof volumeWorks === "undefined" || !volumeWorks) return;
      if (on && !ducked) { ducked = true; try { audio.volume = Math.max(0, userVolume * 0.4); } catch (e) { /* ignore */ } }
      else if (!on && ducked) { ducked = false; try { audio.volume = userVolume; } catch (e) { /* ignore */ } }
    }
    function blip(step, v) {
      const now = ctx.currentTime;
      if (now - lastBlip < 0.035) return; // never a buzz
      lastBlip = now;
      const note = SCALE[((step % SCALE.length) + SCALE.length) % SCALE.length];
      const f = 220 * Math.pow(2, note / 12);
      const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = f;
      const o2 = ctx.createOscillator(); o2.type = "triangle"; o2.frequency.value = f * 2;
      const g = ctx.createGain();
      const peak = 0.16 + v * 0.1;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(peak, now + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
      const g2 = ctx.createGain(); g2.gain.value = 0.35;
      o.connect(g); o2.connect(g2); g2.connect(g); g.connect(master);
      o.start(now); o2.start(now); o.stop(now + 0.2); o2.stop(now + 0.2);
    }
    // speed: how fast the hand turns (units per second, sign = direction); position: how far it has turned in all
    function move(speed, position) {
      if (!ctx || !enabled()) return;
      const v = Math.min(1, Math.abs(speed) / 520);
      const dir = speed < 0 ? -1 : 1;
      const now = ctx.currentTime;
      const quiet = v < 0.015;
      if (kind === "cd") {
        // a blip for each notch; between notches, a faint high shimmer follows the speed
        const step = Math.floor((position || 0) / 16);
        if (lastNotch === null) lastNotch = step;
        if (step !== lastNotch) { lastNotch = step; if (!quiet) blip(step, v); }
        noiseGain.gain.setTargetAtTime(quiet ? 0 : 0.015 + v * 0.05, now, 0.05);
        noiseFilter.frequency.setTargetAtTime(2400 + v * 3000, now, 0.05);
        toneGain.gain.setTargetAtTime(0, now, 0.03);
        return;
      }
      if (kind === "cassette") {
        // the tape: a whirr that rises with the speed, with the slight waver of a real mechanism
        toneGain.gain.setTargetAtTime(quiet ? 0 : 0.07 + v * 0.1, now, 0.06);
        tone.frequency.setTargetAtTime((dir > 0 ? 130 : 90) + v * (dir > 0 ? 360 : 220), now, 0.06);
        vib.frequency.setTargetAtTime(4 + v * 6, now, 0.1);
        vibGain.gain.setTargetAtTime(6 + v * 14, now, 0.1);
        noiseGain.gain.setTargetAtTime(quiet ? 0 : 0.035 + v * 0.06, now, 0.06);
        noiseFilter.frequency.setTargetAtTime(1800 + v * 2500, now, 0.06);
        return;
      }
      // vinyl: the breath of the groove and a «wiu» that goes up with the hand and down when it turns back
      noiseGain.gain.setTargetAtTime(quiet ? 0 : 0.1 + v * 0.22, now, 0.03);
      noiseFilter.frequency.setTargetAtTime(500 + v * 2600 + (dir < 0 ? -120 : 140), now, 0.03);
      toneGain.gain.setTargetAtTime(quiet ? 0 : 0.05 + v * 0.1, now, 0.04);
      tone.frequency.setTargetAtTime((dir > 0 ? 160 : 120) + v * (dir > 0 ? 520 : 300), now, 0.04);
      vib.frequency.setTargetAtTime(5.5, now, 0.1);
      vibGain.gain.setTargetAtTime(v * 10, now, 0.1);
    }
    function stop() {
      if (ctx) {
        const now = ctx.currentTime;
        noiseGain.gain.setTargetAtTime(0, now, 0.07);
        toneGain.gain.setTargetAtTime(0, now, 0.07);
        vibGain.gain.setTargetAtTime(0, now, 0.07);
      }
      duck(false);
    }
    return { start, move, stop };
  })();
  const endArtGrab = (e) => {
    if (!artGrab || (e && e.pointerId !== artGrab.id)) return;
    const g = artGrab;
    artGrab = null;
    scratch.stop();
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
  const playerScreen = $("screen-player");
  let swipe = null;
  const swipeTargets = () => [document.querySelector(".player-art-wrap"), document.querySelector(".player-meta")];
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
  const endSwipe = (e) => {
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
  let lastPositionSync = 0;

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
  let statLast = null;
  let statHeard = 0;
  let statCounted = false;
  let statSavedAt = 0;
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


  // ============================================================
  // ВЫРАВНИВАНИЕ ГРОМКОСТИ: первые секунды трека измеряем, дальше подтягиваем или
  // приглушаем до общего уровня. Работает через Web Audio, поэтому и там, где
  // Telegram не даёт менять громкость. Включается в «Звук и загрузки».
  // ============================================================
  const loudness = (() => {
    const KEY = "notka_gain";
    const TARGET = 0.12, MIN = 0.45, MAX = 1.7;
    let ctx = null, gainNode = null, analyser = null, buf = null, timer = null, sumSq = 0, frames = 0, trackId = null;
    let vizAnalyser = null;
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
        vizAnalyser = ctx.createAnalyser();
        vizAnalyser.fftSize = 256;
        vizAnalyser.smoothingTimeConstant = 0.78;
        src.connect(vizAnalyser);
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
    // the level of the music for the button on the home page: 0..1 from the low end of the spectrum (null when not available)
    const vizBuf = new Uint8Array(128);
    function level() {
      if (!vizAnalyser) return null;
      vizAnalyser.getByteFrequencyData(vizBuf);
      let s = 0;
      for (let i = 1; i < 12; i++) s += vizBuf[i];
      const avg = s / 11;
      // the spectrum's bass is almost always high: only what rises above its usual level moves the button
      return Math.max(0, Math.min(1, (avg - 105) / 120));
    }
    function startViz() { if (isDesktop() && supported && !audio.paused && ensure() && ctx.state === "suspended") ctx.resume().catch(() => {}); return !!vizAnalyser; }
    return { supported, onPlaying, reset, refresh, enabled, level, startViz };
  })();
  audio.addEventListener("playing", () => loudness.onPlaying(currentTrack));
  audio.addEventListener("loadstart", () => loudness.reset());

  // «Плавный переход»: fade in at the start, fade out at the end
  const volumeWorks = (() => { try { const p = document.createElement("audio"); p.volume = 0.5; return Math.abs(p.volume - 0.5) < 0.01; } catch (e) { return false; } })();
  // the listener's own level (the computer's bar); a fade works under it
  let userVolume = 1;
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
  let volumeBeforeMute = 0.8;
  $("mp-vol").addEventListener("input", (e) => { setUserVolume(e.target.value / 100, true); if (userVolume > 0) volumeBeforeMute = userVolume; });
  $("mp-mute-btn").addEventListener("click", () => {
    if (userVolume > 0) { volumeBeforeMute = userVolume; setUserVolume(0, true); } else setUserVolume(volumeBeforeMute || 0.8, true);
  });
  setUserVolume(userVolume, false);
  $("mp-prev-btn").addEventListener("click", () => playAdjacent(-1));
  $("mp-next-btn").addEventListener("click", () => playAdjacent(1));
  $("mp-queue-btn").addEventListener("click", () => { renderQueueSheet(); openOverlay("queue-sheet"); });
  $("mp-fav-btn").addEventListener("click", () => $("player-fav-btn").click());
  $("mp-fav-ph").addEventListener("click", (e) => { e.stopPropagation(); $("player-fav-btn").click(); });

  // «Звук вертушки»: on unless switched off
  {
    const sw = $("toggle-scratch");
    const paint = () => sw.setAttribute("aria-checked", Store.getSetting("scratchSound") === false ? "false" : "true");
    paint();
    sw.addEventListener("click", () => {
      Store.setSetting("scratchSound", Store.getSetting("scratchSound") === false);
      haptic("select");
      paint();
    });
  }

  // «Новые треки в начало»: one setting, two switches (the settings page and the add-to-playlist sheet)
  function renderAtStartSwitches() {
    const on = !!Store.getSetting("playlistAddToStart");
    ["toggle-atstart", "toggle-atstart-sheet"].forEach((id) => { const el = $(id); if (el) el.setAttribute("aria-checked", on ? "true" : "false"); });
  }
  ["toggle-atstart", "toggle-atstart-sheet"].forEach((id) => {
    $(id).addEventListener("click", () => {
      Store.setSetting("playlistAddToStart", !Store.getSetting("playlistAddToStart"));
      haptic("select");
      renderAtStartSwitches();
    });
  });
  renderAtStartSwitches();

  audio.addEventListener("timeupdate", () => {
    if (mymixActive && mixProgressEl) {
      const dur = effectiveDuration();
      const k = dur ? Math.min(1, audio.currentTime / dur) : 0;
      mixProgressEl.style.strokeDashoffset = String(389.6 * (1 - k));
    }
    saveResume(false);
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
  const miniInset = () => parseFloat(getComputedStyle(miniScrub).getPropertyValue("--tl")) || 21;
  const MINI_LINE_ZONE = 20; // px from the bottom edge that count as «on the line»
  let miniGrab = null;
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

  // ============================================================
  // ONBOARDING (first run only) → HOME
  // ============================================================
  function finishOnboarding() {
    Store.markOnboardingSeen();
    haptic("light");
    showScreen("home", { replace: true });
  }
  $("onb-start-btn").addEventListener("click", finishOnboarding);

  // ---- glass answers touch with a specular bloom at the finger ----
  document.addEventListener("pointerdown", (e) => {
    const g = e.target.closest && e.target.closest(".glass, .round-glass");
    if (!g) return;
    const r = g.getBoundingClientRect();
    g.style.setProperty("--gx", `${((e.clientX - r.left) / r.width) * 100}%`);
    g.style.setProperty("--gy", `${((e.clientY - r.top) / r.height) * 100}%`);
    g.classList.add("is-touched");
    const release = () => {
      g.classList.remove("is-touched");
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
  }, { passive: true });

  // Splash: the light gathers and the mark appears while fonts load;
  // never shorter than the entrance animation, never longer than 2.6s.
  // links from the bot: ?t=<src>_<id> (a track) or ?p=<id> (a playlist);
  // also Telegram's own start_param (t_… / p_…) when opened via a direct link
  function deepLinkTarget() {
    const q = new URLSearchParams(location.search);
    const start = (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) || "";
    return {
      t: q.get("t") || (start.startsWith("t_") ? start.slice(2) : ""),
      p: q.get("p") || (start.startsWith("p_") ? start.slice(2) : ""),
      promo: q.get("promo") || (start.startsWith("promo_") ? start.slice(6) : ""),
    };
  }
  async function openDeepLink() {
    const { t, p, promo } = deepLinkTarget();
    if (promo) {
      // a link from an ad: the Плюс page opens and the code activates itself
      showScreen("plus");
      openPromo(promo);
      return;
    }
    if (t) {
      const m = t.match(/^([a-z]{2})_(.+)$/);
      const source = m && CODE_SOURCES[m[1]];
      if (!source) return;
      try {
        const res = await fetch(`${API_BASE_URL}/resolve?source=${encodeURIComponent(source)}&id=${encodeURIComponent(m[2])}`);
        if (!res.ok) throw new Error("resolve");
        const data = await res.json();
        const tr = data.track;
        if (!tr) throw new Error("no track");
        playTrack(tr, [tr], { context: "Поделились с тобой" });
        showScreen("player");
      } catch (e) { showToast("Не получилось открыть трек по ссылке"); }
    } else if (p) {
      if (state.sharedImports[p] && state.playlists.some((pl) => pl.id === state.sharedImports[p])) { openPlaylist(state.sharedImports[p]); return; }
      try {
        const res = await fetch(`${API_BASE_URL}/shared/${encodeURIComponent(p)}`);
        if (!res.ok) throw new Error("shared");
        const data = await res.json();
        const pl = Store.createPlaylist(data.name || "Плейлист");
        (data.tracks || []).forEach((tr) => Store.addTrackToPlaylist(pl.id, tr));
        state.sharedImports[p] = pl.id;
        persist();
        renderLibrary();
        openPlaylist(pl.id);
        showToast(`Плейлист «${pl.name}» добавлен в «Моё»`);
      } catch (e) { showToast("Не получилось открыть плейлист по ссылке"); }
    }
  }

  function boot() {
    showScreen("splash", { replace: true });
    const link = deepLinkTarget();
    const viaLink = !!(link.t || link.p);
    const minDelay = new Promise((r) => setTimeout(r, viaLink ? 500 : 1700));
    const fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    const cap = new Promise((r) => setTimeout(r, 2800));
    Promise.race([Promise.all([minDelay, fonts]), cap]).then(() => {
      const splash = screens.splash;
      splash.classList.add("is-leaving");
      setTimeout(() => {
        splash.classList.remove("is-leaving");
        Store.markOnboardingSeen();
        restoreResume();
        showScreen("home", { replace: true });
        openDeepLink();
      }, 450);
    });
  }
  boot();
})();
