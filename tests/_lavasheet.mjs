// Главная с узором света на каждом цвете.   node tests/_lavasheet.mjs lava
import { launch } from "./cdp.mjs";
const BASE = "http://127.0.0.1:8099";
const bg = process.argv[2] || "lava";
const b = await launch({ dir: "C:/Users/leksik/Documents/Notka/tests/shots", port: 9374 });
const mk = (t, a, v) => ({ id: `youtube_music_${v}`, source: "youtube_music", sourceId: v, title: t, artist: a, duration: 240, artwork: `https://i.ytimg.com/vi/${v}/hqdefault.jpg` });
const tr = [mk("Yellow", "Coldplay", "yKNxeF4KMsY"), mk("Creep", "Radiohead", "XFkzRNyygfk")];
await b.goto(`${BASE}/health`);
await b.eval(`localStorage.clear(); localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify({ favorites: tr, onboardingSeenV2: true, recent: tr, playlists: [], settings: {} }))}); true`);
await b.goto(`${BASE}/app/`);
await b.waitFor("!!document.body && document.body.dataset.screen !== 'splash'", 8000, "x");
await b.sleep(1000);
await b.click("#home-avatar-btn"); await b.sleep(600);
await b.click("#menu-look"); await b.sleep(900);
await b.click(`.pattern-opt[data-bg="${bg}"]`);
for (const light of ["preset:sunset", "preset:ocean", "preset:forest", "preset:rose", "preset:neon", "preset:gold", "preset:mono"]) {
  await b.click(`.swatch[data-light="${light}"]`);
  await b.sleep(1200);
  await b.eval("document.body.dataset.screen = 'home'; document.getElementById('screen-look').style.visibility = 'hidden'; true");
  await b.sleep(2000);
  await b.shot(`sheet-${bg}-${light.slice(7)}`);
  await b.eval("document.body.dataset.screen = 'look'; document.getElementById('screen-look').style.visibility = ''; true");
}
console.log(b.errors.filter((e) => !/Haptic/.test(e)).join("|").slice(0, 300) || "ok");
await b.close();
