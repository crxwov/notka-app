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
var versionTaps = 0, versionTapAt = 0;
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
var plusAtmoBtn = $("plus-atmo-btn");
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
var tgInitData = tgInitRaw;
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
var FRIEND_TIERS = [[180, "veteran", "Друг Нотки с первых дней"], [30, "gold", "Друг Нотки"], [0, "new", "Друг Нотки"]];
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
  const tok = localStorage.getItem("notka_auth_token");
  if (!tgInitData && !tok) return;
  try {
    const headers = {};
    if (tgInitData) headers["X-Telegram-Init-Data"] = tgInitData;
    if (tok) headers["X-Auth-Token"] = tok;
    const res = await fetch(`${API_BASE_URL}/plus/status`, { headers });
    if (!res.ok) return;
    const data = await res.json();
    if (data.known) rememberPlus(data.until);
  } catch (e) { /* the last known answer stays */ }
}
function longDate(seconds) {
  return new Date(seconds * 1000).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}
var PLUS_PLANS = {
  year: { then: "749 ₽ в год" },
  quarter: { then: "229 ₽ за 3 месяца" },
  month: { then: "89 ₽ в месяц" },
};
var plusPlan = "year";
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
var plusStage = $("plus-stage");
var plusStageTimer = null;
var plusStageHoldUntil = 0;
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
var togglePlusPreview = () => {
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
var PLUS_COVERS_KEY = "notka_plus_covers_v1";
var plusCoverCache = {};
try { plusCoverCache = JSON.parse(localStorage.getItem(PLUS_COVERS_KEY) || "{}") || {}; } catch (e) { plusCoverCache = {}; }
var plusCoverPending = new Map();
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
var PLUS_DECK_QUERIES = [
  ["The Weeknd Blinding Lights", "The Weeknd"], ["Кино Группа крови", "Кино"], ["Dua Lipa Houdini", "Dua"],
  ["Coldplay Yellow", "Coldplay"], ["Imagine Dragons Believer", "Imagine"], ["Billie Eilish lovely", "Billie"], ["Nirvana Smells Like Teen Spirit", "Nirvana"],
  ["Linkin Park Numb", "Linkin"], ["Ed Sheeran Shape of You", "Ed"],
];
var cssUrl = (u) => `url("${String(u).replace(/"/g, "%22")}")`;

// the header: a canvas of horizontal mini players laid out evenly over the
// whole width and seen in perspective, as if they lay on a table
var plusDeckTracks = [];
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

