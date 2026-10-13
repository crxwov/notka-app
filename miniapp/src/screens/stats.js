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
var artistPhotoAsked = new Set();
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

var statsPeriod = "all";
var statsToken = 0;
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

