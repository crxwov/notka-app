// ---- «Мой микс» is put together here (the rules are in mix.js); YouTube Music only says what plays nearby ----
var artistKeyOf = (name) => String(name || "").toLowerCase().split(/,|&| feat\.? | x /)[0].trim();
var sessionGood = []; // tracks of this session that were heard on: the next top-up grows from them
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
async function buildMix() {
  const known = knownTracks();
  const own = new Map(known);
  (state.recent || []).forEach((t) => { if (!own.has(t.id)) own.set(t.id, t); });
  const ownList = [...own.values()];
  const seedPool = ownList.filter((t) => t.source === "youtube_music");
  if (!seedPool.length || !window.NotkaMix) return shuffled([...known.values()]);
  const prof = mixProfile();
  const seeds = window.NotkaMix.pickSeeds(seedPool, (t) => 0.15 + prof.affinity(t.artist) + prof.trackWeight(t) + (prof.recentIds.has(t.id) ? 0.3 : 0), 5);
  const lists = await Promise.all(seeds.map((s) => fetchRadio(s, 30)));
  const seen = new Set();
  const adjacent = [];
  lists.forEach((list) => list.forEach((t) => { if (t && !seen.has(t.id) && !own.has(t.id)) { seen.add(t.id); adjacent.push(t); } }));
  const mix = window.NotkaMix.assemble(Object.assign({ familiar: ownList, adjacent, size: 40, familiarShare: 0.4 }, prof));
  const famIds = new Set(ownList.map((t) => t.id));
  track("mix_built", { v: 2, n: mix.length, fam: mix.filter((t) => famIds.has(t.id)).length, adj: adjacent.length, seeds: seeds.length });
  if (mix.length < 8) return shuffled([...known.values()]);
  return mix;
}
// Leaving a mix for something else keeps its place: coming back goes on
// with the same queue, from the same track and the same second. Kept per
// mix («мой микс», each mood), for a few days, in this device's storage.
var MIX_RESUME_KEY = "notka_mix_resume";
var MIX_RESUME_DAYS = 3;
var mixResume = {};
try { mixResume = JSON.parse(localStorage.getItem(MIX_RESUME_KEY) || "{}") || {}; } catch (e) { mixResume = {}; }
var lastMixSave = 0;
function saveMixResume() {
  if (!currentMixKey || !currentTrack || !currentQueue.length) return;
  lastMixSave = Date.now();
  mixResume[currentMixKey] = {
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
  if (!r || !r.queue || !r.queue.length || Date.now() - r.at > MIX_RESUME_DAYS * 86400000) return null;
  const track = r.queue.find((t) => t.id === r.trackId);
  return track ? { track, queue: r.queue, position: r.position || 0, context: r.context } : null;
}
function resumeMix(key, saved) {
  shuffleOn = false;
  playTrack(saved.track, saved.queue, { mymix: true, source: "mix", mixKey: key, context: saved.context || undefined, startAt: saved.position });
}

var mixExtending = false;
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
var MOODS = { energize: "Бодрое", chill: "Спокойное", focus: "Для работы", sad: "Грустное", party: "Вечеринка", sleep: "Для сна", workout: "Спорт", romance: "Романтика", ru_pop: "Русский поп", ru_rock: "Русский рок", ru_hiphop: "Русский хип-хоп" };
var FREE_MOODS = new Set(["energize", "chill", "focus", "ru_pop", "ru_rock", "ru_hiphop"]);
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
    ru_share: total >= 5 ? russian / total : null,
  };
}

var moodBuilding = false;
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
var moodCloud = $("mood-cloud");
var moodOrbs = Array.from(moodCloud.querySelectorAll(".mood-orb"));
var MOOD_START = [[0.2, 0.2], [0.55, 0.3], [0.84, 0.17], [0.2, 0.62], [0.53, 0.68], [0.84, 0.56], [0.36, 0.92], [0.72, 0.9]];
var moodBodies = [];
var moodFrame = 0;
var moodHeld = null; // the light under the finger
var moodPointerAt = 0;

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
var releaseMoodOrb = (e) => {
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

