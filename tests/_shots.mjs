import { launch } from "./cdp.mjs";
const BASE = "http://127.0.0.1:8099";
const b = await launch({ dir: "C:/Users/leksik/Documents/Notka/tests/shots" });
const mk = (t, a, v) => ({ id: `youtube_music_${v}`, source: "youtube_music", sourceId: v, title: t, artist: a, duration: 240, artwork: `https://i.ytimg.com/vi/${v}/hqdefault.jpg` });
const tr = [mk("Yellow", "Coldplay", "yKNxeF4KMsY"), mk("Creep", "Radiohead", "XFkzRNyygfk")];
const st = { favorites: tr, onboardingSeenV2: true, recent: tr, playlists: [], settings: {}, accountName: "Лёша", listens: { seconds: 5400, plays: 30, tracks: {}, artists: {} } };
await b.goto(`${BASE}/health`);
await b.eval(`localStorage.clear(); localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify(st))}); true`);
await b.goto(`${BASE}/app/`);
await b.waitFor("document.body.dataset.screen !== 'splash'", 8000, "x");
await b.sleep(1500);
await b.click("#home-avatar-btn"); await b.sleep(1000);
await b.eval("document.getElementById('menu-plus').hidden=false; true");
await b.click("#menu-plus"); await b.sleep(2200); await b.shot("new-plus-1");
for (const [i, y] of [[2, 650], [3, 1300], [4, 1950]]) {
  await b.eval(`document.getElementById('screen-plus').scrollTo(0, ${y}); true`); await b.sleep(1500); await b.shot(`new-plus-${i}`);
}
console.log(b.errors.join("|").slice(0, 400) || "ok");
await b.close();
