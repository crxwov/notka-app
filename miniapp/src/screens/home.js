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
var revealObservers = {};
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
var TIME_STEPS = [[7, "Неделю назад"], [14, "Две недели назад"], [30, "Месяц назад"], [90, "Три месяца назад"]];
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
var longDay = (ms) => new Date(ms).toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
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
var timeDay = null;
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
var freshLoading = false;
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
