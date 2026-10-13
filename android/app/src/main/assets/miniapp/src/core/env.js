var API_BASE_URL = (() => {
  if (window.NotkaAndroid && window.NotkaAndroid.getApiBaseUrl) {
    return window.NotkaAndroid.getApiBaseUrl();
  }
  if (window.location.protocol === "file:") {
    return "https://94-156-179-229.sslip.io";
  }
  if (window.NOTKA_CONFIG && window.NOTKA_CONFIG.API_BASE_URL !== undefined && window.NOTKA_CONFIG.API_BASE_URL !== "") {
    return window.NOTKA_CONFIG.API_BASE_URL;
  }
  return "";
})();
var STORAGE_KEY = "notka_state_v2";
var playerCassette = document.querySelector(".player-art-wrap .cassette");
var BG_COLOR = "#1A0B16";

// ============================================================
// Telegram WebApp integration (safe no-op outside Telegram)
// ============================================================
var tg = window.Telegram && window.Telegram.WebApp;
var tgAtLeast = (v) => !!(tg && tg.isVersionAtLeast && tg.isVersionAtLeast(v));
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
// On a computer Telegram opens a Mini App in a small window; ask for the
// whole screen (Bot API 8.0). Older clients just keep the window, which
// the layout handles too.
// On a computer the Mini App opens on the whole screen. That mode has no
// window buttons and covers the Windows taskbar, so it is made livable:
//  - the side panel has «свернуть в окно» and «закрыть», Esc and F11 too;
//  - when the window loses focus (Alt+Tab, the Win key, another program)
//    it steps back to a window by itself, so the taskbar and other
//    programs are reachable, and widens again when focus is back;
//  - leaving it by the button is remembered: then it stays a window.
var MOBILE_OR_WEB = ["android", "android_x", "ios", "weba", "webk"];
var onComputerClient = !!(tg && tg.platform && !MOBILE_OR_WEB.includes(tg.platform));
var canFullscreen = !!(onComputerClient && tgAtLeast("8.0") && tg.requestFullscreen && tg.exitFullscreen);
var FULLSCREEN_KEY = "notka_fullscreen_v2";
var wantFullscreen = true;
try { wantFullscreen = localStorage.getItem(FULLSCREEN_KEY) !== "0"; } catch (e) { /* storage may be blocked */ }
var steppedBack = false; // we left fullscreen only because focus went elsewhere
var fullscreenFailed = false;
var lastFullscreenAt = Date.now(); // the window itself blinks focus while it changes mode
var enterTries = 0;
function enterFullscreen() {
  if (!canFullscreen || fullscreenFailed || tg.isFullscreen) return;
  lastFullscreenAt = Date.now();
  enterTries++;
  try { tg.requestFullscreen(); } catch (e) { fullscreenFailed = true; }
}
function setFullscreen(on) {
  if (!canFullscreen) return;
  wantFullscreen = on;
  steppedBack = false;
  lastFullscreenAt = Date.now();
  try { localStorage.setItem(FULLSCREEN_KEY, on ? "1" : "0"); } catch (e) { /* ignore */ }
  try { on ? tg.requestFullscreen() : tg.exitFullscreen(); } catch (e) { /* ignore */ }
}
if (canFullscreen) {
  if (wantFullscreen) {
    enterFullscreen();
    // a client may not have been ready the first time, or wants a touch first
    setTimeout(() => { if (wantFullscreen && !tg.isFullscreen && enterTries < 3) enterFullscreen(); }, 1200);
    window.addEventListener("pointerdown", function once() {
      window.removeEventListener("pointerdown", once, true);
      if (wantFullscreen && !tg.isFullscreen && !steppedBack) enterFullscreen();
    }, true);
  }
  if (tg.onEvent) tg.onEvent("fullscreenFailed", () => { fullscreenFailed = true; });
  if (tg.onEvent) tg.onEvent("fullscreenChanged", () => { lastFullscreenAt = Date.now(); });
  let blurTimer = 0;
  window.addEventListener("blur", () => {
    clearTimeout(blurTimer);
    blurTimer = setTimeout(() => {
      if (document.hasFocus() || !wantFullscreen || !tg.isFullscreen) return;
      if (Date.now() - lastFullscreenAt < 2500) return; // that was the mode change, not the listener leaving
      steppedBack = true;
      lastFullscreenAt = Date.now();
      try { tg.exitFullscreen(); } catch (e) { /* ignore */ }
    }, 300);
  });
  window.addEventListener("focus", () => {
    clearTimeout(blurTimer);
    if (steppedBack && wantFullscreen) { steppedBack = false; enterFullscreen(); }
  });
} else if (onComputerClient && tg.requestFullscreen === undefined) {
  // an old Telegram on a computer: say so once instead of silently staying small
  window.addEventListener("load", () => {
    let told = false;
    try { told = localStorage.getItem("notka_fs_told") === "1"; localStorage.setItem("notka_fs_told", "1"); } catch (e) { /* ignore */ }
    if (!told) setTimeout(() => showToast("Полный экран работает в новом Telegram. Обнови Telegram Desktop"), 2500);
  });
}
// Окно Нотки на компьютере не в фокусе (игра, браузер, другая программа): через 4 секунды замораживаем
// фоновый свет и анимации, чтобы музыка в фоне не отбирала кадры у соседних программ. Вернулся мышью
// или фокусом: всё оживает сразу. Звук и ход трека не затрагиваются.
if (onComputerClient) {
  const root = document.documentElement;
  let idleTimer = 0;
  const setIdle = (on) => {
    if (root.classList.contains("app-idle") === on) return;
    root.classList.toggle("app-idle", on);
    document.dispatchEvent(new CustomEvent("notka:idle", { detail: { idle: on } }));
  };
  const arm = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => { if (!document.hasFocus()) setIdle(true); }, 4000); };
  window.addEventListener("blur", arm);
  window.addEventListener("focus", () => { clearTimeout(idleTimer); setIdle(false); });
  document.addEventListener("pointermove", () => { if (root.classList.contains("app-idle")) { setIdle(false); arm(); } }, { passive: true });
}
// who is listening: Telegram's own object, or authenticated mobile user, or launch params
var tgUser = (() => {
  try {
    const stored = localStorage.getItem("notka_auth_user");
    if (stored) return JSON.parse(stored);
  } catch (e) {}
  const direct = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
  if (direct && direct.id && direct.id !== 424242) return direct;
  try {
    const fromData = (raw) => { const u = new URLSearchParams(raw || "").get("user"); return u ? JSON.parse(u) : null; };
    const hash = new URLSearchParams(window.location.hash.slice(1)).get("tgWebAppData");
    return fromData(tg && tg.initData) || fromData(hash) || null;
  } catch (e) { return null; }
})();
var hasTgBack = !!(tg && tg.BackButton && tgAtLeast("6.1"));
if (hasTgBack) document.body.classList.add("tg-back");

