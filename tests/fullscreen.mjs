// Полный экран на компьютере: включается сам, при уходе фокуса сворачивается, при возврате раскрывается; кнопка выключает насовсем.
//   node tests/fullscreen.mjs   (нужен tests/serve_local.py)
import { launch } from "./cdp.mjs";
const BASE = "http://127.0.0.1:8099";
const b = await launch({ dir: "C:/Users/leksik/Documents/Notka/tests/shots", port: 9382, width: 1280, height: 800 });
await b.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
let bad = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "PASS " : "FAIL ") + name + " " + extra); if (!ok) bad++; };
await b.send("Network.enable");
await b.send("Network.setBlockedURLs", { urls: ["https://telegram.org/js/telegram-web-app.js"] });
await b.send("Page.addScriptToEvaluateOnNewDocument", { source: `
  window.__calls = [];
  window.__focus = true;
  document.hasFocus = () => window.__focus;
  const handlers = {};
  window.Telegram = { WebApp: {
    platform: "windows_x", version: "9.0", isFullscreen: false, viewportHeight: 800,
    initDataUnsafe: {}, safeAreaInset: {}, contentSafeAreaInset: {},
    isVersionAtLeast: () => true, ready() {}, expand() {}, setHeaderColor() {}, setBackgroundColor() {}, setBottomBarColor() {}, disableVerticalSwipes() {},
    onEvent(n, f) { (handlers[n] = handlers[n] || []).push(f); },
    requestFullscreen() {
      window.__calls.push("enter"); this.isFullscreen = true; (handlers.fullscreenChanged || []).forEach((f) => f());
      // like the real client: the window blinks focus while it changes mode (first time only)
      if (!window.__blinked) { window.__blinked = true; setTimeout(() => { window.__focus = false; window.dispatchEvent(new Event("blur")); setTimeout(() => { window.__focus = true; window.dispatchEvent(new Event("focus")); }, 500); }, 50); }
    },
    exitFullscreen() { window.__calls.push("exit"); this.isFullscreen = false; (handlers.fullscreenChanged || []).forEach((f) => f()); },
    close() { window.__calls.push("close"); },
    BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} }, HapticFeedback: { impactOccurred() {}, notificationOccurred() {}, selectionChanged() {} },
    enableClosingConfirmation() {}, disableClosingConfirmation() {},
  } };
` });
await b.goto(`${BASE}/health`);
await b.eval(`localStorage.clear(); localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify({ favorites: [], recent: [], playlists: [], onboardingSeenV2: true, settings: {} }))}); true`);
await b.goto(`${BASE}/app/`);
await b.waitFor("!!document.body && document.body.dataset.screen !== 'splash'", 8000, "x");
await b.sleep(800);
const calls = () => b.eval("JSON.stringify(window.__calls)");
check("it asks for fullscreen on its own", (await calls()) === '["enter"]', await calls());
// the window blinked focus on entering fullscreen (see the mock): that must not undo it
await b.sleep(1500);
check("a focus blink during the mode change is ignored", (await calls()) === '["enter"]', await calls());
await b.sleep(2600);
// the window loses focus
await b.eval("window.__focus = false; window.dispatchEvent(new Event('blur')); true");
await b.sleep(500);
check("it steps back to a window when focus leaves", (await calls()) === '["enter","exit"]', await calls());
await b.eval("window.__focus = true; window.dispatchEvent(new Event('focus')); true");
await b.sleep(300);
check("it widens again when focus is back", (await calls()) === '["enter","exit","enter"]', await calls());
// the user turns it off with the button
await b.click("#side-fs-btn");
await b.sleep(300);
check("the button leaves fullscreen", (await calls()) === '["enter","exit","enter","exit"]', await calls());
check("...and the choice is remembered", (await b.eval("localStorage.getItem('notka_fullscreen_v2')")) === "0");
await b.eval("window.__focus = false; window.dispatchEvent(new Event('blur')); true"); await b.sleep(400);
await b.eval("window.__focus = true; window.dispatchEvent(new Event('focus')); true"); await b.sleep(300);
check("after that it stays a window", (await calls()) === '["enter","exit","enter","exit"]', await calls());
console.log(bad ? "FAILED" : "ALL PASS");
process.exit(bad ? 1 : 0);
