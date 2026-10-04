// Снимки экрана «Оформление» по прокрутке.   node tests/_looksnap.mjs [префикс]
import { launch } from "./cdp.mjs";
const BASE = "http://127.0.0.1:8099";
const P = process.argv[2] || "look";
const b = await launch({ dir: "C:/Users/leksik/Documents/Notka/tests/shots", port: 9371 });
const mk = (t, a, v) => ({ id: `youtube_music_${v}`, source: "youtube_music", sourceId: v, title: t, artist: a, duration: 240, artwork: `https://i.ytimg.com/vi/${v}/hqdefault.jpg` });
const tr = [mk("Yellow", "Coldplay", "yKNxeF4KMsY"), mk("Creep", "Radiohead", "XFkzRNyygfk")];
const st = { favorites: tr, onboardingSeenV2: true, recent: tr, playlists: [], settings: {}, accountName: "Лёша" };
await b.goto(`${BASE}/health`);
await b.eval(`localStorage.clear(); localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify(st))}); true`);
await b.goto(`${BASE}/app/`);
await b.waitFor("!!document.body && document.body.dataset.screen !== 'splash'", 8000, "x");
await b.sleep(1200);
await b.click("#home-avatar-btn"); await b.sleep(800);
await b.click("#menu-look"); await b.sleep(1500);
await b.eval("document.getElementById('screen-look').scrollTo(0, 99999); true"); await b.sleep(900);
for (const x of [0, 280, 600]) { await b.eval(`document.getElementById('look-patterns').scrollLeft = ${x}; true`); await b.sleep(500); await b.shot(`${P}-pat${x}`); }
for (let i = 0; i < 0; i++) {
  await b.eval(`document.getElementById('screen-look').scrollTo(0, ${i * 700}); true`);
  await b.sleep(1100);
  await b.shot(`${P}-${i}`);
}
console.log(b.errors.filter((e) => !/Haptic/.test(e)).join("|").slice(0, 300) || "ok");
await b.close();