function haptic(kind) {
  if (!tg || !tg.HapticFeedback || !tgAtLeast("6.1")) return;
  try {
    if (kind === "success" || kind === "error" || kind === "warning") tg.HapticFeedback.notificationOccurred(kind);
    else if (kind === "select") tg.HapticFeedback.selectionChanged();
    else tg.HapticFeedback.impactOccurred(kind || "light");
  } catch (e) { /* haptics are a nicety */ }
}

// слабые телефоны: сами замеряем плавность и при тормозах выключаем дорогое размытие фона.
// Режим хранится на устройстве: "auto" (по замеру), "lite" (включён вручную), "full" (выключен вручную).
function perfGuard() {
  const root = document.documentElement;
  const KEY = "notka_perf";
  const MODE_KEY = "notka_perf_mode";
  const read = (k) => { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } };
  const write = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage may be blocked */ } };
  let mode = read(MODE_KEY) || "auto";
  if (mode === "lite" || (mode === "auto" && read(KEY) === "lite")) root.classList.add("perf-lite");
  let probing = false;
  let tries = 0;
  function probe() {
    if (mode !== "auto" || probing || root.classList.contains("perf-lite") || tries >= 3) return;
    if (document.hidden) { setTimeout(probe, 4000); return; }
    probing = true;
    tries += 1;
    const dts = [];
    let last = 0;
    const tick = (t) => {
      // кадр после паузы вкладки (или свёрнутого окна) не считаем: он не про тормоза
      if (last && t - last < 250) dts.push(t - last);
      last = t;
      if (dts.length < 60) { requestAnimationFrame(tick); return; }
      probing = false;
      dts.sort((a, b) => a - b);
      // медиана дольше 26 мс: меньше ~38 кадров в секунду
      if (dts[dts.length >> 1] > 26) {
        root.classList.add("perf-lite");
        write(KEY, "lite");
        document.dispatchEvent(new CustomEvent("notka:perf", { detail: { lite: true, auto: true } }));
      } else if (tries < 3) {
        setTimeout(probe, 15000); // повторный замер уже под нагрузкой (плеер, список, свет)
      }
    };
    requestAnimationFrame(tick);
  }
  setTimeout(probe, 3000);
  probe.isLite = () => root.classList.contains("perf-lite");
  probe.mode = () => mode;
  probe.set = (lite) => {
    mode = lite ? "lite" : "full";
    write(MODE_KEY, mode);
    write(KEY, lite ? "lite" : "");
    root.classList.toggle("perf-lite", !!lite);
  };
  return probe;
}
var perfProbe = perfGuard();

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

