// Главная в разных вариантах базовой палитры.   node tests/_palsheet.mjs
import { launch } from "./cdp.mjs";
const BASE = "http://127.0.0.1:8099";
const b = await launch({ dir: "C:/Users/leksik/Documents/Notka/tests/shots", port: 9375 });
const mk = (t, a, v) => ({ id: `youtube_music_${v}`, source: "youtube_music", sourceId: v, title: t, artist: a, duration: 240, artwork: `https://i.ytimg.com/vi/${v}/hqdefault.jpg` });
const tr = [mk("Yellow", "Coldplay", "yKNxeF4KMsY"), mk("Creep", "Radiohead", "XFkzRNyygfk")];
await b.goto(`${BASE}/health`);
await b.eval(`localStorage.clear(); localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify({ favorites: tr, onboardingSeenV2: true, recent: tr, playlists: [], settings: {} }))}); true`);
await b.goto(`${BASE}/app/`);
await b.waitFor("!!document.body && document.body.dataset.screen !== 'splash'", 8000, "x");
await b.sleep(1500);
const sets = {
  now: ["#FFE3B8", "#FF6A2E", "#E23C8C", "#6D34E0"],
  a: ["#FFEBDD", "#F2956F", "#C25A8E", "#3B2B7E"],
  b: ["#FFF1E4", "#FF9C7C", "#8E73F0", "#27226C"],
  c: ["#E8F3FF", "#7DB8F5", "#7B6CF0", "#1D2A6B"],
  d: ["#FFE9E3", "#E3786E", "#A64A78", "#35183E"],
  e: ["#E6FBF1", "#62C9B0", "#6C7BE6", "#1E2A62"],
};
for (const [k, [core, warm, mid, deep]] of Object.entries(sets)) {
  await b.eval(`(() => { const s = document.documentElement.style; s.setProperty("--c-core", ${JSON.stringify(core)}); s.setProperty("--c-warm", ${JSON.stringify(warm)}); s.setProperty("--c-mid", ${JSON.stringify(mid)}); s.setProperty("--c-deep", ${JSON.stringify(deep)}); return true; })()`);
  await b.sleep(2200);
  await b.shot("pal-" + k);
}
console.log(b.errors.filter((e) => !/Haptic/.test(e)).join("|").slice(0, 200) || "ok");
await b.close();
