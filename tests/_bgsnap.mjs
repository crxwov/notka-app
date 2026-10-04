// Главная с каждым узором света.   node tests/_bgsnap.mjs
import { launch } from "./cdp.mjs";
const BASE = "http://127.0.0.1:8099";
const b = await launch({ dir: "C:/Users/leksik/Documents/Notka/tests/shots", port: 9372 });
const mk = (t, a, v) => ({ id: `youtube_music_${v}`, source: "youtube_music", sourceId: v, title: t, artist: a, duration: 240, artwork: `https://i.ytimg.com/vi/${v}/hqdefault.jpg` });
const tr = [mk("Yellow", "Coldplay", "yKNxeF4KMsY"), mk("Creep", "Radiohead", "XFkzRNyygfk")];
await b.goto(`${BASE}/health`);
await b.eval(`localStorage.clear(); localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify({ favorites: tr, onboardingSeenV2: true, recent: tr, playlists: [], settings: {} }))}); true`);
await b.goto(`${BASE}/app/`);
await b.waitFor("!!document.body && document.body.dataset.screen !== 'splash'", 8000, "x");
await b.sleep(1500);
for (const bg of ["light", "prism", "aurora", "horizon", "lava"]) {
  await b.eval(`document.body.dataset.bg = ${JSON.stringify(bg)}; true`);
  await b.sleep(1800);
  await b.shot("bg-" + bg);
}
console.log(b.errors.filter((e) => !/Haptic/.test(e)).join("|").slice(0, 300) || "ok");
await b.close();
