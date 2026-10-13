// ============================================================
// HOW НОТКА LOOKS — the player theme, the color of the light, the
// pattern of the background. The standard look is for everyone; the
// rest belongs to Плюс, and anyone can switch it on for a minute to see
// it on their own music.
// ============================================================
var PLAYER_THEMES = { standard: { name: "Стандарт" }, vinyl: { name: "Винил", plus: true }, cassette: { name: "Кассета", plus: true }, cd: { name: "Диск", plus: true } };
var LIGHT_PRESETS = {
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
var BG_PATTERNS = { light: "Свет", prism: "Призма", aurora: "Сияние", horizon: "Горизонт", lava: "Лава" };
// light: "track" | "preset:<id>" | "pinned" (the palette and cover are in lightPinned)
var LOOK_DEFAULTS = { playerTheme: "standard", light: "track", bgPattern: "light", atmo: "none" };
// «Атмосфера»: seasons and nature. Plus ones come with Нотка Плюс; the
// collectible ones (loot: true) are given for tasks, and until that is
// built they can be tried, or switched on in preview mode. Each has its
// own lights (palettes) and its own settings: the first value of every
// setting is its default.
var AMOUNT_CHOICES = [["low", "Мало"], ["mid", "Обычно"], ["high", "Много"], ["none", "Нет"]];
var ONOFF = [["on", "Есть"], ["off", "Нет"]];
var ATMOS = {
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
var atmoPalette = (id) => ATMOS[id].lights[atmoSettings(id).light][1];
// a light can be a reward of its own: it is shown once it is won
var lightOpen = (light) => !light[2] || ownsItem(light[2]);
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
var freeLight = (v) => typeof v === "string" && v.startsWith("preset:") && !!(LIGHT_PRESETS[v.slice(7)] || {}).free;
var lookAllowed = (key, value) => value === LOOK_DEFAULTS[key] || (key === "atmo" ? atmoOwned(value) : (key === "light" && freeLight(value)) || hasPlus());
var LOOK_TRY_MS = 60000;
var lookTried = {}; // what is switched on for a try, without Плюс
var lookTryTimer = null;

function lookKnown(key, value) {
  if (key === "playerTheme") return !!PLAYER_THEMES[value];
  if (key === "bgPattern") return !!BG_PATTERNS[value];
  if (key === "atmo") return value === "none" || !!ATMOS[value];
  return value === "track" || value === "pinned" || (typeof value === "string" && value.startsWith("preset:") && !!LIGHT_PRESETS[value.slice(7)]);
}
// Seasonal atmospheres (Halloween, New Year…) wear only their own event page and the try-on screen.
// Everywhere else the app keeps the brand look: rose and peach light on the plum ground.
var SEASONS_ONLY_ON_EVENT_PAGE = true;
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
var isMinimal = () => !!Store.getSetting("minimal");
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
var setPlayerTheme = (name) => setLook("playerTheme", name);

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
var atmoOptsFor = null;
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
var patternWatch = null;
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
var svgUri = (s) => "data:image/svg+xml," + encodeURIComponent(s);
var EVENT_ICONS = {
  atmo_halloween: svgUri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><defs><radialGradient id='m' cx='32%' cy='28%' r='85%'><stop offset='0' stop-color='#fffbea'/><stop offset='.55' stop-color='#ffe0ae'/><stop offset='1' stop-color='#ffb066'/></radialGradient></defs><path d='M31 5a19 19 0 1 0 13 29A16 16 0 0 1 31 5z' fill='url(#m)' stroke='#fff' stroke-opacity='.7' stroke-width='.8'/><path d='M14 14c3-5 8-8 13-8-5 2-9 6-10 11z' fill='#fff' opacity='.7'/><circle cx='37' cy='13' r='1.8' fill='#ffd9a0'/><circle cx='42' cy='21' r='1.3' fill='#ffd9a0'/></svg>"),
};
EVENT_ICONS.plus_3 = svgUri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><defs><linearGradient id='p' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#ffe7c4'/><stop offset='.55' stop-color='#ff9d5a'/><stop offset='1' stop-color='#ff5f86'/></linearGradient></defs><rect x='6' y='6' width='36' height='36' rx='11' fill='url(#p)' stroke='#fff' stroke-opacity='.7' stroke-width='.9'/><path d='M24 14v20M14 24h20' stroke='#fff' stroke-width='4.2' stroke-linecap='round'/><path d='M12 17c2-4 6-6 10-6-4 2-7 5-8 9z' fill='#fff' opacity='.55'/><text x='35' y='41' font-size='11' font-weight='800' fill='#fff' font-family='sans-serif' text-anchor='middle'>3</text></svg>");
EVENT_ICONS.plus_10 = svgUri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><defs><linearGradient id='p' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#fff1c9'/><stop offset='.5' stop-color='#ffb35c'/><stop offset='1' stop-color='#ff5f9a'/></linearGradient></defs><rect x='6' y='6' width='36' height='36' rx='11' fill='url(#p)' stroke='#fff' stroke-opacity='.8' stroke-width='.9'/><path d='M24 14v20M14 24h20' stroke='#fff' stroke-width='4.2' stroke-linecap='round'/><path d='M12 17c2-4 6-6 10-6-4 2-7 5-8 9z' fill='#fff' opacity='.55'/><text x='34' y='41' font-size='10' font-weight='800' fill='#fff' font-family='sans-serif' text-anchor='middle'>10</text></svg>");
var EVENT_ICON_FALLBACK = svgUri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><path d='M24 4l5.5 12.5 13.5 1.3-10.2 9 3 13.2L24 33l-11.8 7 3-13.2L5 17.8l13.5-1.3z' fill='#e9c46a'/></svg>");
var eventIcon = (item) => EVENT_ICONS[item] || EVENT_ICON_FALLBACK;

