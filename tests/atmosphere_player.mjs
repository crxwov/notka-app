// the player under three atmospheres. Needs tests/serve_local.py running and the internet.
import { launch } from "./cdp.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const BASE = "http://127.0.0.1:8099";
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "shots");
let failed = 0;
const check = (name, ok, extra = "") => { if (!ok) failed++; console.log(ok ? "PASS" : "FAIL", name, extra); };
const mk = (title, artist, vid, dur) => ({ id: `youtube_music_${vid}`, source: "youtube_music", sourceId: vid, title, artist, duration: dur, artwork: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` });
const tracks = [mk("Yellow", "Coldplay", "yKNxeF4KMsY", 269), mk("Creep", "Radiohead", "XFkzRNyygfk", 238)];
const state = (atmo) => ({ favorites: tracks, onboardingSeenV2: true, settings: { atmo }, listens: { seconds: 0, plays: 0, tracks: {}, artists: {} }, recent: tracks, playlists: [] });
const b = await launch({ dir });
try {
  for (const id of ["halloween", "winter", "newyear", "autumn"]) {
    await b.goto(`${BASE}/app/`);
    await b.eval(`localStorage.clear(); localStorage.setItem("notka_plus_local", "1"); localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify(state(id)))}); true`);
    await b.goto(`${BASE}/app/`);
    await b.waitFor("document.body.dataset.screen !== 'splash'", 8000, "leave splash");
    await b.click("#home-recent .shelf-card");
    await b.waitFor("!document.getElementById('audio').paused && document.getElementById('audio').currentTime > 1", 60000, "playing");
    await b.sleep(1500);
    await b.click("#mini-open-btn");
    await b.sleep(1800);
    check(`«${id}» player opens`, (await b.eval("document.body.dataset.screen")) === "player");
    await b.shot(`atmo-${id}-player`);
  }
  check("no page errors", b.errors.length === 0, b.errors.join(" | ").slice(0, 400));
} catch (e) { failed++; console.log("FAIL", e.message); await b.shot("atmo-player-fail"); } finally { await b.close(); }
process.exit(failed ? 1 : 0);
