// ============================================================
// SEARCH
// ============================================================
var searchInput = $("search-input");
var searchClear = $("search-clear");
var SEARCH_STATES = ["search-state-empty", "search-state-loading", "search-state-empty-results", "search-state-error", "search-state-results"];
var stateResults = $("search-state-results");
var debounceTimer = null;
var lastSearchResults = null; // raw track results from backend, for the active query
var lastSearchArtists = null; // artists (with photos) found for the same query
var lastSearchQuery = "";
var searchTab = "all"; // all | tracks | artists | albums
var searchToken = 0;

// A spelling-proof key for comparing a typed name with an artist's name:
// «тревис скотт», «travis scott» and «trevis skot» all become «trvskt».
// Vowels, spaces and doubled letters are dropped, Cyrillic is
// transliterated, so a half-typed «тревис ск» is a prefix of the key.
var TRANSLIT = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "j", з: "z", и: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "z", ч: "c", ш: "s", щ: "s", ъ: "", ы: "i", ь: "", э: "e", ю: "u", я: "a" };
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
var tasteCache = null, tasteSig = "";
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
var SEARCH_HISTORY_MAX = 30;
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

  stateResults.innerHTML = "";
  const trackRows = (list) => list.map((t) => buildTrackRow(t, { queue: tracks, context: "Поиск" }));
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

