// «Атмосфера»: seasonal and nature themes. Needs tests/serve_local.py running.
//   node tests/atmosphere.mjs
import { launch } from "./cdp.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "http://127.0.0.1:8099";
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "shots");
let failed = 0;
const check = (name, ok, extra = "") => { if (!ok) failed++; console.log(ok ? "PASS" : "FAIL", name, extra); };

const mk = (title, artist, vid, dur) => ({ id: `youtube_music_${vid}`, source: "youtube_music", sourceId: vid, title, artist, duration: dur, artwork: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` });
const tracks = [mk("Yellow", "Coldplay", "yKNxeF4KMsY", 269), mk("Creep", "Radiohead", "XFkzRNyygfk", 238), mk("Du Hast", "Rammstein", "W3q8Od5qJio", 234)];
const seedState = (settings) => ({ favorites: tracks.slice(0, 2), onboardingSeenV2: true, settings, listens: { seconds: 5400, plays: 12, tracks: {}, artists: {} }, recent: tracks, playlists: [{ id: "pl1", name: "Вечерний плейлист", trackIds: tracks.map((t) => t.id), tracksCache: Object.fromEntries(tracks.map((t) => [t.id, t])) }] });

const ids = ["autumn", "winter", "spring", "halloween", "newyear", "rain", "night"];
const b = await launch({ dir });
try {
  for (const id of ids) {
    await b.goto(`${BASE}/app/`);
    await b.eval(`localStorage.clear(); localStorage.setItem("notka_plus_local", "1"); localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify(seedState({ atmo: id })))}); true`);
    await b.goto(`${BASE}/app/`);
    await b.waitFor("document.body.dataset.screen !== 'splash'", 8000, "leave splash");
    await b.sleep(2600);
    check(`«${id}» is on`, (await b.eval("document.body.dataset.atmo")) === id && (await b.eval("document.body.classList.contains('has-atmo-air')")));
    check(`«${id}» has its weather canvases`, await b.eval("!!document.getElementById('atmo-back') && !!document.getElementById('atmo-front')"));
    await b.shot(`atmo-${id}-home`);
    await b.click('.tab[data-tab="library"]');
    await b.sleep(500);
    await b.click("#playlists-grid .playlist-card");
    await b.waitFor("document.body.dataset.screen === 'playlist'", 6000, "playlist");
    await b.sleep(1800);
    await b.shot(`atmo-${id}-playlist`);
  }
  // the picker
  await b.goto(`${BASE}/app/`);
  await b.eval(`localStorage.clear(); localStorage.setItem("notka_plus_local", "1"); localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify(seedState({})))}); true`);
  await b.goto(`${BASE}/app/`);
  await b.waitFor("document.body.dataset.screen !== 'splash'", 8000, "leave splash");
  await b.eval(`document.getElementById("menu-look").click(); true`);
  await b.sleep(1200);
  check("the picker offers the plain look and seven atmospheres", await b.eval("document.querySelectorAll('#atmo-stage .atmo-card').length === 8"));
  await b.click('#atmo-stage .atmo-card[data-atmo="winter"]');
  await b.sleep(900);
  check("choosing one switches it on and marks the card", (await b.eval("document.body.dataset.atmo")) === "winter" && await b.eval("document.querySelector('#atmo-stage .atmo-card.is-on').dataset.atmo === 'winter'"));
  await b.shot("atmo-picker");
  check("the chosen atmosphere shows its own settings", await b.eval("[...document.querySelectorAll('#atmo-opts .atmo-opt-t')].map((e) => e.textContent).join('|') === 'Свет|Снег|Сияние|Иней на панелях'"));
  await b.click('#atmo-opts .chip[data-setting="aurora"][data-v="off"]');
  await b.sleep(500);
  check("a setting is kept and the style sheet answers it", await b.eval("JSON.parse(localStorage.getItem('notka_state_v2')).settings.atmoOpts.winter.aurora === 'off' && document.body.dataset.atmoAurora === 'off'"));
  await b.click('#atmo-opts .chip[data-setting="light"][data-v="dawn"]');
  await b.sleep(500);
  check("another light changes the palette", await b.eval("document.documentElement.style.getPropertyValue('--c-warm').trim().toLowerCase() === '#efa6c2'"));
  await b.click('#atmo-stage .atmo-card[data-atmo="halloween"]');
  await b.sleep(500);
  check("every atmosphere has settings of its own", await b.eval("document.querySelectorAll('#atmo-opts .atmo-opt').length === 7"));
  await b.click('#atmo-stage .atmo-card[data-atmo="winter"]');
  await b.sleep(400);
  check("and they are still there when it is chosen again", await b.eval("document.body.dataset.atmoAurora === 'off'"));
  // without Плюс: a try, and the light goes back
  await b.eval(`localStorage.setItem("notka_plus_local", "0"); true`);
  await b.goto(`${BASE}/app/`);
  await b.waitFor("document.body.dataset.screen !== 'splash'", 8000, "leave splash");
  check("without Плюс the saved atmosphere is not worn", (await b.eval("document.body.dataset.atmo")) === "none");
  await b.eval(`document.getElementById("menu-look").click(); true`);
  await b.sleep(900);
  await b.click('#atmo-stage .atmo-card[data-atmo="autumn"]');
  await b.sleep(500);
  check("without Плюс it is a try for a minute", (await b.eval("document.body.dataset.atmo")) === "autumn" && await b.eval("!document.getElementById('look-try').hidden"));
  await b.click('#atmo-stage .atmo-card[data-atmo="halloween"]');
  await b.sleep(400);
  check("a collectible one is a try, and leads to its tasks", await b.eval("document.getElementById('look-try').textContent.includes('На пробу') && document.getElementById('look-try-keep').textContent === 'К заданиям' && !document.getElementById('look-try-keep').hidden"));
  // the garland of New Year can be pulled
  await b.eval(`localStorage.setItem("notka_plus_local", "1"); localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify(seedState({ atmo: "newyear" })))}); true`);
  await b.goto(`${BASE}/app/`);
  await b.waitFor("document.body.dataset.screen !== 'splash'", 8000, "leave splash");
  await b.sleep(1500);
  await b.shot("atmo-garland-rest");
  const touch = (type, x, y) => b.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  await touch("touchStart", 210, 32);
  for (let i = 1; i <= 10; i++) { await touch("touchMove", 210 + i * 2, 32 + i * 12); await b.sleep(30); }
  await b.sleep(150);
  await b.shot("atmo-garland-pulled");
  await touch("touchEnd");
  await b.sleep(500);
  await b.shot("atmo-garland-swinging");
  check("the page did not scroll while the garland was pulled", await b.eval("[...document.querySelectorAll('.screen')].every((e) => e.scrollTop === 0)"));
  check("no page errors", b.errors.length === 0, b.errors.join(" | ").slice(0, 500));
} catch (err) {
  failed++;
  console.log("FAIL", err.message);
  await b.shot("atmo-fail");
} finally {
  await b.close();
}
process.exit(failed ? 1 : 0);
