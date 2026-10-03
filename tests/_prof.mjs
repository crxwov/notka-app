// Снимки профиля и его подэкранов. Нужен tests/serve_local.py.   node tests/_prof.mjs [префикс]
import { launch } from "./cdp.mjs";
const BASE = "http://127.0.0.1:8099";
const P = process.argv[2] || "prof";
const b = await launch({ dir: "C:/Users/leksik/Documents/Notka/tests/shots", port: 9370 });
const mk = (t, a, v) => ({ id: `youtube_music_${v}`, source: "youtube_music", sourceId: v, title: t, artist: a, duration: 240, artwork: `https://i.ytimg.com/vi/${v}/hqdefault.jpg` });
const tr = [mk("Yellow", "Coldplay", "yKNxeF4KMsY"), mk("Creep", "Radiohead", "XFkzRNyygfk")];
const st = { favorites: tr, onboardingSeenV2: true, recent: tr, playlists: [{ id: "p1", name: "Вечер", tracks: tr, createdAt: Date.now() }], settings: {}, accountName: "Лёша", listens: { seconds: 5400, plays: 30, tracks: { [tr[0].id]: { track: tr[0], plays: 12, seconds: 3000 }, [tr[1].id]: { track: tr[1], plays: 8, seconds: 2400 } }, artists: { Coldplay: { plays: 12, seconds: 3000 }, Radiohead: { plays: 8, seconds: 2400 } } } };
await b.goto(`${BASE}/health`);
await b.eval(`localStorage.clear(); localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify(st))}); true`);
await b.goto(`${BASE}/app/`);
await b.waitFor("!!document.body && document.body.dataset.screen !== 'splash'", 8000, "x");
await b.sleep(1500);
await b.click("#home-avatar-btn"); await b.sleep(1200); await b.shot(`${P}-1-profile`);
for (const [id, name] of [["menu-account", "2-account"], ["menu-stats", "3-stats"], ["menu-look", "4-look"], ["menu-sound", "5-sound"], ["menu-about", "6-about"]]) {
  await b.click("#" + id); await b.sleep(1300); await b.shot(`${P}-${name}`);
  await b.eval("document.querySelector('.screen:not([hidden]) .back-btn').click(); true"); await b.sleep(700);
}
await b.click("#home-avatar-btn"); await b.sleep(900);
await b.click("#menu-account"); await b.sleep(800);
await b.click("#account-reset-stats"); await b.sleep(600); await b.shot(`${P}-7-reset-modal`);
await b.click("#reset-stats-confirm"); await b.sleep(600);
console.log("после сброса:", await b.eval("JSON.stringify(JSON.parse(localStorage.getItem('notka_state_v2')).listens)"));
await b.eval("document.querySelector('.screen:not([hidden]) .back-btn').click(); true"); await b.sleep(900); await b.shot(`${P}-8-profile-empty`);
console.log(b.errors.filter((e) => !/Haptic/.test(e)).join("|").slice(0, 300) || "ok");
await b.close();
