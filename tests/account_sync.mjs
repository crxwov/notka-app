// Один аккаунт — все устройства: два «устройства» (два чистых профиля браузера) под одним Telegram-аккаунтом.
//   NOTKA_DATA_DIR=<пустая папка> venv\Scripts\python tests\serve_local.py   (в другом окне)
//   node tests/account_sync.mjs
import { launch } from "./cdp.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
const BASE = "http://127.0.0.1:8099";
const env = fs.readFileSync("C:/Users/leksik/Documents/Notka/.env", "utf8");
const TOKEN = (env.match(/^BOT_TOKEN=(.+)$/m) || [])[1].trim();
const USER = { id: 777000 + Math.floor(Math.random() * 1000), first_name: "Тест" };
function initData() {
  const f = { auth_date: String(Math.floor(Date.now() / 1000)), query_id: "AAH" + Math.random().toString(36).slice(2, 8), user: JSON.stringify(USER) };
  const check = Object.keys(f).sort().map((k) => `${k}=${f[k]}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(TOKEN).digest();
  f.hash = crypto.createHmac("sha256", secret).update(check).digest("hex");
  return new URLSearchParams(f).toString();
}
const DATA = initData();
let bad = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "PASS " : "FAIL ") + name + " " + extra); if (!ok) bad++; };
const T = (n) => ({ id: `youtube_music:t${n}`, source: "youtube_music", sourceId: `t${n}`, title: `Трек ${n}`, artist: "Артист", duration: 200, artwork: null });

async function device(label, port, seed) {
  const b = await launch({ dir: "C:/Users/leksik/Documents/Notka/tests/shots", port, width: 1280, height: 800 });
  await b.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await b.send("Network.enable");
  await b.send("Network.setBlockedURLs", { urls: ["https://telegram.org/js/telegram-web-app.js"] });
  await b.send("Page.addScriptToEvaluateOnNewDocument", { source: `
    const h = {};
    window.Telegram = { WebApp: { platform: "tdesktop", version: "9.0", initData: ${JSON.stringify(DATA)}, initDataUnsafe: { user: ${JSON.stringify(USER)} },
      isVersionAtLeast: () => true, ready() {}, expand() {}, setHeaderColor() {}, setBackgroundColor() {}, setBottomBarColor() {}, disableVerticalSwipes() {},
      onEvent(n, f) { (h[n] = h[n] || []).push(f); }, safeAreaInset: {}, contentSafeAreaInset: {}, viewportHeight: 800,
      BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} }, HapticFeedback: { impactOccurred() {}, notificationOccurred() {}, selectionChanged() {} },
      enableClosingConfirmation() {}, disableClosingConfirmation() {}, close() {} } };
  ` });
  await b.goto(`${BASE}/health`);
  await b.eval(`localStorage.clear(); localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify(Object.assign({ playlists: [], recent: [], onboardingSeenV2: true, settings: {} }, seed)))}); true`);
  await b.goto(`${BASE}/app/`);
  await b.waitFor("!!document.body && document.body.dataset.screen !== 'splash'", 8000, label);
  return b;
}
const state = (b) => b.eval("JSON.parse(localStorage.getItem('notka_state_v2'))").then((x) => x);
const favIds = async (b) => (await state(b)).favorites.map((t) => t.id).sort();
const settle = (b, ms = 5000) => b.sleep(ms);

// device A: the phone, with its own favourites, a playlist and 10 minutes of listening
const A = await device("A", 9410, {
  favorites: [T(1), T(2)],
  playlists: [{ id: "pl_a", name: "С телефона", trackIds: ["youtube_music:t1"], tracksCache: { "youtube_music:t1": T(1) } }],
  listens: { seconds: 600, plays: 5, tracks: { "youtube_music:t1": { track: T(1), plays: 5, seconds: 600 } }, artists: { "Артист": { seconds: 600, plays: 5 } }, days: {} },
});
await settle(A, 6000);

// device B: the computer, joins the account with its own data
const B = await device("B", 9411, {
  favorites: [T(3)],
  playlists: [{ id: "pl_b", name: "С компьютера", trackIds: [], tracksCache: {} }],
  listens: { seconds: 120, plays: 1, tracks: { "youtube_music:t3": { track: T(3), plays: 1, seconds: 120 } }, artists: { "Артист": { seconds: 120, plays: 1 } }, days: {} },
});
await settle(B, 7000);
const bFavs = await favIds(B);
check("the computer got the phone's favourites and kept its own", bFavs.join() === "youtube_music:t1,youtube_music:t2,youtube_music:t3", bFavs.join());
const bState = await state(B);
check("the computer got the phone's playlist and kept its own", bState.playlists.map((p) => p.id).sort().join() === "pl_a,pl_b", bState.playlists.map((p) => p.id).join());
const bTotal = await B.eval("(() => { const s = JSON.parse(localStorage.getItem('notka_state_v2')); const r = s.remoteListens || {}; return (s.listens.seconds || 0) + (r.seconds || 0); })()");
check("the stats of the two devices add up (600 + 120)", Math.round(bTotal) === 720, String(bTotal));

// the phone catches up: it gets the computer's favourite and playlist
await A.eval("window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); true");
await A.eval("(async () => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); return true; })()");
await settle(A, 6000);
const aFavs = await favIds(A);
check("the phone got the computer's favourite", aFavs.join() === "youtube_music:t1,youtube_music:t2,youtube_music:t3", aFavs.join());
const aTotal = await A.eval("(() => { const s = JSON.parse(localStorage.getItem('notka_state_v2')); const r = s.remoteListens || {}; return (s.listens.seconds || 0) + (r.seconds || 0); })()");
check("the phone sees the same total stats", Math.round(aTotal) === 720, String(aTotal));

// a removal travels too (the newer change wins)
await B.eval("(() => { const s = JSON.parse(localStorage.getItem('notka_state_v2')); return true; })()");
await B.click('.tab[data-tab="library"]'); await B.sleep(500);
await B.click("#open-favorites-btn"); await B.sleep(600);
await B.eval("(() => { const row = [...document.querySelectorAll('#favorites-list .track-row')].find((r) => r.dataset.trackId === 'youtube_music:t2'); if (!row) return false; row.querySelector('.row-more').click(); return true; })()");
await B.sleep(500);
const unfav = await B.eval("(() => { const items = [...document.querySelectorAll('#track-menu-sheet button')]; const b = items.find((x) => /любим/i.test(x.textContent)); if (!b) return false; b.click(); return true; })()");
await B.sleep(500);
check("removed a favourite on the computer", unfav === true);
await settle(B, 15000); // the debounced push
await A.eval("(async () => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); return true; })()");
await settle(A, 6000);
const aFavs2 = await favIds(A);
check("the removal reached the phone", !aFavs2.includes("youtube_music:t2") && aFavs2.length === 2, aFavs2.join());

console.log(bad ? "FAILED" : "ALL PASS");
process.exit(bad ? 1 : 0);
