// «Оформление»: the color of the light, its pattern, a pinned cover. Needs tests/serve_local.py running.
//   node tests/look.mjs
import { launch } from "./cdp.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "http://127.0.0.1:8099";
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "shots");
let failed = 0;
const check = (name, ok, extra = "") => { if (!ok) failed++; console.log(ok ? "PASS" : "FAIL", name, extra); };

const search = async (q) => (await (await fetch(`${BASE}/search?q=${encodeURIComponent(q)}`)).json()).results || [];
const kino = (await search("Группа крови Кино")).filter((t) => t.artist === "Кино" && t.artwork).slice(0, 2);
const other = (await search("Miyagi Minor")).filter((t) => t.artwork).slice(0, 1);
if (kino.length < 2 || !other.length) throw new Error("need seed tracks");
const seed = { favorites: [...kino, ...other], recent: [kino[0], other[0]], playlists: [], onboardingSeenV2: true };

const b = await launch({ dir });
const audio = "document.getElementById('audio')";
// the colors are registered properties, so the browser reports them as rgb(); bring both forms to #RRGGBB
const root = (name) => b.eval(`(() => { const v = getComputedStyle(document.documentElement).getPropertyValue(${JSON.stringify(name)}).trim(); const m = v.match(/[0-9]+/g); return v.startsWith("#") ? v.toUpperCase() : "#" + m.slice(0, 3).map((n) => (+n).toString(16).padStart(2, "0")).join("").toUpperCase(); })()`);
const saved = (key) => b.eval(`(JSON.parse(localStorage.getItem("notka_state_v2")).settings || {})[${JSON.stringify(key)}] ?? null`);
const openLook = async () => { await b.click("#home-avatar-btn"); await b.click("#menu-look"); await b.sleep(500); };
try {
  await b.goto(`${BASE}/app/`);
  await b.eval(`localStorage.clear(); localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify(seed))}); true`);
  await b.goto(`${BASE}/app/`);
  await b.waitFor("document.body.dataset.screen !== 'splash'", 8000, "leave splash");
  await openLook();
  check("the section opens from the profile", (await b.eval("document.body.dataset.screen")) === "look");
  check("four players on the stage, eight colors, covers to pick from, two patterns", await b.eval("document.querySelectorAll('#look-stage .look-slide').length === 4 && document.querySelectorAll('#look-colors .swatch').length === 8 && document.querySelectorAll('#look-covers .look-cover').length >= 2 && document.querySelectorAll('.pattern-opt').length === 2"));
  check("the stage wears the listener's own cover", await b.eval("document.querySelector('#look-stage .show-disc-art').style.backgroundImage.length > 10 && document.querySelector('#look-stage .js-title').textContent.length > 0"));
  await b.click('#look-stage .look-slide[data-theme="vinyl"]');
  await b.sleep(300);
  check("a player picked on the stage is on", (await b.eval("document.body.dataset.playerTheme")) === "vinyl" && await b.eval("document.querySelector('.look-slide.is-on').dataset.theme === 'vinyl'"));
  await b.click('#look-stage .look-slide[data-theme="standard"]');
  check("the standard look is marked", await b.eval("document.querySelector('.swatch.is-on').dataset.light === 'track' && document.querySelector('.pattern-opt.is-on').dataset.bg === 'light'"));
  await b.shot("look-1");

  // ---- without Плюс: seen at once, for a try, not saved ----
  await b.click('.swatch[data-light="preset:ocean"]');
  await b.sleep(300);
  check("a color is on at once", (await root("--c-warm")) === "#2FA8FF", await root("--c-warm"));
  check("…as a try: the bar is shown and nothing is saved", !(await b.eval("document.getElementById('look-try').hidden")) && (await saved("light")) === null);
  await b.click('.pattern-opt[data-bg="prism"]');
  await b.sleep(1300);
  check("a pattern is on at once, added to the same orb", (await b.eval("document.body.dataset.bg")) === "prism" && await b.eval("getComputedStyle(document.querySelector('.light-shape')).opacity > 0.9 && getComputedStyle(document.querySelector('.light-shape i')).animationName === 'shape-turn' && getComputedStyle(document.querySelector('.light-group')).opacity > 0.3"));
  await b.shot("look-2-ocean-prism");
  await b.eval("document.getElementById('screen-look').scrollTo(0, 99999); true");
  await b.sleep(1300);
  await b.shot("look-2b-bottom");

  // ---- with Плюс (switched on for preview): kept ----
  await b.click("#look-try-keep");
  await b.sleep(600);
  await b.eval("document.getElementById('plus-buy-btn').click(); true");
  await b.sleep(400);
  check("with Плюс what was tried is kept", (await saved("light")) === "preset:ocean" && (await saved("bgPattern")) === "prism" && (await root("--c-warm")) === "#2FA8FF");

  await b.click("#plus-back-btn");
  await b.sleep(500);
  await b.click('.pattern-opt[data-bg="light"]');
  await b.sleep(1300);
  check("the plain light is saved and the rays go", (await saved("bgPattern")) === "light" && await b.eval("getComputedStyle(document.querySelector('.light-shape')).opacity < 0.1"));
  await b.click('.pattern-opt[data-bg="prism"]');

  // ---- the colors of one cover, kept for any music ----
  await b.eval("document.querySelectorAll('#look-covers .look-cover')[0].click(); true");
  await b.waitFor(`(JSON.parse(localStorage.getItem("notka_state_v2")).settings || {}).light === "pinned"`, 15000, "cover pinned");
  await b.sleep(900);
  const pinnedWarm = await root("--c-warm");
  check("a cover gives its colors and shows under the light", pinnedWarm !== "#2FA8FF" && await b.eval("document.querySelector('.look-cover.is-on') !== null && document.getElementById('light-art').style.backgroundImage.length > 10"), pinnedWarm);
  await b.shot("look-3-pinned");

  await b.click("#look-back-btn");
  await b.click("#profile-back-btn");
  await b.sleep(400);
  await b.eval("document.querySelectorAll('#home-favorites-list .track-row .row-main')[2].click(); true");
  await b.waitFor(`(!${audio}.paused && ${audio}.currentTime > 0.4)`, 40000, "another track playing");
  await b.sleep(2500);
  check("another track plays, the pinned colors stay", (await root("--c-warm")) === pinnedWarm, `${await root("--c-warm")} vs ${pinnedWarm}`);

  await b.goto(`${BASE}/app/`);
  await b.waitFor("document.body.dataset.screen !== 'splash'", 8000, "leave splash");
  check("the look is there after reopening", (await root("--c-warm")) === pinnedWarm && (await b.eval("document.body.dataset.bg")) === "prism");

  // back to «Как у трека»
  await openLook();
  await b.click('.swatch[data-light="track"]');
  await b.sleep(300);
  check("«Как у трека» gives the light back to the music", (await saved("light")) === "track" && (await root("--c-warm")) !== pinnedWarm);
  check("no page errors", b.errors.length === 0, b.errors.join(" | ").slice(0, 400));
} catch (err) {
  failed++;
  console.log("FAIL", err.message);
  await b.shot("look-fail");
} finally {
  await b.close();
}
process.exit(failed ? 1 : 0);
