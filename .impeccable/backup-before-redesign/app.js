(() => {
  const API_BASE_URL =
    window.NOTKA_CONFIG && window.NOTKA_CONFIG.API_BASE_URL !== undefined
      ? window.NOTKA_CONFIG.API_BASE_URL
      : "http://localhost:8080";
  const STORAGE_KEY = "notka_state_v2";

  // --- Telegram WebApp integration (safe no-op outside Telegram) ---
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    try {
      tg.ready();
      tg.expand();
      tg.setHeaderColor && tg.setHeaderColor("#130B04");
      tg.setBackgroundColor && tg.setBackgroundColor("#130B04");
    } catch (e) {
      console.warn("Telegram WebApp init failed", e);
    }
  }
  const tgUser = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;

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
  if (tg && tg.onEvent) {
    tg.onEvent("viewportChanged", applyTgViewportHeight);
  }
  window.addEventListener("resize", applyTgViewportHeight);

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
        onboardingSeen: !!parsed.onboardingSeen,
        notifUnread: typeof parsed.notifUnread === "number" ? parsed.notifUnread : 2,
      };
    } catch (e) {
      return {
        favorites: [], playlists: [],
        settings: { activityVisible: true, publicPlaylists: false, normalize: true, wifiOnlyDownloads: true, crossfade: 0, notifNews: true, notifNewMusic: true, notifPlaylistUpdates: false },
        followedArtists: [], playlistFlags: {}, accountName: null, accountAvatar: null, onboardingSeen: false, notifUnread: 2,
      };
    }
  }
  const state = loadState();
  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Could not persist state", e);
    }
  }

  const Store = {
    isFavorite(id) { return state.favorites.some((t) => t.id === id); },
    toggleFavorite(track) {
      const idx = state.favorites.findIndex((t) => t.id === track.id);
      if (idx >= 0) state.favorites.splice(idx, 1);
      else state.favorites.unshift(track);
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
    addTrackToPlaylist(playlistId, track) {
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
    removeTrackFromPlaylist(playlistId, trackId) {
      const playlist = state.playlists.find((p) => p.id === playlistId);
      if (!playlist) return;
      playlist.trackIds = playlist.trackIds.filter((id) => id !== trackId);
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
    toggleArtistFollow(name) {
      const idx = state.followedArtists.indexOf(name);
      if (idx >= 0) state.followedArtists.splice(idx, 1); else state.followedArtists.push(name);
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
    markOnboardingSeen() { state.onboardingSeen = true; persist(); },
    isOnboardingSeen() { return state.onboardingSeen; },
  };

  // ============================================================
  // Custom avatar/cover picker — lets the person set their own photo
  // (from the device's gallery/camera via Telegram's file picker) as a
  // profile or playlist avatar, same as in the design prototype.
  // Images are downscaled + re-encoded to a small JPEG before being
  // stored, so a multi-megapixel phone photo doesn't blow up
  // localStorage (which has a small quota).
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
  function setCoverBackgroundImage(el, dataUrl) {
    if (!el) return;
    el.innerHTML = "";
    if (dataUrl) {
      const img = document.createElement("img");
      img.src = dataUrl;
      img.alt = "";
      el.appendChild(img);
      el.style.background = "";
    }
  }

  // ============================================================
  // DOM refs
  // ============================================================
  const screens = {
    splash: document.getElementById("screen-splash"),
    onboarding: document.getElementById("screen-onboarding"),
    home: document.getElementById("screen-home"),
    search: document.getElementById("screen-search"),
    library: document.getElementById("screen-library"),
    favorites: document.getElementById("screen-favorites"),
    playlist: document.getElementById("screen-playlist"),
    profile: document.getElementById("screen-profile"),
    player: document.getElementById("screen-player"),
    album: document.getElementById("screen-album"),
    artist: document.getElementById("screen-artist"),
    addTracks: document.getElementById("screen-add-tracks"),
    editPlaylist: document.getElementById("screen-edit-playlist"),
    account: document.getElementById("screen-account"),
    sound: document.getElementById("screen-sound"),
    notifications: document.getElementById("screen-notifications"),
    about: document.getElementById("screen-about"),
  };
  const bottomNav = document.getElementById("bottom-nav");
  const miniPlayer = document.getElementById("mini-player");
  const TAB_SCREENS = new Set(["home", "search", "library", "profile"]);
  const MINI_PLAYER_SCREENS = new Set(["home", "search", "library", "profile", "album", "artist"]);

  let navStack = ["home"];

  function showScreen(name, opts) {
    opts = opts || {};
    Object.entries(screens).forEach(([key, el]) => { if (el) el.hidden = key !== name; });
    bottomNav.hidden = !TAB_SCREENS.has(name);
    if (name === "home") renderHome();
    if (name === "library") renderLibrary();
    if (name === "favorites") renderFavoritesScreen();
    if (name === "profile") renderProfile();
    if (name === "account") renderAccountScreen();
    if (name === "sound") renderSoundScreen();
    if (name === "notifications") renderNotificationsScreen();
    if (TAB_SCREENS.has(name)) {
      document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
      navStack = [name];
    } else if (!opts.replace) {
      navStack.push(name);
    }
    const activeEl = screens[name];
    if (activeEl) {
      activeEl.classList.remove("screen-anim");
      void activeEl.offsetWidth;
      activeEl.classList.add("screen-anim");
    }
    if (miniPlayer) miniPlayer.hidden = !currentTrack || !MINI_PLAYER_SCREENS.has(name);
    window.scrollTo(0, 0);
  }

  function goBack() {
    navStack.pop();
    const prev = navStack[navStack.length - 1] || "home";
    showScreen(prev, { replace: true });
  }

  // ============================================================
  // Generic sheet / modal open-close (matches final artifact's
  // openOverlay()/closeOverlay() transition behaviour).
  // ============================================================
  function openOverlay(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = "flex";
    el.classList.remove("open");
    void el.offsetWidth;
    requestAnimationFrame(() => el.classList.add("open"));
  }
  function closeOverlay(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove("open");
    setTimeout(() => { if (!el.classList.contains("open")) el.style.display = "none"; }, 200);
  }
  document.querySelectorAll(".sheet-anim, .modal-anim").forEach((el) => {
    el.addEventListener("click", (e) => { if (e.target === el) closeOverlay(el.id); });
  });

  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => showScreen(btn.dataset.tab));
  });

  function showToast(text) {
    let toast = document.querySelector(".toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "toast";
      document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.classList.add("show");
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => toast.classList.remove("show"), 2200);
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

  function heartSvg(active) {
    if (active) {
      return `<svg width="16" height="16" viewBox="0 0 24 24" fill="#FF7A2E"><path d="M12 21s-7.5-4.6-10-9.3C.6 8.6 2.3 5 6 5c2 0 3.6 1.1 4.5 2.6C11.4 6.1 13 5 15 5c3.7 0 5.4 3.6 4 6.7C19.5 16.4 12 21 12 21Z"/></svg>`;
    }
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 21s-7.5-4.6-10-9.3C.6 8.6 2.3 5 6 5c2 0 3.6 1.1 4.5 2.6C11.4 6.1 13 5 15 5c3.7 0 5.4 3.6 4 6.7C19.5 16.4 12 21 12 21Z" stroke="#F7F0EB" stroke-opacity="0.4" stroke-width="1.6"/></svg>`;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // Paint a cover element with a real photo/artwork <img> when a URL is
  // available (same pattern used for track artwork elsewhere), falling
  // back to a CSS gradient only when no real cover art exists.
  function setCoverEl(el, url, fallbackGradient) {
    if (!el) return;
    el.innerHTML = "";
    if (url) {
      const img = document.createElement("img");
      img.src = url;
      img.alt = "";
      el.appendChild(img);
      el.style.background = "";
    } else {
      el.style.background = fallbackGradient;
    }
  }

  // ============================================================
  // Track row builder — shared across all lists.
  // ============================================================
  function buildTrackRow(track, opts) {
    opts = opts || {};
    const li = document.createElement("li");
    li.className = "track-row" + (opts.inScroll ? " in-scroll" : "");
    li.style.cursor = "pointer";
    li.dataset.trackId = track.id;
    if (track.id === currentTrackId) li.classList.add("playing");

    const art = document.createElement("div");
    art.className = "track-art " + (opts.inScroll ? "md" : "sm");
    if (track.artwork) {
      const img = document.createElement("img");
      img.src = track.artwork;
      img.alt = "";
      art.appendChild(img);
    }

    const meta = document.createElement("div");
    meta.className = "track-meta";
    const title = document.createElement("div");
    title.className = "track-title";
    title.textContent = track.title || "Без названия";
    const artist = document.createElement("div");
    artist.className = "track-artist";
    artist.textContent = track.artist || "Неизвестный исполнитель";
    meta.appendChild(title);
    meta.appendChild(artist);

    if (opts.index != null) {
      const idx = document.createElement("span");
      idx.className = "track-index";
      idx.textContent = String(opts.index);
      li.appendChild(idx);
    }

    li.appendChild(art);
    li.appendChild(meta);

    if (!opts.hideDuration) {
      const dur = document.createElement("span");
      dur.className = "track-duration";
      dur.textContent = formatDuration(track.duration);
      li.appendChild(dur);
    }

    const favBtn = document.createElement("button");
    favBtn.className = "fav-icon-btn";
    favBtn.innerHTML = heartSvg(Store.isFavorite(track.id));
    favBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isFav = Store.toggleFavorite(track);
      favBtn.innerHTML = heartSvg(isFav);
      refreshCurrentScreen();
    });
    li.appendChild(favBtn);

    if (opts.showAdd) {
      const addBtn = document.createElement("button");
      addBtn.className = "track-add-btn";
      addBtn.textContent = "＋";
      addBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        addTrackToPlaylistFlow(track);
      });
      li.appendChild(addBtn);
    }

    li.addEventListener("click", () => playTrack(track, opts.queue || [track], { context: opts.context }));
    return li;
  }

  function refreshCurrentScreen() {
    const visible = Object.entries(screens).find(([, el]) => !el.hidden);
    if (!visible) return;
    const name = visible[0];
    if (name === "home") renderHome();
    if (name === "library") renderLibrary();
    if (name === "favorites") renderFavoritesScreen();
    if (name === "search" && lastSearchResults) renderFilteredResults();
    if (name === "playlist" && currentPlaylistId) openPlaylist(currentPlaylistId, true);
  }

  // ============================================================
  // Create-playlist modal (replaces window.prompt)
  // ============================================================
  const createPlaylistModal = document.getElementById("create-playlist-modal");
  const createPlaylistInput = document.getElementById("create-playlist-input");
  let createPlaylistThenAddTrack = null; // track to add right after creating, if any

  function openCreatePlaylistModal(trackToAdd) {
    createPlaylistThenAddTrack = trackToAdd || null;
    createPlaylistInput.value = "";
    openOverlay("create-playlist-modal");
    setTimeout(() => createPlaylistInput.focus(), 50);
  }
  function confirmCreatePlaylist() {
    const name = createPlaylistInput.value.trim();
    if (!name) { createPlaylistInput.focus(); return; }
    const playlist = Store.createPlaylist(name);
    if (createPlaylistThenAddTrack) Store.addTrackToPlaylist(playlist.id, createPlaylistThenAddTrack);
    closeOverlay("create-playlist-modal");
    renderLibrary();
    showToast(`Плейлист «${name}» создан`);
    if (!createPlaylistThenAddTrack) openPlaylist(playlist.id);
  }
  document.getElementById("create-playlist-cancel").addEventListener("click", () => closeOverlay("create-playlist-modal"));
  document.getElementById("create-playlist-confirm").addEventListener("click", confirmCreatePlaylist);
  createPlaylistInput.addEventListener("keydown", (e) => { if (e.key === "Enter") confirmCreatePlaylist(); });

  // ============================================================
  // Add-to-playlist sheet (replaces window.prompt)
  // ============================================================
  let addToPlaylistTrack = null;
  function renderAddToPlaylistSheet() {
    const list = document.getElementById("add-to-playlist-list");
    if (!state.playlists.length) {
      list.innerHTML = `<div style="text-align:center;padding:18px 6px;color:var(--text-dim);font-size:13.5px;">Пока нет своих плейлистов</div>`;
      return;
    }
    list.innerHTML = state.playlists.map((p) => {
      const inList = addToPlaylistTrack && p.trackIds.includes(addToPlaylistTrack.id);
      const g = gradients[p.id.length % gradients.length];
      return `<button class="sheet-row tap" data-playlist-id="${p.id}" style="justify-content:space-between;">
        <span style="display:flex;align-items:center;gap:12px;">
          <span style="width:36px;height:36px;border-radius:9px;background:${g};display:inline-block;"></span>
          ${escapeHtml(p.name)}
        </span>
        <span>${inList ? "✓" : "＋"}</span>
      </button>`;
    }).join("");
    list.querySelectorAll("[data-playlist-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const pid = btn.dataset.playlistId;
        Store.addTrackToPlaylist(pid, addToPlaylistTrack);
        const p = state.playlists.find((pl) => pl.id === pid);
        showToast(`Добавлено в «${p.name}»`);
        renderAddToPlaylistSheet();
        renderLibrary();
        if (currentPlaylistId === pid) openPlaylist(pid, true);
      });
    });
  }
  function openAddToPlaylistSheet(track) {
    addToPlaylistTrack = track;
    renderAddToPlaylistSheet();
    openOverlay("add-to-playlist-sheet");
  }
  document.getElementById("add-to-playlist-new").addEventListener("click", () => {
    closeOverlay("add-to-playlist-sheet");
    openCreatePlaylistModal(addToPlaylistTrack);
  });

  function addTrackToPlaylistFlow(track) {
    openAddToPlaylistSheet(track);
  }

  // ============================================================
  // HOME
  // ============================================================
  function renderHome() {
    const greetingEl = document.getElementById("home-greeting");
    if (tgUser && tgUser.first_name) {
      greetingEl.textContent = `Привет, ${tgUser.first_name}`;
    } else {
      greetingEl.textContent = "Привет!";
    }

    const list = document.getElementById("home-favorites-list");
    const empty = document.getElementById("home-favorites-empty");
    list.innerHTML = "";
    const favs = state.favorites.slice(0, 5);
    if (!favs.length) {
      empty.hidden = false;
    } else {
      empty.hidden = true;
      favs.forEach((track) => {
        list.appendChild(buildTrackRow(track, { queue: state.favorites, context: "Топ треков" }));
      });
    }
    document.getElementById("pick-favorites-sub").textContent = pluralTracks(state.favorites.length);
    updateMymixCardUI();
  }

  document.getElementById("home-see-all-favorites").addEventListener("click", () => showScreen("favorites"));

  document.getElementById("pick-top").addEventListener("click", () => showToast("Топ чартов — скоро"));
  document.getElementById("pick-new").addEventListener("click", () => showToast("Новинки — скоро"));
  document.getElementById("pick-playlists").addEventListener("click", () => showScreen("library"));
  document.getElementById("pick-favorites").addEventListener("click", () => showScreen("favorites"));

  const mymixCard = document.getElementById("mymix-card");
  mymixCard.addEventListener("click", () => {
    if (!state.favorites.length) { showToast("Добавь любимые треки — тогда соберём микс"); return; }
    playTrack(state.favorites[0], state.favorites, { mymix: true });
    showScreen("player");
  });

  document.getElementById("bell-btn").addEventListener("click", () => showScreen("notifications"));

  // ============================================================
  // SEARCH
  // ============================================================
  const searchInput = document.getElementById("search-input");
  const searchClear = document.getElementById("search-clear");
  const searchStatus = document.getElementById("search-status");
  const stateEmpty = document.getElementById("search-state-empty");
  const stateLoading = document.getElementById("search-state-loading");
  const stateEmptyResults = document.getElementById("search-state-empty-results");
  const stateResults = document.getElementById("search-state-results");
  let debounceTimer = null;
  let lastSearchResults = null; // raw track results from backend, for the active query
  let searchTab = "all"; // all | tracks | artists | albums

  function showSearchState(id) {
    [stateEmpty, stateLoading, stateEmptyResults, stateResults].forEach((el) => {
      el.style.display = el.id === id ? (id === "search-state-results" ? "flex" : "flex") : "none";
    });
  }

  document.getElementById("search-tabs").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-tab]");
    if (!chip) return;
    searchTab = chip.dataset.tab;
    document.querySelectorAll("#search-tabs [data-tab]").forEach((el) => {
      el.classList.toggle("active", el === chip);
      el.classList.toggle("glass", el !== chip);
    });
    renderFilteredResults();
  });

  function sectionLabel(text) {
    return `<div style="font-size:11.5px;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.4px;padding:14px 4px 6px 4px;">${escapeHtml(text)}</div>`;
  }

  // Group tracks by artist name to approximate "Исполнители" results.
  // Tracks that carry a real artistId (youtube_music) keep it on the group
  // so the artist screen can load real metadata; tracks without one
  // (soundcloud / youtube_web fallback) still group by name only — an
  // honest client-side simplification for those sources (see README).
  function groupByArtist(tracks) {
    const map = new Map();
    tracks.forEach((t) => {
      const name = t.artist || "Неизвестный исполнитель";
      if (!map.has(name)) map.set(name, { name, tracks: [], artistId: null, source: null });
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

  function artistRowHtml(group) {
    return `<li class="track-row tap" data-artist-group="${escapeHtml(group.name)}" style="cursor:pointer;">
      <div class="track-art sm artist-row-art" style="border-radius:50%;"></div>
      <div class="track-meta">
        <div class="track-title">${escapeHtml(group.name)}</div>
        <div class="track-artist">Исполнитель · ${pluralTracks(group.tracks.length)}</div>
      </div>
    </li>`;
  }

  function albumRowHtml(group) {
    const isReal = !!group.albumId;
    return `<li class="track-row tap" data-album-group="${escapeHtml(group.albumId || group.artist)}" style="cursor:pointer;">
      <div class="track-art sm album-row-art"></div>
      <div class="track-meta">
        <div class="track-title">${escapeHtml(group.title)}</div>
        <div class="track-artist">${isReal ? "Альбом" : "Похожие треки"} · ${escapeHtml(group.artist)}</div>
      </div>
    </li>`;
  }

  function renderFilteredResults() {
    if (!lastSearchResults) return;
    const tracks = lastSearchResults;
    if (!tracks.length) { showSearchState("search-state-empty-results"); return; }

    stateResults.innerHTML = "";
    let artistGroups = [];
    let albumGroups = [];
    if (searchTab === "tracks") {
      tracks.forEach((t) => stateResults.appendChild(buildTrackRow(t, { showAdd: true, queue: tracks, context: "Поиск" })));
    } else if (searchTab === "artists") {
      artistGroups = groupByArtist(tracks);
      stateResults.insertAdjacentHTML("beforeend", artistGroups.map(artistRowHtml).join(""));
    } else if (searchTab === "albums") {
      albumGroups = groupByAlbum(tracks);
      stateResults.insertAdjacentHTML("beforeend", albumGroups.map(albumRowHtml).join(""));
    } else {
      stateResults.insertAdjacentHTML("beforeend", sectionLabel("Треки"));
      tracks.forEach((t) => stateResults.appendChild(buildTrackRow(t, { showAdd: true, queue: tracks, context: "Поиск" })));
    }
    // paint the cover art for the artist/album group rows we just inserted as HTML
    stateResults.querySelectorAll(".artist-row-art, .album-row-art").forEach((el, idx) => {
      const grad = el.classList.contains("artist-row-art")
        ? "linear-gradient(135deg,var(--accent),var(--accent-soft))"
        : "linear-gradient(135deg,var(--accent),#8A4A2E)";
      setCoverEl(el, null, grad);
    });
    stateResults.querySelectorAll("[data-artist-group]").forEach((row) => {
      const group = artistGroups.find((g) => g.name === row.dataset.artistGroup);
      row.addEventListener("click", () => openArtistScreen(group.name, tracks, { artistId: group.artistId, source: group.source }));
    });
    stateResults.querySelectorAll("[data-album-group]").forEach((row) => {
      const group = albumGroups.find((g) => (g.albumId || g.artist) === row.dataset.albumGroup);
      row.addEventListener("click", () => {
        if (group.albumId) openAlbumById(group.source, group.albumId, group.title, group.artist);
        else openAlbumScreen(group.tracks[0]);
      });
    });
    showSearchState("search-state-results");
  }

  function setSearchStatus(text, isError) {
    if (!text) { searchStatus.hidden = true; return; }
    searchStatus.hidden = false;
    searchStatus.textContent = text;
    searchStatus.classList.toggle("error", !!isError);
  }

  async function runSearch(query) {
    if (!query.trim()) {
      lastSearchResults = null;
      setSearchStatus("");
      showSearchState("search-state-empty");
      return;
    }
    setSearchStatus("");
    showSearchState("search-state-loading");
    try {
      const url = `${API_BASE_URL}/search?q=${encodeURIComponent(query)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      lastSearchResults = data.results || [];
      renderFilteredResults();
    } catch (err) {
      console.error(err);
      lastSearchResults = [];
      setSearchStatus("Не удалось получить результаты. Проверь, что бэкенд запущен и доступен.", true);
      showSearchState("search-state-empty-results");
    }
  }

  searchInput.addEventListener("input", () => {
    searchClear.hidden = searchInput.value.length === 0;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => runSearch(searchInput.value), 350);
  });
  searchClear.addEventListener("click", () => {
    searchInput.value = "";
    searchClear.hidden = true;
    runSearch("");
    searchInput.focus();
  });

  // ============================================================
  // LIBRARY
  // ============================================================
  function renderLibrary() {
    document.getElementById("library-fav-count").textContent = pluralTracks(state.favorites.length);

    const grid = document.getElementById("playlists-grid");
    const newCard = document.getElementById("new-playlist-card");
    grid.querySelectorAll(".playlist-card:not(#new-playlist-card)").forEach((el) => el.remove());

    state.playlists.forEach((playlist) => {
      const card = document.createElement("button");
      card.className = "playlist-card";
      const gradients = ["linear-gradient(135deg,#FF7A2E,#FFB86B)", "linear-gradient(135deg,#452B1E,#FF7A2E)", "linear-gradient(135deg,#D88C6A,#3A2419)"];
      const g = gradients[playlist.id.length % gradients.length];
      card.innerHTML = `
        <div class="playlist-cover" style="${playlist.cover ? "" : `background:${g};`}">${playlist.cover ? `<img src="${escapeHtml(playlist.cover)}" alt="">` : ""}</div>
        <div class="playlist-name">${escapeHtml(playlist.name)}</div>
        <div class="playlist-count">${pluralTracks(playlist.trackIds.length)}</div>
      `;
      card.addEventListener("click", () => openPlaylist(playlist.id));
      grid.insertBefore(card, newCard);
    });
  }

  document.getElementById("open-favorites-btn").addEventListener("click", () => showScreen("favorites"));
  document.getElementById("create-playlist-btn").addEventListener("click", () => openCreatePlaylistModal());
  document.getElementById("new-playlist-card").addEventListener("click", () => openCreatePlaylistModal());

  // ============================================================
  // FAVORITES (sub-screen)
  // ============================================================
  function renderFavoritesScreen() {
    const list = document.getElementById("favorites-list");
    const empty = document.getElementById("favorites-empty");
    list.innerHTML = "";
    if (!state.favorites.length) {
      empty.hidden = false;
    } else {
      empty.hidden = true;
      state.favorites.forEach((track) => list.appendChild(buildTrackRow(track, { showAdd: true, queue: state.favorites, context: "Любимые треки" })));
    }
  }
  document.getElementById("favorites-back-btn").addEventListener("click", goBack);

  // ============================================================
  // PLAYLIST DETAIL
  // ============================================================
  let currentPlaylistId = null;
  const gradients = ["linear-gradient(135deg,#FF7A2E,#FFB86B)", "linear-gradient(135deg,#452B1E,#FF7A2E)", "linear-gradient(135deg,#D88C6A,#3A2419)"];

  function openPlaylist(playlistId, keepStack) {
    const playlist = state.playlists.find((p) => p.id === playlistId);
    if (!playlist) return;
    currentPlaylistId = playlistId;
    document.getElementById("playlist-title").textContent = playlist.name;
    const tracks = Store.getPlaylistTracks(playlistId);
    document.getElementById("playlist-sub").textContent = pluralTracks(tracks.length);
    setCoverEl(document.getElementById("playlist-cover"), playlist.cover, gradients[playlist.id.length % gradients.length]);
    document.getElementById("playlist-cover-edit-btn").hidden = playlistId === "favorites";
    setHeartIcon(document.getElementById("playlist-heart-btn"), Store.isPlaylistFavorited(playlistId));

    const list = document.getElementById("playlist-tracks-list");
    const empty = document.getElementById("playlist-empty");
    list.innerHTML = "";
    if (!tracks.length) {
      empty.hidden = false;
    } else {
      empty.hidden = true;
      tracks.forEach((track, i) => {
        list.appendChild(buildTrackRow(track, { index: i + 1, queue: tracks, context: playlist.name }));
      });
    }
    if (!keepStack) showScreen("playlist");
  }

  function setHeartIcon(btn, active) {
    const svg = btn.querySelector("svg path");
    svg.setAttribute("fill", active ? "#FF7A2E" : "none");
    svg.setAttribute("stroke", active ? "#FF7A2E" : "#F7F0EB");
    svg.setAttribute("stroke-opacity", active ? "1" : "0.6");
  }

  document.getElementById("playlist-back-btn").addEventListener("click", goBack);
  document.getElementById("playlist-cover-edit-btn").addEventListener("click", async () => {
    if (!currentPlaylistId || currentPlaylistId === "favorites") return;
    const dataUrl = await pickAvatarImage();
    if (!dataUrl) return;
    Store.setPlaylistCover(currentPlaylistId, dataUrl);
    openPlaylist(currentPlaylistId, true);
  });
  document.getElementById("playlist-play-btn").addEventListener("click", () => {
    const tracks = Store.getPlaylistTracks(currentPlaylistId);
    if (tracks.length) { playTrack(tracks[0], tracks, { context: document.getElementById("playlist-title").textContent }); showScreen("player"); }
    else showToast("Плейлист пуст");
  });
  document.getElementById("playlist-shuffle-btn").addEventListener("click", () => {
    const tracks = Store.getPlaylistTracks(currentPlaylistId).slice();
    if (!tracks.length) { showToast("Плейлист пуст"); return; }
    for (let i = tracks.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [tracks[i], tracks[j]] = [tracks[j], tracks[i]]; }
    playTrack(tracks[0], tracks, { context: document.getElementById("playlist-title").textContent });
    showScreen("player");
    showToast("Перемешано");
  });
  document.getElementById("playlist-heart-btn").addEventListener("click", () => {
    if (!currentPlaylistId || currentPlaylistId === "favorites") return;
    const on = Store.togglePlaylistFavorited(currentPlaylistId);
    setHeartIcon(document.getElementById("playlist-heart-btn"), on);
    showToast(on ? "Добавлено в избранные плейлисты" : "Убрано из избранных плейлистов");
  });

  // ---- playlist "..." menu sheet ----
  document.getElementById("playlist-menu-btn").addEventListener("click", () => {
    const playlist = state.playlists.find((p) => p.id === currentPlaylistId);
    if (!playlist) return;
    document.getElementById("menu-playlist-title").textContent = playlist.name;
    document.getElementById("menu-playlist-cover").style.background = gradients[playlist.id.length % gradients.length];
    openOverlay("playlist-menu-sheet");
  });
  document.getElementById("menu-share").addEventListener("click", () => {
    closeOverlay("playlist-menu-sheet");
    const playlist = state.playlists.find((p) => p.id === currentPlaylistId);
    document.getElementById("share-title").textContent = `Поделиться «${playlist ? playlist.name : ""}»`;
    openOverlay("share-modal");
  });
  document.getElementById("menu-download").addEventListener("click", () => {
    closeOverlay("playlist-menu-sheet");
    showToast("Оффлайн-скачивание — скоро");
  });
  document.getElementById("menu-addtracks").addEventListener("click", () => {
    closeOverlay("playlist-menu-sheet");
    openAddTracksScreen();
  });
  document.getElementById("menu-editlist").addEventListener("click", () => {
    closeOverlay("playlist-menu-sheet");
    openEditPlaylistScreen();
  });
  document.getElementById("menu-details").addEventListener("click", () => {
    closeOverlay("playlist-menu-sheet");
    const playlist = state.playlists.find((p) => p.id === currentPlaylistId);
    if (!playlist) return;
    document.getElementById("details-name-input").value = playlist.name;
    document.getElementById("details-desc-input").value = playlist.description || "";
    openOverlay("details-modal");
  });
  document.getElementById("details-cancel").addEventListener("click", () => closeOverlay("details-modal"));
  document.getElementById("details-save").addEventListener("click", () => {
    const playlist = state.playlists.find((p) => p.id === currentPlaylistId);
    if (!playlist) return;
    const name = document.getElementById("details-name-input").value.trim();
    if (!name) { document.getElementById("details-name-input").focus(); return; }
    playlist.name = name;
    playlist.description = document.getElementById("details-desc-input").value.trim();
    persist();
    closeOverlay("details-modal");
    openPlaylist(currentPlaylistId, true);
    renderLibrary();
    showToast("Изменения сохранены");
  });
  document.getElementById("menu-delete").addEventListener("click", () => {
    const playlist = state.playlists.find((p) => p.id === currentPlaylistId);
    closeOverlay("playlist-menu-sheet");
    if (!playlist) return;
    Store.deletePlaylist(currentPlaylistId);
    renderLibrary();
    showToast(`Плейлист «${playlist.name}» удалён`);
    goBack();
  });
  document.getElementById("share-copy-link").addEventListener("click", () => showToast("Ссылка скопирована"));
  document.getElementById("share-close").addEventListener("click", () => closeOverlay("share-modal"));

  // ---- add-tracks screen (real backend search, used for "add to playlist") ----
  function openAddTracksScreen() {
    const input = document.getElementById("add-tracks-search");
    input.value = "";
    document.getElementById("add-tracks-list").innerHTML = "";
    showScreen("addTracks");
    setTimeout(() => input.focus(), 50);
  }
  let addTracksDebounce = null;
  document.getElementById("add-tracks-search").addEventListener("input", (e) => {
    clearTimeout(addTracksDebounce);
    const q = e.target.value;
    addTracksDebounce = setTimeout(async () => {
      const list = document.getElementById("add-tracks-list");
      if (!q.trim()) { list.innerHTML = ""; return; }
      list.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-dim);font-size:13px;">Ищем…</div>`;
      try {
        const res = await fetch(`${API_BASE_URL}/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        const tracks = data.results || [];
        const playlist = state.playlists.find((p) => p.id === currentPlaylistId);
        if (!tracks.length) { list.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-dim);font-size:13px;">Ничего не нашлось</div>`; return; }
        list.innerHTML = "";
        tracks.forEach((t) => {
          const inList = playlist && playlist.trackIds.includes(t.id);
          const row = document.createElement("div");
          row.className = "track-row tap";
          row.style.cursor = "pointer";
          row.innerHTML = `<div class="track-art sm"></div>
            <div class="track-meta"><div class="track-title">${escapeHtml(t.title || "")}</div><div class="track-artist">${escapeHtml(t.artist || "")}</div></div>
            <span style="font-size:18px;color:${inList ? "var(--accent)" : "var(--text-faint)"};">${inList ? "✓" : "＋"}</span>`;
          row.addEventListener("click", () => {
            if (!currentPlaylistId) return;
            Store.addTrackToPlaylist(currentPlaylistId, t);
            renderLibrary();
            openAddTracksScreen();
            document.getElementById("add-tracks-search").value = q;
            document.getElementById("add-tracks-search").dispatchEvent(new Event("input"));
            showToast(`Добавлено в плейлист`);
          });
          list.appendChild(row);
        });
      } catch (err) {
        list.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-dim);font-size:13px;">Не удалось получить результаты</div>`;
      }
    }, 350);
  });
  document.getElementById("add-tracks-back-btn").addEventListener("click", () => { goBack(); openPlaylist(currentPlaylistId, true); });

  // ---- edit-playlist screen (remove tracks) ----
  function openEditPlaylistScreen() {
    renderEditPlaylistList();
    showScreen("editPlaylist");
  }
  function renderEditPlaylistList() {
    const tracks = Store.getPlaylistTracks(currentPlaylistId);
    const list = document.getElementById("edit-playlist-list");
    list.innerHTML = "";
    if (!tracks.length) {
      list.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-dim);font-size:13.5px;">В плейлисте пока нет треков</div>`;
      return;
    }
    tracks.forEach((t) => {
      const row = document.createElement("div");
      row.className = "track-row tap";
      row.style.cursor = "pointer";
      row.innerHTML = `<div class="track-art sm"></div>
        <div class="track-meta"><div class="track-title">${escapeHtml(t.title || "")}</div><div class="track-artist">${escapeHtml(t.artist || "")}</div></div>
        <span style="font-size:18px;color:var(--text-faint);">✕</span>`;
      row.addEventListener("click", () => {
        Store.removeTrackFromPlaylist(currentPlaylistId, t.id);
        renderEditPlaylistList();
        renderLibrary();
      });
      list.appendChild(row);
    });
  }
  document.getElementById("edit-playlist-back-btn").addEventListener("click", () => { goBack(); openPlaylist(currentPlaylistId, true); });

  // ============================================================
  // PROFILE
  // ============================================================
  function renderProfileAvatarInto(elId) {
    const el = document.getElementById(elId);
    if (!el) return;
    const custom = Store.getAccountAvatar();
    if (custom) {
      setCoverBackgroundImage(el, custom);
    } else {
      const img = el.querySelector("img");
      if (img) img.remove();
      el.style.background = "";
    }
  }
  async function changeAccountAvatar() {
    const dataUrl = await pickAvatarImage();
    if (!dataUrl) return;
    Store.setAccountAvatar(dataUrl);
    renderProfile();
    renderAccountScreen();
  }
  document.getElementById("account-avatar-edit-btn").addEventListener("click", changeAccountAvatar);

  function renderProfile() {
    const nameEl = document.getElementById("profile-name");
    const initialEl = document.getElementById("profile-initial");
    if (tgUser) {
      const displayName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") || tgUser.username || "Гость";
      nameEl.textContent = Store.getAccountName() || displayName;
      initialEl.textContent = displayName.trim().charAt(0).toUpperCase() || "Н";
    } else {
      nameEl.textContent = Store.getAccountName() || "Гость";
      initialEl.textContent = "Н";
    }
    renderProfileAvatarInto("profile-avatar-btn");
  }
  document.getElementById("menu-account").addEventListener("click", () => showScreen("account"));
  document.getElementById("menu-sound").addEventListener("click", () => showScreen("sound"));
  document.getElementById("menu-notifications").addEventListener("click", () => showScreen("notifications"));
  document.getElementById("menu-about").addEventListener("click", () => showScreen("about"));
  document.getElementById("menu-logout").addEventListener("click", () => showToast("Выход недоступен — вход через Telegram выполняется автоматически"));

  function updateNotifBadge() {
    const badge = document.getElementById("profile-notif-badge");
    if (state.notifUnread > 0) { badge.style.display = "flex"; badge.textContent = String(state.notifUnread); }
    else badge.style.display = "none";
  }
  updateNotifBadge();

  // ============================================================
  // ACCOUNT (real: name/avatar from Telegram. Premium, sessions and
  // stats are UI-only placeholders — no billing/backend wired yet.)
  // ============================================================
  const PLAN_BENEFITS = ["Без рекламы между треками", "Оффлайн-скачивание треков", "Качество звука до 320 kbps", "Безлимитные пропуски треков"];
  function displayName() {
    if (Store.getAccountName()) return Store.getAccountName();
    if (tgUser) return [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") || tgUser.username || "Гость";
    return "Гость";
  }
  function renderAccountScreen() {
    const name = displayName();
    document.getElementById("account-name").textContent = name;
    document.getElementById("account-initial").textContent = name.trim().charAt(0).toUpperCase() || "Н";
    renderProfileAvatarInto("account-avatar");
    document.getElementById("account-plan-benefits").innerHTML = PLAN_BENEFITS.map((b) => `<li>${escapeHtml(b)}</li>`).join("");
    document.getElementById("account-sessions-count").textContent = "1";
    setSwitch("toggle-activity", Store.getSetting("activityVisible"));
    setSwitch("toggle-public-playlists", Store.getSetting("publicPlaylists"));
  }
  function setSwitch(id, on) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("on", !!on);
  }
  document.getElementById("account-back-btn").addEventListener("click", goBack);
  document.getElementById("account-upgrade-btn").addEventListener("click", () => showToast("Оформление Premium скоро появится"));
  document.getElementById("account-invite-btn").addEventListener("click", () => showToast("Ссылка-приглашение скопирована"));
  document.getElementById("toggle-activity").addEventListener("click", () => {
    const on = !Store.getSetting("activityVisible");
    Store.setSetting("activityVisible", on);
    setSwitch("toggle-activity", on);
  });
  document.getElementById("toggle-public-playlists").addEventListener("click", () => {
    const on = !Store.getSetting("publicPlaylists");
    Store.setSetting("publicPlaylists", on);
    setSwitch("toggle-public-playlists", on);
  });
  document.getElementById("account-name-row").addEventListener("click", () => {
    document.getElementById("account-name-input").value = displayName();
    openOverlay("account-name-modal");
  });
  document.getElementById("account-name-cancel").addEventListener("click", () => closeOverlay("account-name-modal"));
  document.getElementById("account-name-save").addEventListener("click", () => {
    const val = document.getElementById("account-name-input").value.trim();
    if (!val) return;
    Store.setAccountName(val);
    closeOverlay("account-name-modal");
    renderAccountScreen();
    renderProfile();
    showToast("Имя изменено");
  });

  // ============================================================
  // SOUND & DOWNLOADS (quality switching / real downloads are
  // UI-only placeholders — no backend audio-quality selection yet)
  // ============================================================
  function renderSoundScreen() {
    setSwitch("toggle-normalize", Store.getSetting("normalize"));
    setSwitch("toggle-wifi-only", Store.getSetting("wifiOnlyDownloads"));
    const crossfade = Store.getSetting("crossfade") || 0;
    document.getElementById("crossfade-slider").value = crossfade;
    document.getElementById("crossfade-value").textContent = crossfade === 0 ? "Выключен" : `${crossfade} сек`;
  }
  document.getElementById("sound-back-btn").addEventListener("click", goBack);
  document.getElementById("toggle-normalize").addEventListener("click", () => {
    const on = !Store.getSetting("normalize");
    Store.setSetting("normalize", on);
    setSwitch("toggle-normalize", on);
  });
  document.getElementById("toggle-wifi-only").addEventListener("click", () => {
    const on = !Store.getSetting("wifiOnlyDownloads");
    Store.setSetting("wifiOnlyDownloads", on);
    setSwitch("toggle-wifi-only", on);
  });
  document.getElementById("crossfade-slider").addEventListener("input", (e) => {
    const val = parseInt(e.target.value, 10) || 0;
    Store.setSetting("crossfade", val);
    document.getElementById("crossfade-value").textContent = val === 0 ? "Выключен" : `${val} сек`;
  });

  // ============================================================
  // NOTIFICATIONS (local + cosmetic — no push backend yet)
  // ============================================================
  const NOTIF_ITEMS = [
    { title: "Добро пожаловать в Нотку!", sub: "Ищи треки и собирай свои плейлисты" },
    { title: "Совет: жми на ♡", sub: "Любимые треки появятся на главном экране" },
  ];
  const NOTIF_SETTINGS = [
    { key: "notifNews", label: "Новости Нотки" },
    { key: "notifNewMusic", label: "Новинки от любимых исполнителей" },
    { key: "notifPlaylistUpdates", label: "Обновления плейлистов" },
  ];
  function renderNotificationsScreen() {
    document.getElementById("notif-list").innerHTML = NOTIF_ITEMS.map((n) => `
      <div class="notif-item"><div class="notif-dot"></div>
        <div><div style="font-size:13.5px;font-weight:700;">${escapeHtml(n.title)}</div><div style="font-size:12.5px;color:var(--text-dim);margin-top:2px;">${escapeHtml(n.sub)}</div></div>
      </div>`).join("");
    document.getElementById("notif-settings-list").innerHTML = NOTIF_SETTINGS.map((s) => `
      <div class="settings-row"><div class="settings-label">${escapeHtml(s.label)}</div>
        <button class="switch-track tap ${Store.getSetting(s.key) ? "on" : ""}" data-key="${s.key}"><span class="switch-thumb"></span></button>
      </div>`).join("");
    document.querySelectorAll("#notif-settings-list .switch-track").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.key;
        const on = !Store.getSetting(key);
        Store.setSetting(key, on);
        btn.classList.toggle("on", on);
      });
    });
    state.notifUnread = 0;
    persist();
    updateNotifBadge();
  }
  document.getElementById("notifications-back-btn").addEventListener("click", goBack);

  // ============================================================
  // ABOUT
  // ============================================================
  document.getElementById("about-back-btn").addEventListener("click", goBack);

  // ============================================================
  // PLAYBACK
  // ============================================================
  const audio = document.getElementById("audio");
  let currentTrackId = null;
  let currentTrack = null;
  let currentQueue = [];
  let currentQueueIndex = -1;
  let mymixActive = false;
  let currentContextLabel = "Нотка";

  function updateMymixCardUI() {
    const card = document.getElementById("mymix-card");
    if (!card) return;
    const playing = mymixActive && currentTrack && !audio.paused;
    card.classList.toggle("playing", !!playing);
    const icon = document.getElementById("mymix-play-icon");
    if (icon) {
      icon.innerHTML = playing
        ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="#2B1B14"><rect x="6" y="5" width="4" height="14" rx="1.3"/><rect x="14" y="5" width="4" height="14" rx="1.3"/></svg>`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M8 5v14l11-7z" fill="#2B1B14"/></svg>`;
    }
  }

  function setMiniPlayerFor(track) {
    document.getElementById("mp-title").textContent = track.title || "Без названия";
    document.getElementById("mp-artist").textContent = track.artist || "Неизвестный исполнитель";
    const art = document.getElementById("mp-art");
    art.innerHTML = track.artwork ? `<img src="${escapeHtml(track.artwork)}" alt="">` : "";
    miniPlayer.hidden = false;
  }

  function setFullPlayerFor(track) {
    document.getElementById("player-title").textContent = track.title || "Без названия";
    document.getElementById("player-artist").textContent = track.artist || "Неизвестный исполнитель";
    const art = document.getElementById("player-art");
    art.innerHTML = track.artwork
      ? `<img src="${escapeHtml(track.artwork)}" alt="">`
      : `<svg width="70" height="70" viewBox="0 0 24 24" fill="none" opacity="0.3"><path d="M9 18V5l10-2v13" stroke="#2B1B14" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6.5" cy="18" r="2.6" stroke="#2B1B14" stroke-width="1.4"/><circle cx="16.5" cy="16" r="2.6" stroke="#2B1B14" stroke-width="1.4"/></svg>`;
    document.getElementById("player-fav-icon").outerHTML = heartSvgLarge(Store.isFavorite(track.id));
  }

  function heartSvgLarge(active) {
    if (active) {
      return `<svg width="23" height="23" viewBox="0 0 24 24" fill="#FF7A2E" id="player-fav-icon"><path d="M12 20s-7-4.35-9.5-8.8C.8 7.4 2.6 4 6 4c2 0 3.4 1.1 4 2.2C10.6 5.1 12 4 14 4c3.4 0 5.2 3.4 3.5 7.2C15 15.65 12 20 12 20Z"/></svg>`;
    }
    return `<svg width="23" height="23" viewBox="0 0 24 24" fill="none" id="player-fav-icon"><path d="M12 20s-7-4.35-9.5-8.8C.8 7.4 2.6 4 6 4c2 0 3.4 1.1 4 2.2C10.6 5.1 12 4 14 4c3.4 0 5.2 3.4 3.5 7.2C15 15.65 12 20 12 20Z" stroke="#FF7A2E" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
  }

  function setPlayIcon(playing) {
    const mp = document.getElementById("mp-play-icon");
    const pp = document.getElementById("player-play-icon");
    if (playing) {
      mp.outerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="#2B1B14" id="mp-play-icon"><rect x="6" y="5" width="4" height="14" rx="1.3"/><rect x="14" y="5" width="4" height="14" rx="1.3"/></svg>`;
      pp.outerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="#2B1B14" id="player-play-icon"><rect x="6" y="5" width="4" height="14" rx="1.3"/><rect x="14" y="5" width="4" height="14" rx="1.3"/></svg>`;
    } else {
      mp.outerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="#2B1B14" id="mp-play-icon"><path d="M8 5v14l11-7z"/></svg>`;
      pp.outerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="#2B1B14" id="player-play-icon"><path d="M8 5v14l11-7z"/></svg>`;
    }
  }

  async function playTrack(track, queue, opts) {
    opts = opts || {};
    currentTrackId = track.id;
    currentTrack = track;
    currentQueue = queue && queue.length ? queue : [track];
    currentQueueIndex = currentQueue.findIndex((t) => t.id === track.id);
    mymixActive = !!opts.mymix;
    // Where this track is playing "from" — shown in the full-player header
    // ("Мой микс" / an album or playlist name / "Поиск"…). When neither is
    // given (skipping to the next track in the same queue, say) we simply
    // keep showing whatever context was already on screen.
    if (opts.mymix) currentContextLabel = "Мой микс";
    else if (opts.context) currentContextLabel = opts.context;
    else if (track.album && currentQueue.length <= 1) currentContextLabel = track.album;
    document.getElementById("player-context").textContent = currentContextLabel;
    if (miniPlayer) miniPlayer.hidden = false;
    renderQueueSheet();

    document.querySelectorAll(".track-row").forEach((el) => {
      el.classList.toggle("playing", el.dataset.trackId === track.id);
    });

    setMiniPlayerFor(track);
    setFullPlayerFor(track);
    document.getElementById("player-time-current").textContent = "0:00";
    document.getElementById("player-time-total").textContent = formatDuration(track.duration) || "0:00";

    try {
      const url = `${API_BASE_URL}/resolve?source=${encodeURIComponent(track.source)}&id=${encodeURIComponent(track.sourceId)}`;
      const res = await fetch(url);
      if (!res.ok) {
        // Surface the backend's error code (e.g. TRACK_NOT_FOUND when the
        // track genuinely isn't in the official catalog, vs a generic
        // playback failure) so the toast below can be honest about which
        // one happened instead of always saying the same vague thing.
        let code = null;
        try {
          const body = await res.json();
          code = body && body.error && body.error.code;
        } catch (e) { /* body wasn't JSON — fall through with code=null */ }
        const err = new Error(`HTTP ${res.status}`);
        err.code = code;
        throw err;
      }
      const data = await res.json();
      if (!data.playback || data.playback.type !== "url" || !data.playback.url) {
        throw new Error("Playback not available");
      }
      // Play through our own backend instead of the raw resolved URL:
      // YouTube's direct links are tied to the IP that resolved them
      // (this computer), so a phone hitting them straight over the
      // internet gets cut off mid-stream. Proxying keeps every byte
      // request coming from the same computer/IP that resolved it.
      audio.src = `${API_BASE_URL}/stream?source=${encodeURIComponent(track.source)}&id=${encodeURIComponent(track.sourceId)}`;
      await audio.play();
      setPlayIcon(true);
      updateMymixCardUI();
    } catch (err) {
      console.error(err);
      setPlayIcon(false);
      mymixActive = false;
      updateMymixCardUI();
      showToast(err && err.code === "TRACK_NOT_FOUND" ? "Трек не найден в официальном каталоге" : "Не удалось включить трек");
    }
  }

  function togglePlayPause() {
    if (!audio.src) return;
    if (audio.paused) {
      audio.play().then(() => { setPlayIcon(true); updateMymixCardUI(); }).catch((e) => console.error(e));
    } else {
      audio.pause();
      setPlayIcon(false);
      updateMymixCardUI();
    }
  }

  function playAdjacent(delta) {
    if (!currentQueue.length || currentQueueIndex < 0) return;
    const nextIndex = currentQueueIndex + delta;
    if (nextIndex < 0 || nextIndex >= currentQueue.length) {
      showToast(delta > 0 ? "Это последний трек" : "Это первый трек");
      return;
    }
    playTrack(currentQueue[nextIndex], currentQueue);
  }

  document.getElementById("mp-play-btn").addEventListener("click", (e) => { e.stopPropagation(); togglePlayPause(); });
  document.getElementById("mini-player").addEventListener("click", () => { if (currentTrack) showScreen("player"); });
  document.getElementById("player-play-btn").addEventListener("click", togglePlayPause);
  document.getElementById("player-back-btn").addEventListener("click", goBack);
  document.getElementById("player-more-btn").addEventListener("click", () => { if (currentTrack) openTrackMenu(currentTrack); });
  document.getElementById("player-queue-btn").addEventListener("click", () => { renderQueueSheet(); openOverlay("queue-sheet"); });
  document.getElementById("queue-sheet-close").addEventListener("click", () => closeOverlay("queue-sheet"));
  document.getElementById("player-sleep-btn").addEventListener("click", () => openOverlay("sleep-timer-sheet"));
  document.getElementById("sleep-timer-close").addEventListener("click", () => closeOverlay("sleep-timer-sheet"));
  document.querySelectorAll("#sleep-timer-sheet [data-min]").forEach((btn) => {
    btn.addEventListener("click", () => { showToast(`Таймер сна на ${btn.dataset.min} мин — скоро`); closeOverlay("sleep-timer-sheet"); });
  });
  document.getElementById("player-cast-btn").addEventListener("click", () => openOverlay("cast-sheet"));
  document.getElementById("cast-sheet-close").addEventListener("click", () => closeOverlay("cast-sheet"));

  function renderQueueSheet() {
    const list = document.getElementById("queue-list");
    if (!list) return;
    if (!currentQueue.length) { list.innerHTML = `<div style="text-align:center;padding:16px;color:var(--text-dim);font-size:13px;">Очередь пуста</div>`; return; }
    list.innerHTML = currentQueue.map((t, i) => `
      <li class="track-row" style="cursor:pointer;${i === currentQueueIndex ? "opacity:1;" : "opacity:0.75;"}" data-idx="${i}">
        <div class="track-art sm"></div>
        <div class="track-meta"><div class="track-title" style="${i === currentQueueIndex ? "color:var(--accent);" : ""}">${escapeHtml(t.title || "")}</div><div class="track-artist">${escapeHtml(t.artist || "")}</div></div>
      </li>`).join("");
    list.querySelectorAll("[data-idx]").forEach((row) => {
      row.addEventListener("click", () => playTrack(currentQueue[parseInt(row.dataset.idx, 10)], currentQueue, { mymix: mymixActive }));
    });
  }

  // ============================================================
  // TRACK MENU SHEET (Поделиться / Добавить в плейлист / Перейти к исполнителю)
  // ============================================================
  let trackMenuTrack = null;
  function openTrackMenu(track) {
    trackMenuTrack = track;
    document.getElementById("menu-track-title").textContent = track.title || "";
    document.getElementById("menu-track-artist").textContent = track.artist || "";
    openOverlay("track-menu-sheet");
  }
  document.getElementById("menu-track-share").addEventListener("click", () => {
    closeOverlay("track-menu-sheet");
    document.getElementById("share-title").textContent = `Поделиться «${trackMenuTrack ? trackMenuTrack.title : ""}»`;
    openOverlay("share-modal");
  });
  document.getElementById("menu-track-addplaylist").addEventListener("click", () => {
    closeOverlay("track-menu-sheet");
    if (trackMenuTrack) addTrackToPlaylistFlow(trackMenuTrack);
  });
  document.getElementById("menu-track-artist-link").addEventListener("click", () => {
    closeOverlay("track-menu-sheet");
    if (trackMenuTrack) {
      openArtistScreen(trackMenuTrack.artist, currentQueue.length ? currentQueue : [trackMenuTrack], {
        artistId: trackMenuTrack.artistId,
        source: trackMenuTrack.source,
      });
    }
  });
  document.getElementById("menu-track-album-link").addEventListener("click", () => {
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
    document.getElementById("artist-name").textContent = name;
    setCoverEl(document.getElementById("artist-avatar"), null, gradients[name.length % gradients.length]);
    document.getElementById("artist-listeners").textContent = "Загрузка…";
    document.getElementById("artist-follow-label").textContent = Store.isArtistFollowed(name) ? "Вы подписаны" : "Подписаться";
    document.getElementById("artist-tracks").innerHTML = "";
    document.getElementById("artist-albums").innerHTML = "";
    document.getElementById("artist-singles").innerHTML = "";
    document.getElementById("artist-singles").hidden = true;
    document.getElementById("artist-singles-label").hidden = true;
  }

  function renderArtistAlbumShelf(elId, labelId, albums, source, emptyText) {
    const el = document.getElementById(elId);
    const label = document.getElementById(labelId);
    if (!albums || !albums.length) {
      if (emptyText) {
        el.hidden = false;
        if (label) label.hidden = false;
        el.innerHTML = `<div style="font-size:12.5px;color:var(--text-faint);padding:8px 0;">${emptyText}</div>`;
      } else {
        el.hidden = true;
        if (label) label.hidden = true;
        el.innerHTML = "";
      }
      return;
    }
    el.hidden = false;
    if (label) label.hidden = false;
    el.innerHTML = albums.map((a) => `
      <div class="artist-album-card tap" data-album-id="${escapeHtml(a.id)}">
        <div class="artist-album-cover" id="artist-album-cover-${escapeHtml(a.id)}"></div>
        <div class="artist-album-title">${escapeHtml(a.title)}</div>
        <div class="artist-album-year">${escapeHtml(a.year || "")}</div>
      </div>`).join("");
    albums.forEach((a) => {
      setCoverEl(document.getElementById(`artist-album-cover-${a.id}`), a.cover, gradients[a.id.length % gradients.length]);
    });
    el.querySelectorAll("[data-album-id]").forEach((card) => {
      const album = albums.find((a) => a.id === card.dataset.albumId);
      card.addEventListener("click", () => openAlbumById(album.source || source, album.id, album.title, document.getElementById("artist-name").textContent));
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
    let tracks = (contextTracks || []).filter((t) => t.artist === name);
    currentArtistTracks = tracks;
    document.getElementById("artist-listeners").textContent = `${pluralTracks(tracks.length)} в Нотке`;
    const list = document.getElementById("artist-tracks");
    list.innerHTML = "";
    tracks.slice(0, 8).forEach((t) => list.appendChild(buildTrackRow(t, { queue: tracks, context: name })));
    renderArtistAlbumsRow([], null);
  }

  async function openArtistScreen(artistName, contextTracks, meta) {
    if (!artistName) return;
    meta = meta || {};
    renderArtistShell(artistName);
    showScreen("artist");

    if (meta.artistId && meta.source) {
      try {
        const url = `${API_BASE_URL}/artist?source=${encodeURIComponent(meta.source)}&id=${encodeURIComponent(meta.artistId)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const artist = await res.json();
        currentArtistTracks = artist.topTracks || [];
        document.getElementById("artist-name").textContent = artist.name || artistName;
        setCoverEl(document.getElementById("artist-avatar"), artist.photo, gradients[artistName.length % gradients.length]);
        document.getElementById("artist-listeners").textContent = artist.subscribers || `${pluralTracks(currentArtistTracks.length)} в Нотке`;
        const list = document.getElementById("artist-tracks");
        list.innerHTML = "";
        currentArtistTracks.slice(0, 8).forEach((t) => list.appendChild(buildTrackRow(t, { queue: currentArtistTracks, context: artist.name || artistName })));
        renderArtistAlbumsRow(artist.albums || [], meta.source);
        return;
      } catch (e) {
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
    renderArtistFallbackTracks(artistName, tracks);
  }
  document.getElementById("artist-back-btn").addEventListener("click", goBack);
  document.getElementById("artist-play-btn").addEventListener("click", () => {
    if (!currentArtistTracks.length) { showToast("Нет треков"); return; }
    playTrack(currentArtistTracks[0], currentArtistTracks, { context: document.getElementById("artist-name").textContent });
    showScreen("player");
  });
  document.getElementById("artist-follow-btn").addEventListener("click", () => {
    const name = document.getElementById("artist-name").textContent;
    const on = Store.toggleArtistFollow(name);
    document.getElementById("artist-follow-label").textContent = on ? "Вы подписаны" : "Подписаться";
    showToast(on ? `Вы подписаны на ${name}` : `Отписка от ${name}`);
  });

  let currentAlbumTracks = [];
  let currentAlbumMeta = { artist: "", artistId: null, source: null };

  function renderAlbumTrackList(tracks, contextTitle) {
    currentAlbumTracks = tracks;
    const list = document.getElementById("album-tracks");
    list.innerHTML = "";
    tracks.forEach((t) => list.appendChild(buildTrackRow(t, { queue: tracks, context: contextTitle })));
  }

  // Single-track pseudo-album view, used when a track carries no real
  // albumId (soundcloud / youtube_web fallback) — honest simplification
  // (see README).
  function openAlbumScreen(track) {
    currentAlbumMeta = { artist: track.artist || "", artistId: track.artistId || null, source: track.source || null };
    document.getElementById("album-title").textContent = track.title || "";
    document.getElementById("album-artist-link").textContent = track.artist || "";
    document.getElementById("album-meta").textContent = "Сингл · 1 трек";
    setCoverEl(document.getElementById("album-cover"), track.artwork, gradients[(track.id + "").length % gradients.length]);
    renderAlbumTrackList([track], track.title || "");
    showScreen("album");
  }

  // Real album view, loaded from the backend for youtube_music tracks.
  async function openAlbumById(source, albumId, fallbackTitle, fallbackArtist) {
    if (!source || !albumId) return;
    currentAlbumMeta = { artist: fallbackArtist || "", artistId: null, source };
    document.getElementById("album-title").textContent = fallbackTitle || "Альбом";
    document.getElementById("album-artist-link").textContent = fallbackArtist || "";
    document.getElementById("album-meta").textContent = "Загрузка…";
    setCoverEl(document.getElementById("album-cover"), null, gradients[(albumId + "").length % gradients.length]);
    renderAlbumTrackList([], fallbackTitle || "Альбом");
    showScreen("album");
    try {
      const url = `${API_BASE_URL}/album?source=${encodeURIComponent(source)}&id=${encodeURIComponent(albumId)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const album = await res.json();
      currentAlbumMeta = { artist: album.artist || "", artistId: album.artistId || null, source: album.source || source };
      document.getElementById("album-title").textContent = album.title || fallbackTitle || "Альбом";
      document.getElementById("album-artist-link").textContent = album.artist || fallbackArtist || "";
      document.getElementById("album-meta").textContent = `Альбом${album.year ? " · " + album.year : ""} · ${pluralTracks((album.tracks || []).length)}`;
      setCoverEl(document.getElementById("album-cover"), album.cover, gradients[(albumId + "").length % gradients.length]);
      renderAlbumTrackList(album.tracks || [], album.title || fallbackTitle || "Альбом");
    } catch (e) {
      console.error(e);
      showToast("Не удалось загрузить альбом");
      document.getElementById("album-meta").textContent = "Альбом";
    }
  }
  document.getElementById("album-back-btn").addEventListener("click", goBack);
  document.getElementById("album-play-btn").addEventListener("click", () => {
    if (!currentAlbumTracks.length) { showToast("Нет треков"); return; }
    playTrack(currentAlbumTracks[0], currentAlbumTracks, { context: document.getElementById("album-title").textContent });
    showScreen("player");
  });
  document.getElementById("album-artist-link").addEventListener("click", () => {
    if (currentAlbumMeta.artist) {
      openArtistScreen(currentAlbumMeta.artist, currentAlbumTracks, {
        artistId: currentAlbumMeta.artistId,
        source: currentAlbumMeta.source,
      });
    }
  });
  document.getElementById("player-prev-btn").addEventListener("click", () => playAdjacent(-1));
  document.getElementById("player-next-btn").addEventListener("click", () => playAdjacent(1));
  document.getElementById("player-fav-btn").addEventListener("click", () => {
    if (!currentTrack) return;
    const isFav = Store.toggleFavorite(currentTrack);
    document.getElementById("player-fav-icon").outerHTML = heartSvgLarge(isFav);
    refreshCurrentScreen();
  });

  const progressTrack = document.getElementById("player-progress-track");
  const progressFill = document.getElementById("player-progress-fill");
  const progressThumb = document.getElementById("player-progress-thumb");

  let isScrubbing = false;

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
  function effectiveDuration() {
    const meta = currentTrack && currentTrack.duration;
    const native = audio.duration;
    if (meta && native && isFinite(native)) return Math.min(meta, native);
    if (meta) return meta;
    return isFinite(native) ? native : 0;
  }

  function finishCurrentTrack() {
    audio.pause();
    setPlayIcon(false);
    progressFill.style.width = "0%";
    progressThumb.style.left = "0%";
    if (currentQueueIndex >= 0 && currentQueueIndex < currentQueue.length - 1) playAdjacent(1);
    else updateMymixCardUI();
  }

  audio.addEventListener("timeupdate", () => {
    const dur = effectiveDuration();
    if (!dur || isScrubbing) return;
    if (audio.currentTime >= dur - 0.35) {
      // Real content has ended even though the browser's own duration
      // estimate (if wrong) hasn't been reached yet — stop here instead
      // of leaving the track "playing" silently.
      finishCurrentTrack();
      return;
    }
    const pct = (audio.currentTime / dur) * 100;
    progressFill.style.width = `${pct}%`;
    progressThumb.style.left = `${pct}%`;
    document.getElementById("player-time-current").textContent = formatDuration(audio.currentTime);
    document.getElementById("player-time-total").textContent = formatDuration(dur);
  });
  audio.addEventListener("ended", finishCurrentTrack);

  // Scrubbing: works both as a tap-to-seek and a drag-to-seek (pointer
  // events cover mouse, touch and pen in one handler, which is what makes
  // an actual drag work — a plain "click" listener only ever fires once
  // per tap and never tracks movement).
  function pctFromEvent(e) {
    const rect = progressTrack.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  }
  function renderScrubPosition(pct) {
    progressFill.style.width = `${pct * 100}%`;
    progressThumb.style.left = `${pct * 100}%`;
    document.getElementById("player-time-current").textContent = formatDuration(pct * effectiveDuration());
  }
  progressTrack.addEventListener("pointerdown", (e) => {
    if (!effectiveDuration()) return;
    isScrubbing = true;
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
    const dur = effectiveDuration();
    if (dur) audio.currentTime = pctFromEvent(e) * dur;
  }
  progressTrack.addEventListener("pointerup", endScrub);
  progressTrack.addEventListener("pointercancel", () => { isScrubbing = false; });

  // ============================================================
  // SPLASH → ONBOARDING (first run only) → HOME
  // ============================================================
  const ONBOARDING_STEPS = [
    {
      icon: `<svg width="34" height="34" viewBox="0 0 24 24" fill="none"><path d="M9 18V5l10-2v13" stroke="#2B1B14" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6.5" cy="18" r="2.8" stroke="#2B1B14" stroke-width="1.6"/><circle cx="16.5" cy="16" r="2.8" stroke="#2B1B14" stroke-width="1.6"/></svg>`,
      title: "Слушай без границ",
      text: "Миллионы треков без лицензионных ограничений — прямо в Telegram, без установки отдельного приложения.",
    },
    {
      icon: `<svg width="34" height="34" viewBox="0 0 24 24" fill="none"><path d="M12 20s-7-4.35-9.5-8.8C.8 7.4 2.6 4 6 4c2 0 3.4 1.1 4 2.2C10.6 5.1 12 4 14 4c3.4 0 5.2 3.4 3.5 7.2C15 15.65 12 20 12 20Z" stroke="#2B1B14" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
      title: "Собирай своё",
      text: "Лайкай треки и создавай плейлисты — всё сохраняется на этом устройстве и всегда под рукой.",
    },
    {
      icon: `<svg width="34" height="34" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#2B1B14" stroke-width="1.6"/><path d="M9 8l7 4-7 4V8Z" fill="#2B1B14"/></svg>`,
      title: "Начнём?",
      text: "Найди свой первый трек — и мы соберём для тебя персональный «Мой микс».",
    },
  ];
  let onbStep = 0;
  function renderOnboardingStep() {
    const s = ONBOARDING_STEPS[onbStep];
    const content = document.getElementById("onb-content");
    document.getElementById("onb-icon").innerHTML = s.icon;
    document.getElementById("onb-title").textContent = s.title;
    document.getElementById("onb-text").textContent = s.text;
    document.getElementById("onb-next-btn").textContent = onbStep === ONBOARDING_STEPS.length - 1 ? "Начать" : "Далее";
    document.querySelectorAll("#onb-dots .onb-dot").forEach((dot, i) => dot.classList.toggle("active", i === onbStep));
    content.classList.remove("onboarding-anim");
    void content.offsetWidth;
    content.style.animation = "none";
    void content.offsetWidth;
    content.style.animation = "";
  }
  function finishOnboarding() {
    Store.markOnboardingSeen();
    showScreen("home", { replace: true });
  }
  document.getElementById("onb-next-btn").addEventListener("click", () => {
    if (onbStep < ONBOARDING_STEPS.length - 1) { onbStep++; renderOnboardingStep(); }
    else finishOnboarding();
  });
  document.getElementById("onb-skip-btn").addEventListener("click", finishOnboarding);

  function boot() {
    showScreen("splash", { replace: true });
    setTimeout(() => {
      if (Store.isOnboardingSeen()) {
        showScreen("home", { replace: true });
      } else {
        onbStep = 0;
        renderOnboardingStep();
        showScreen("onboarding", { replace: true });
      }
    }, 1100);
  }
  boot();
})();
