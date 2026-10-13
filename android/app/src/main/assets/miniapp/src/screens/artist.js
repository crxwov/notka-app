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
var currentArtistTracks = [];

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

var currentArtistMeta = {};
var artistToken = 0;
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

var currentAlbumTracks = [];
var currentAlbumMeta = { artist: "", artistId: null, source: null };

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
var albumToken = 0;
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

