// A refused track must be retried, then the next one played, never left on «loading» (regression: «track is not a function» in playTrack). Needs tests/serve_local.py.
import { launch } from "./cdp.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const BASE = "http://127.0.0.1:8099";
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "shots");
const res = await (await fetch(`${BASE}/search?q=${encodeURIComponent("Кино")}`)).json();
const tracks = res.results.filter((t) => t.artwork).slice(0, 3);
const seed = { favorites: tracks, recent: [], playlists: [], onboardingSeenV2: true };
const b = await launch({ dir });
try {
  await b.goto(`${BASE}/app/`);
  await b.eval(`localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify(seed))}); true`);
  await b.goto(`${BASE}/app/`);
  await b.waitFor("document.body.dataset.screen !== 'splash'", 8000, "splash");
  // the first track is refused by the server, the rest are let through
  const bad = tracks[0].sourceId;
  await b.eval(`(() => { window.__prep = []; const real = window.fetch; window.fetch = (u, o) => {
    const s = String(u);
    if (s.includes('/prepare')) { window.__prep.push(s.slice(-60)); if (s.includes(${JSON.stringify(bad)})) return Promise.resolve(new Response(JSON.stringify({error:{code:'RESOLVE_FAILED'}}), {status: 502})); }
    return real(u, o); }; return true; })()`);
  await b.click("#home-favorites-list .track-row:nth-child(1) .row-main");
  await b.sleep(7000);
  console.log(await b.eval(`JSON.stringify({ prepares: window.__prep.length, loading: document.body.classList.contains('is-loading') || !!document.querySelector('.is-loading'), playing: !document.getElementById('audio').paused, t: document.getElementById('audio').currentTime, title: (document.getElementById('player-title')||{}).textContent })`));
} finally { console.log("errors", JSON.stringify(b.errors.slice(0, 4))); await b.close(); }
