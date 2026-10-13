// ============================================================
// Screens, navigation, dock
// ============================================================
var screens = {
  splash: $("screen-splash"),
  auth: $("screen-auth"),
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
var bottomNav = $("bottom-nav");
var miniPlayer = $("mini-player");
var TAB_SCREENS = new Set(["home", "search", "library"]);
var NO_MINI_SCREENS = new Set(["player", "onboarding", "splash", "plus", "auth"]);

// Each step is { name, params }. Artist and album screens are single
// DOM nodes reused for every artist/album, so going back has to know
// which one that step was showing and bring it back.
var navStack = [{ name: "home", params: null }];
var currentScreen = "home";
var shownParams = {};
var REOPENERS = {
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
var DESKTOP_MIN_WIDTH = 900;
var desktopQuery = window.matchMedia ? window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH}px)`) : null;
var isDesktop = () => !!desktopQuery && desktopQuery.matches;
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
  document.body.classList.toggle("no-tabbar", !showTabs);
  let dock = 0;
  if (desk) dock = showMini ? 108 : 0;
  else if (showTabs && showMini) dock = 160;
  else if (showTabs) dock = 84;
  else if (showMini) dock = 86;
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

