(() => {
  const API_BASE_URL =
    window.NOTKA_CONFIG && window.NOTKA_CONFIG.API_BASE_URL !== undefined
      ? window.NOTKA_CONFIG.API_BASE_URL
      : "http://localhost:8080";
  const STORAGE_KEY = "notka_state_v2";
  const BG_COLOR = "#0C0A12";

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
  const tgUser = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
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
  }
  applySafeAreas();
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
        notifUnread: typeof parsed.notifUnread === "number" ? Math.min(parsed.notifUnread, 0) : 0,
        followedMeta: parsed.followedMeta || {},
        listens: parsed.listens || { seconds: 0, plays: 0, tracks: {}, artists: {} },
        sharedImports: parsed.sharedImports || {},
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
  // Only what a row needs to be shown and played again.
  function slimTrack(t) {
    return { id: t.id, source: t.source, sourceId: t.sourceId, title: t.title, artist: t.artist, duration: t.duration, artwork: t.artwork, album: t.album, albumId: t.albumId, artistId: t.artistId };
  }
  // Listening stats are the one part of the state that grows on its own;
  // keep the most-played tracks and let the long tail go.
  function trimListens(keep) {
    // per-day records are only needed for «Месяц»
    const days = state.listens.days;
    if (days) {
      const oldest = new Date(Date.now() - 31 * 86400000).toISOString().slice(0, 10);
      Object.keys(days).forEach((key) => { if (key < oldest) delete days[key]; });
    }
    const entries = Object.entries(state.listens.tracks);
    if (entries.length <= keep) return;
    entries.sort((a, b) => b[1].plays - a[1].plays || b[1].seconds - a[1].seconds);
    state.listens.tracks = Object.fromEntries(entries.slice(0, keep));
  }
  let storageFullWarned = false;
  function persist() {
    trimListens(300);
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
    restorePlaylist(playlist, index) {
      if (state.playlists.some((p) => p.id === playlist.id)) return;
      state.playlists.splice(Math.min(index, state.playlists.length), 0, playlist);
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
  const BRAND_HUES = [14, 24, 34, 336, 348, 6, 318];
  function fallbackCover(seed) {
    const h = BRAND_HUES[hashString(seed) % BRAND_HUES.length];
    return `radial-gradient(circle at 34% 30%, hsl(${(h + 20) % 360} 100% 88%) 0 8%, hsl(${h} 92% 60%) 36%, hsl(${(h + 330) % 360} 72% 50%) 64%, hsl(262 66% 38%) 100%)`;
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
    let total = 0, chroma = 0, vivid = 0, gx = 0, gy = 0;
    const lights = [];
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      const [h, s, l] = rgbToHsl(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255);
      total++;
      lights.push([h, s, l]);
      if (s < 0.2 || l < 0.1 || l > 0.92) continue;
      chroma++;
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
      return {
        core: hsl(h, clamp(s, 0.6, 1), 0.86),
        warm: hsl(h, clamp(s * 1.1, 0.65, 0.98), clamp(l, 0.46, 0.58)),
        mid: hsl(h, clamp(s, 0.55, 0.9), 0.4),
        deep: hsl(h, 0.4, 0.2),
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

    const colors = bins
      .filter((b) => b.w > 0)
      .map((b) => ({ w: b.w, h: (Math.atan2(b.y, b.x) * 180 / Math.PI + 360) % 360, s: b.s / b.w, l: b.l / b.w }))
      .sort((a, b) => b.w - a.w);
    const picks = [colors[0]];
    for (const c of colors) {
      if (picks.length >= 3) break;
      if (c.w < colors[0].w * 0.08) break;
      if (picks.every((p) => hueDist(p.h, c.h) >= 28)) picks.push(c);
    }
    const [a, b = { ...a, h: (a.h + 24) % 360 }, c3] = picks;
    // the darkest chromatic tones of the cover become the deep layer
    const darks = lights.filter((p) => p[1] > 0.15 && p[2] < 0.45).sort((p, q) => p[2] - q[2]).slice(0, Math.max(6, Math.floor(total * 0.15)));
    let deepH = c3 ? c3.h : b.h, deepS = c3 ? c3.s : b.s;
    if (darks.length >= 6) {
      let dx = 0, dy = 0, ds = 0;
      darks.forEach((p) => { const r = (p[0] * Math.PI) / 180; dx += Math.cos(r); dy += Math.sin(r); ds += p[1]; });
      deepH = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
      deepS = ds / darks.length;
    }
    return {
      core: hsl(a.h, clamp(a.s, 0.55, 1), 0.87),
      warm: hsl(a.h, clamp(a.s * 1.15, 0.45, 0.96), clamp(a.l, 0.5, 0.64)),
      mid: hsl(b.h, clamp(b.s * 1.1, 0.4, 0.92), clamp(b.l, 0.45, 0.6)),
      deep: hsl(deepH, clamp(deepS, 0.35, 0.85), 0.34),
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
    const on = currentScreen === "player" && document.body.classList.contains("is-playing") && !document.body.classList.contains("lyrics-open");
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

  function brandPaletteFor(seed) {
    const h = BRAND_HUES[hashString(seed) % BRAND_HUES.length];
    return { core: hsl(h, 1, 0.88), warm: hsl(h, 0.94, 0.6), mid: hsl((h + 34) % 360, 0.82, 0.56), deep: "#6D34E0" };
  }

  let artUrlShown = null;
  function showArtUnderLight(url) {
    if (!lightArt || url === artUrlShown) return;
    artUrlShown = url;
    document.body.classList.toggle("has-art", !!url);
    lightArt.classList.remove("is-shown");
    setTimeout(() => {
      if (artUrlShown !== url) return;
      lightArt.style.backgroundImage = url ? `url("${url.replace(/"/g, "%22")}")` : "";
      if (url) requestAnimationFrame(() => lightArt.classList.add("is-shown"));
    }, 450);
  }

  async function lightForTrack(track) {
    showArtUnderLight(track.artwork ? hiResArtwork(track.artwork) : null);
    let palette = await paletteFromArtwork(track.artwork);
    if (!palette && track.artwork && !paletteCache.has(track.artwork)) {
      await new Promise((r) => setTimeout(r, 1200));
      palette = await paletteFromArtwork(track.artwork); // one more try on a flaky network
    }
    if (!currentTrack || currentTrack.id !== track.id) return;
    applyPalette(palette || brandPaletteFor(track.id));
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
    stats: $("screen-stats"),
  };
  const bottomNav = $("bottom-nav");
  const miniPlayer = $("mini-player");
  const TAB_SCREENS = new Set(["home", "search", "library"]);
  const NO_MINI_SCREENS = new Set(["player", "onboarding", "splash"]);

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

  function updateDock() {
    const showTabs = TAB_SCREENS.has(currentScreen);
    const showMini = !!currentTrack && !NO_MINI_SCREENS.has(currentScreen);
    bottomNav.hidden = !showTabs;
    miniPlayer.hidden = !showMini;
    document.body.classList.toggle("no-tabbar", !showTabs);
    let dock = 0;
    if (showTabs && showMini) dock = 156;
    else if (showTabs) dock = 84;
    else if (showMini) dock = 82;
    document.documentElement.style.setProperty("--dock", `${dock}px`);
  }

  function showScreen(name, opts) {
    opts = opts || {};
    const prev = currentScreen;
    currentScreen = name;
    Object.entries(screens).forEach(([key, el]) => { if (el) el.hidden = key !== name; });
    document.body.dataset.screen = name;
    if (name === "home") renderHome();
    if (name === "library") renderLibrary();
    if (name === "favorites") renderFavoritesScreen();
    if (name === "profile") renderProfile();
    if (name === "account") renderAccountScreen();
    if (name === "sound") renderSoundScreen();
    if (name === "stats") renderStatsScreen();
    if (name === "playlist" && currentPlaylistId && opts.replace) openPlaylist(currentPlaylistId, true);
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
      activeEl.classList.remove("screen-anim");
      void activeEl.offsetWidth;
      activeEl.classList.add("screen-anim");
      if (prev !== name) activeEl.scrollTop = 0;
    }
    updateDock();
    syncBackButton();
    syncPrism();
  }

  function goBack() {
    navStack.pop();
    const prev = navStack[navStack.length - 1] || { name: "home", params: null };
    if (prev.params && REOPENERS[prev.name] && shownParams[prev.name] !== prev.params) {
      shownParams[prev.name] = prev.params;
      REOPENERS[prev.name](prev.params);
      return;
    }
    showScreen(prev.name, { replace: true });
  }

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.tab !== currentScreen) haptic("select");
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
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && openOverlays.length) closeOverlay(openOverlays[openOverlays.length - 1]);
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
      if (action !== "more") return;
      lpTimer = setTimeout(() => { lpFired = true; haptic("medium"); openTrackMenu(track); }, 480);
    });
    main.addEventListener("pointermove", (e) => {
      if (Math.abs(e.clientX - startX) > 8 || Math.abs(e.clientY - startY) > 8) cancelLp();
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((ev) => main.addEventListener(ev, cancelLp));
    main.addEventListener("contextmenu", (e) => e.preventDefault());
    main.addEventListener("click", (e) => {
      if (lpFired) { e.preventDefault(); lpFired = false; return; }
      if (opts.onMain) { opts.onMain(btnOf(li)); return; }
      playTrack(track, opts.queue || [track], { context: opts.context });
    });

    applyRowState(li);
    return li;
  }
  function btnOf(li) { return li.querySelector(".row-action"); }

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
      const res = await fetch(`${API_BASE_URL}/radio?source=${encodeURIComponent(track.source)}&id=${encodeURIComponent(track.sourceId)}&limit=${limit || 25}`);
      if (!res.ok) return [];
      return (await res.json()).results || [];
    } catch (e) { return []; }
  }
  function pickSeeds(pool, n) {
    const fresh = state.favorites.filter((t) => t.source === "youtube_music").slice(0, 2);
    const rest = shuffled(pool.filter((t) => !fresh.some((f) => f.id === t.id)));
    return [...fresh, ...rest].slice(0, n);
  }
  async function buildMix() {
    const known = knownTracks();
    const pool = [...known.values()].filter((t) => t.source === "youtube_music");
    if (!pool.length) return shuffled([...known.values()]);
    const lists = await Promise.all(pickSeeds(pool, 4).map((s) => fetchRadio(s, 25)));
    const seen = new Set();
    const mix = [];
    for (let i = 0; i < 25; i++) {
      for (const list of lists) {
        const t = list[i];
        if (!t || seen.has(t.id) || known.has(t.id)) continue;
        seen.add(t.id);
        mix.push(t);
      }
    }
    if (mix.length < 8) shuffled([...known.values()]).forEach((t) => { if (!seen.has(t.id)) { seen.add(t.id); mix.push(t); } });
    return mix.slice(0, 50);
  }
  let mixExtending = false;
  async function extendMixIfNeeded() {
    if (currentSource !== "mix" || mixExtending || !currentTrack) return;
    if (currentQueueIndex < currentQueue.length - 3) return;
    mixExtending = true;
    try {
      const known = knownTracks();
      const inQueue = new Set(currentQueue.map((t) => t.id));
      const more = (await fetchRadio(currentTrack, 25)).filter((t) => !inQueue.has(t.id) && !known.has(t.id));
      if (more.length && currentSource === "mix") {
        currentQueue.push(...more);
        originalQueue.push(...more);
        renderQueueSheet();
        prepareNextTrack();
      }
    } finally { mixExtending = false; }
  }
  async function startMymix(openPlayer) {
    const known = knownTracks();
    if (!known.size) { showToast("Отметь пару треков сердцем или собери плейлист — и микс подберёт похожее"); return; }
    const card = $("mymix-card");
    card.classList.add("is-building");
    let mix;
    try { mix = await buildMix(); } finally { card.classList.remove("is-building"); }
    if (!mix.length) { showToast("Не получилось собрать микс, попробуй ещё раз"); return; }
    shuffleOn = false;
    playTrack(mix[0], mix, { mymix: true, source: "mix" });
    if (openPlayer) showScreen("player");
  }
  $("mymix-open-btn").addEventListener("click", () => {
    if (mymixActive && currentTrack) showScreen("player");
    else startMymix(false);
  });
  $("mymix-play-btn").addEventListener("click", () => {
    if (mymixActive && currentTrack) togglePlayPause();
    else startMymix(false);
  });

  // ============================================================
  // SEARCH
  // ============================================================
  const searchInput = $("search-input");
  const searchClear = $("search-clear");
  const SEARCH_STATES = ["search-state-empty", "search-state-loading", "search-state-empty-results", "search-state-error", "search-state-results"];
  const stateResults = $("search-state-results");
  let debounceTimer = null;
  let lastSearchResults = null; // raw track results from backend, for the active query
  let searchTab = "all"; // all | tracks | artists | albums
  let searchToken = 0;

  function showSearchState(id) {
    SEARCH_STATES.forEach((sid) => { $(sid).hidden = sid !== id; });
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

  function artistRow(group, tracks) {
    return groupRow({
      title: group.name,
      sub: `Исполнитель · ${pluralTracks(group.tracks.length)}`,
      cover: null,
      seed: group.name,
      round: true,
      onClick: () => openArtistScreen(group.name, tracks, { artistId: group.artistId, source: group.source }),
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

  function renderFilteredResults() {
    if (!lastSearchResults) return;
    const tracks = lastSearchResults;
    if (!tracks.length) { showSearchState("search-state-empty-results"); return; }

    stateResults.innerHTML = "";
    const trackRows = (list) => list.map((t) => buildTrackRow(t, { queue: tracks, context: "Поиск" }));
    if (searchTab === "tracks") {
      stateResults.appendChild(resultsSection(null, trackRows(tracks)));
    } else if (searchTab === "artists") {
      stateResults.appendChild(resultsSection(null, groupByArtist(tracks).map((g) => artistRow(g, tracks))));
    } else if (searchTab === "albums") {
      stateResults.appendChild(resultsSection(null, groupByAlbum(tracks).map(albumRow)));
    } else {
      stateResults.appendChild(resultsSection("Треки", trackRows(tracks.slice(0, 8))));
      const artists = groupByArtist(tracks).slice(0, 3);
      if (artists.length) stateResults.appendChild(resultsSection("Исполнители", artists.map((g) => artistRow(g, tracks))));
      const albums = groupByAlbum(tracks).filter((a) => a.albumId).slice(0, 3);
      if (albums.length) stateResults.appendChild(resultsSection("Альбомы", albums.map(albumRow)));
      if (tracks.length > 8) stateResults.appendChild(resultsSection("Ещё треки", trackRows(tracks.slice(8))));
    }
    showSearchState("search-state-results");
  }

  async function runSearch(query) {
    const token = ++searchToken;
    if (!query.trim()) {
      document.body.classList.remove("search-loading");
      lastSearchResults = null;
      showSearchState("search-state-empty");
      return;
    }
    showSearchState("search-state-loading");
    document.body.classList.add("search-loading");
    try {
      const url = `${API_BASE_URL}/search?q=${encodeURIComponent(query)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
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
    debounceTimer = setTimeout(() => runSearch(searchInput.value), 350);
  });
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { clearTimeout(debounceTimer); runSearch(searchInput.value); searchInput.blur(); }
  });
  searchClear.addEventListener("click", () => {
    searchInput.value = "";
    searchClear.hidden = true;
    runSearch("");
    searchInput.focus();
  });
  $("search-retry-btn").addEventListener("click", () => runSearch(searchInput.value));

  // ============================================================
  // LIBRARY («Моё»)
  // ============================================================
  function renderLibrary() {
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
    $("profile-sub").textContent = tgUser && tgUser.username ? `@${tgUser.username}` : "Вход через Telegram";
    renderAvatarInto("profile-avatar-btn", "profile-initial");
  }
  $("profile-back-btn").addEventListener("click", goBack);
  $("menu-stats").addEventListener("click", () => showScreen("stats"));
  $("menu-account").addEventListener("click", () => showScreen("account"));
  $("menu-sound").addEventListener("click", () => showScreen("sound"));
  $("menu-about").addEventListener("click", () => showScreen("about"));

  // ============================================================
  // ACCOUNT (name/avatar from Telegram, local listening stats)
  // ============================================================
  function renderAccountScreen() {
    $("account-name").textContent = displayName();
    renderAvatarInto("account-avatar", "account-initial");
    const platforms = { ios: "iPhone", android: "Android", android_x: "Android", tdesktop: "Telegram Desktop", macos: "Mac", weba: "Telegram Web", webk: "Telegram Web" };
    $("account-sessions-count").textContent = (tg && platforms[tg.platform]) || "Браузер";
  }
  function setSwitch(id, on) {
    const el = $(id);
    if (el) el.setAttribute("aria-checked", on ? "true" : "false");
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
  function renderSoundScreen() {
    const crossfade = Store.getSetting("crossfade") || 0;
    $("crossfade-slider").value = crossfade;
    $("crossfade-value").textContent = crossfade === 0 ? "Выключен" : `${crossfade} сек`;
    $("crossfade-note").textContent = volumeWorks
      ? "Трек мягко затухает в конце и появляется в начале."
      : "На этом устройстве Telegram не даёт менять громкость — переход не сработает.";
  }
  $("sound-back-btn").addEventListener("click", goBack);
  $("crossfade-slider").addEventListener("input", (e) => {
    const val = parseInt(e.target.value, 10) || 0;
    Store.setSetting("crossfade", val);
    $("crossfade-value").textContent = val === 0 ? "Выключен" : `${val} сек`;
  });

  // ============================================================
  // ABOUT
  // ============================================================
  $("about-back-btn").addEventListener("click", goBack);

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
    const L = state.listens;
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
    const a = state.listens.artists[name] || {};
    if (a.artistId) return { artistId: a.artistId, source: a.source };
    const hit = Object.values(state.listens.tracks).find((x) => x.track.artist === name && x.track.artistId);
    return hit ? { artistId: hit.track.artistId, source: hit.track.source } : {};
  }
  function artistFace(name) {
    const a = state.listens.artists[name] || {};
    if (a.photo) return a.photo;
    if (state.followedMeta[name] && state.followedMeta[name].photo) return state.followedMeta[name].photo;
    const own = Object.values(state.listens.tracks).filter((x) => x.track.artist === name && x.track.artwork).sort((x, y) => y.seconds - x.seconds)[0];
    return own ? own.track.artwork : null;
  }
  const artistPhotoAsked = new Set();
  async function fetchArtistPhoto(name) {
    const a = state.listens.artists[name];
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

  // Each part of the screen comes in when it scrolls into view.
  let statsObserver = null;
  function revealStats() {
    const parts = Array.from($("stats-body").querySelectorAll("[data-reveal]"));
    parts.forEach((el) => el.classList.remove("is-seen"));
    if (statsObserver) statsObserver.disconnect();
    if (!("IntersectionObserver" in window)) { parts.forEach((el) => el.classList.add("is-seen")); return; }
    statsObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-seen");
        statsObserver.unobserve(entry.target);
      });
    }, { root: $("screen-stats"), threshold: 0.18 });
    // after a frame, so the "hidden" state is painted first and the move is seen
    requestAnimationFrame(() => requestAnimationFrame(() => parts.forEach((el) => statsObserver.observe(el))));
  }

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
      $("stats-lede").textContent = state.listens.plays
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
    const topTracks = S.tracks.slice(0, 5).map((x) => x.track);
    topTracks.forEach((t, i) => list.appendChild(buildTrackRow(t, { index: i + 1, queue: topTracks, context: "Статистика" })));

    const albumShelf = $("stats-top-albums");
    albumShelf.innerHTML = "";
    const albums = S.albums.slice(0, 8);
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
  // PLAYBACK
  // ============================================================
  const audio = $("audio");
  let currentTrackId = null;
  let currentTrack = null;
  let currentQueue = [];
  let originalQueue = [];
  let currentQueueIndex = -1;
  let mymixActive = false;
  let currentContextLabel = "Нотка";
  let isLoading = false;
  let isStarting = false; // between a tap and the first sound of that track
  let playToken = 0;
  let resolveAbort = null;
  let failStreak = 0;
  let shuffleOn = false;
  let currentSource = null; // "fav" | "pl:<id>" | "album:<title>" | "artist:<name>" | "mix"

  // A list's «Слушать» plays it in order; pressed again it pauses/resumes.
  function playOrToggle(source, tracks, context) {
    if (currentSource === source && currentTrack) {
      if (shuffleOn) { shuffleOn = false; startFrom(source, tracks, context, false); return; }
      togglePlayPause();
      return;
    }
    startFrom(source, tracks, context, false);
  }
  // «Вперемешку»: shuffled from a random track; pressed again it goes back
  // to the list's own order.
  function shuffleOrToggle(source, tracks, context) {
    if (currentSource === source && currentTrack && shuffleOn) {
      shuffleOn = false;
      startFrom(source, tracks, context, false);
      showToast("По порядку");
      return;
    }
    startFrom(source, tracks, context, true);
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
      ["album-play-btn", null, () => `album:${$("album-title").textContent}`],
      ["artist-play-btn", null, () => `artist:${$("artist-name").textContent}`],
    ].forEach(([playId, shuffleId, key]) => {
      const btn = $(playId);
      if (!btn) return;
      const current = !!currentTrack && currentSource === key();
      btn.classList.toggle("is-current", current);
      const label = current && !shuffleOn ? (audio.paused ? "Продолжить" : "Пауза") : "Слушать";
      btn.querySelector(".pill-label").textContent = label;
      btn.setAttribute("aria-label", label === "Слушать" ? "Слушать по порядку" : label);
      if (shuffleId) $(shuffleId).setAttribute("aria-pressed", current && shuffleOn ? "true" : "false");
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
      : state.favorites.length || state.playlists.length
        ? "Похожее на твои любимые треки и плейлисты"
        : "Отметь треки сердцем — и микс подберёт похожее";
    $("mymix-play-btn").setAttribute("aria-label", mymixActive && currentTrack && !audio.paused ? "Пауза" : "Включить «Мой микс»");
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
    syncPlayerFav();
  }
  function syncPlayerFav() {
    const on = !!currentTrack && Store.isFavorite(currentTrack.id);
    $("player-fav-btn").setAttribute("aria-pressed", on ? "true" : "false");
    $("player-fav-btn").setAttribute("aria-label", on ? "Убрать из любимого" : "В любимое");
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

  async function playTrack(track, queue, opts) {
    opts = opts || {};
    const token = ++playToken;
    if (resolveAbort) resolveAbort.abort();
    resolveAbort = typeof AbortController !== "undefined" ? new AbortController() : null;

    currentTrackId = track.id;
    currentTrack = track;
    if (!opts.keepQueue) {
      originalQueue = queue && queue.length ? queue.slice() : [track];
      currentQueue = shuffleOn ? withShuffledTail(originalQueue, track) : originalQueue.slice();
    }
    currentQueueIndex = currentQueue.findIndex((t) => t.id === track.id);
    if (!opts.keepQueue) {
      mymixActive = !!opts.mymix;
      currentSource = opts.source || null;
    }
    // Where this track is playing "from" — shown in the full-player header
    // ("Мой микс" / an album or playlist name / "Поиск"…). When neither is
    // given (skipping to the next track in the same queue, say) we simply
    // keep showing whatever context was already on screen.
    if (opts.mymix) currentContextLabel = "Мой микс";
    else if (opts.context) currentContextLabel = opts.context;
    else if (track.album && currentQueue.length <= 1) currentContextLabel = track.album;
    $("player-context").textContent = currentContextLabel === "Поиск" ? "Из поиска" : currentContextLabel;

    audio.pause();
    setPlaying(false);
    setLoading(true);
    isStarting = true;
    setMiniPlayerFor(track);
    setFullPlayerFor(track);
    setMediaSession(track);
    updateDock();
    renderQueueSheet();
    lightForTrack(track);
    loadLyrics();
    resetProgress(track);
    extendMixIfNeeded();
    haptic("light");

    try {
      // The backend downloads the track (or finds it already on disk) and
      // only then says "ready" — so a track that can't be played comes
      // back as an error with a reason, not as a silent player.
      const res = await fetch(`${API_BASE_URL}/prepare?${trackQuery(track)}`, resolveAbort ? { signal: resolveAbort.signal } : undefined);
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
      await audio.play();
      if (token !== playToken) return;
      failStreak = 0;
      isStarting = false;
      setLoading(false);
      setPlaying(true);
      prepareNextTrack();
    } catch (err) {
      if (token !== playToken || (err && err.name === "AbortError")) return;
      console.error(err);
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

  function trackQuery(track) {
    return `source=${encodeURIComponent(track.source)}&id=${encodeURIComponent(track.sourceId)}`;
  }

  // While a track plays, the backend gets the next one ready, so the
  // switch between tracks doesn't wait for a download.
  let preparedId = null;
  function prepareNextTrack() {
    const next = currentQueue[currentQueueIndex + 1];
    if (!next || next.id === preparedId) return;
    preparedId = next.id;
    fetch(`${API_BASE_URL}/prepare?${trackQuery(next)}`).catch(() => {});
  }

  function withShuffledTail(queue, current) {
    const rest = queue.filter((t) => t.id !== current.id);
    return [current, ...shuffled(rest)];
  }

  function togglePlayPause() {
    if (!audio.getAttribute("src")) {
      if (currentTrack && !isLoading) playTrack(currentTrack, currentQueue, { keepQueue: true });
      return;
    }
    haptic("light");
    if (audio.paused) audio.play().catch((e) => console.error(e));
    else audio.pause();
  }

  function playAdjacent(delta, opts) {
    opts = opts || {};
    if (!currentQueue.length || currentQueueIndex < 0) return;
    let nextIndex = currentQueueIndex + delta;
    if (nextIndex >= currentQueue.length && repeatMode === "all") nextIndex = 0;
    if (nextIndex < 0 && delta < 0 && audio.currentTime > 3) { audio.currentTime = 0; return; }
    if (nextIndex < 0 || nextIndex >= currentQueue.length) {
      if (!opts.auto) showToast(delta > 0 ? "Это последний трек" : "Это первый трек");
      return;
    }
    playTrack(currentQueue[nextIndex], currentQueue, { keepQueue: true });
  }

  audio.addEventListener("play", () => setPlaying(true));
  audio.addEventListener("pause", () => setPlaying(false));
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
    syncLyrics(true);
  }

  async function loadLyrics() {
    const track = currentTrack;
    if (!lyricsOpen || !track || lyricsTrackId === track.id) return;
    lyricsTrackId = track.id;
    if (lyricsCache.has(track.id)) { renderLyrics(lyricsCache.get(track.id)); return; }
    if (!track.title) { renderLyrics({ lines: [], synced: false }); return; }
    lyricsData = null;
    lyricsList.innerHTML = "";
    $("lyrics-note").textContent = "";
    $("lyrics-skeleton").hidden = false;
    lyricsBox.scrollTop = 0;
    let data = null;
    try {
      const q = `title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist || "")}`
        + (track.duration ? `&duration=${Math.round(track.duration)}` : "") + `&${trackQuery(track)}`;
      const res = await fetch(`${API_BASE_URL}/lyrics?${q}`);
      if (res.ok) data = await res.json();
    } catch (e) { /* shown as "couldn't load" below */ }
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

  function syncLyrics(jump) {
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
    }
    // don't pull the text away from someone who is scrolling it by hand
    if (!jump && Date.now() - lyricsTouchedAt < 3000) return;
    const top = i < 0 ? 0 : Math.max(0, items[i].offsetTop - lyricsBox.clientHeight * 0.3);
    lyricsBox.scrollTo({ top, behavior: jump ? "auto" : "smooth" });
  }

  function setLyricsOpen(on) {
    lyricsOpen = on;
    document.body.classList.toggle("lyrics-open", on);
    lyricsBox.inert = !on;
    $("player-lyrics-btn").setAttribute("aria-pressed", on ? "true" : "false");
    syncPrism();
    if (on) { loadLyrics(); syncLyrics(true); }
  }
  $("player-lyrics-btn").addEventListener("click", () => { haptic("light"); setLyricsOpen(!lyricsOpen); });
  ["touchstart", "wheel"].forEach((type) => lyricsBox.addEventListener(type, () => { lyricsTouchedAt = Date.now(); }, { passive: true }));
  lyricsList.addEventListener("click", (e) => {
    const li = e.target.closest(".lyrics-line");
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
    closeOverlay("track-menu-sheet");
    showToast(on ? "Добавлено в любимое" : "Убрано из любимого");
    syncPlayerFav();
    refreshCurrentScreen();
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

    if (meta.artistId && meta.source) {
      try {
        const url = `${API_BASE_URL}/artist?source=${encodeURIComponent(meta.source)}&id=${encodeURIComponent(meta.artistId)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const artist = await res.json();
        if (token !== artistToken) return; // another artist was opened meanwhile
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
  $("artist-play-btn").addEventListener("click", () => {
    if (!currentArtistTracks.length) { showToast("Нет треков"); return; }
    playOrToggle(`artist:${$("artist-name").textContent}`, currentArtistTracks, $("artist-name").textContent);
  });
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
    tracks.forEach((t, i) => list.appendChild(buildTrackRow(t, { index: i + 1, queue: tracks, context: contextTitle })));
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

  let isScrubbing = false;
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
    miniProgress.style.width = `${p}%`;
    progressTrack.setAttribute("aria-valuenow", String(Math.round(p)));
    progressTrack.setAttribute("aria-valuetext", formatDuration(seconds));
    $("player-time-current").textContent = formatDuration(seconds);
  }
  function resetProgress(track) {
    renderProgress(0, 0);
    $("player-time-total").textContent = formatDuration(track.duration) || "0:00";
  }

  function finishCurrentTrack() {
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
        L.seconds += d;
        statHeard += d;
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

  // «Плавный переход»: fade in at the start, fade out at the end
  const volumeWorks = (() => { try { const p = document.createElement("audio"); p.volume = 0.5; return Math.abs(p.volume - 0.5) < 0.01; } catch (e) { return false; } })();
  function applyFade(t, dur) {
    if (!volumeWorks) return;
    const f = Store.getSetting("crossfade") || 0;
    if (!f || !dur) { if (audio.volume !== 1) audio.volume = 1; return; }
    const v = Math.max(0, Math.min(1, t / f, (dur - t) / f));
    audio.volume = Math.max(0.02, v);
  }

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
    if ("mediaSession" in navigator && navigator.mediaSession.setPositionState && now - lastPositionSync > 4000) {
      lastPositionSync = now;
      try { navigator.mediaSession.setPositionState({ duration: dur, position: Math.min(audio.currentTime, dur), playbackRate: 1 }); } catch (e) { /* ignore */ }
    }
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
    };
  }
  async function openDeepLink() {
    const { t, p } = deepLinkTarget();
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
        if (viaLink) Store.markOnboardingSeen();
        if (Store.isOnboardingSeen()) showScreen("home", { replace: true });
        else showScreen("onboarding", { replace: true });
        openDeepLink();
      }, 450);
    });
  }
  boot();
})();
