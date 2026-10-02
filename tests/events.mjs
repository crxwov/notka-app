// «События»: the banner, the page, tasks, rewards, the numbered edition.
// Needs tests/serve_local.py running (it plays the server with a made-up listener and a made-up today).
//   node tests/events.mjs   (restart serve_local.py before each run: the server remembers the listener)
import { launch } from "./cdp.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "http://127.0.0.1:8099";
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "shots");
let failed = 0;
const check = (name, ok, extra = "") => { if (!ok) failed++; console.log(ok ? "PASS" : "FAIL", name, extra); };

const day = (n) => { const d = new Date(Date.now() - n * 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const state = (progress) => ({ favorites: [], playlists: [], recent: [], onboardingSeenV2: true, settings: {}, listens: { seconds: 0, plays: 0, tracks: {}, artists: {} }, events: { progress: { halloween: progress }, items: [], editions: {} } });

const b = await launch({ dir });
let listener = 1000 + Math.floor(Math.random() * 900000);
const load = async (progress, fresh = true) => {
  if (fresh) listener += 1;
  // every load is a listener of its own: the page asks the server with a test header
  await b.send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => { const f = window.fetch; window.fetch = (u, o) => { o = Object.assign({}, o); o.headers = Object.assign({}, o.headers, { "X-Notka-Test-User": "${listener}" }); return f(u, o); }; })();` });
  await b.goto(`${BASE}/app/`);
  await b.eval(`localStorage.clear(); localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify(state(progress)))}); true`);
  await b.goto(`${BASE}/app/`);
  await b.waitFor("document.body.dataset.screen !== 'splash'", 8000, "leave splash");
  await b.waitFor("!document.getElementById('home-event').hidden", 6000, "the banner");
  await b.sleep(900);
};
const mine = () => b.eval(`(() => { const s = JSON.parse(localStorage.getItem("notka_state_v2")); return s.events; })()`);
try {
  // ---- nothing done yet ----
  await load({});
  check("the banner shows on Home, with the day count", await b.eval("document.getElementById('event-banner-title').textContent === 'Хэллоуин' && document.getElementById('event-banner-kicker').textContent.startsWith('Ещё ')"));
  const m0 = await mine();
  check("it starts at 0 of 6, and today's visit already counts", (await b.eval("document.getElementById('event-banner-count').textContent === '0/6'")) && (m0.progress.halloween.days || []).includes(day(0)), JSON.stringify(m0.progress));
  await b.eval("document.getElementById('home-event').scrollIntoView({ block: 'center' }); true");
  await b.sleep(500);
  await b.shot("event-banner");
  await b.click("#home-event");
  await b.sleep(1800);
  check("the page opens in the atmosphere of the event", (await b.eval("document.body.dataset.screen")) === "event" && (await b.eval("document.body.dataset.atmo")) === "halloween");
  check("it shows six tasks and three rewards", await b.eval("document.querySelectorAll('#event-tasks .event-task').length === 6 && document.querySelectorAll('#event-rewards .event-reward').length === 3"));
  check("the numbered one tells how many are left", await b.eval("/осталось \d+ из 100/.test(document.getElementById('event-edition').textContent)"));
  await b.shot("event-page");
  await b.eval("document.getElementById('screen-event').scrollTo(0, 99999); true");
  await b.sleep(400);
  await b.shot("event-page-tasks");
  await b.click("#event-back-btn");
  await b.sleep(700);
  check("leaving gives the usual look back", (await b.eval("document.body.dataset.atmo")) === "none");

  // ---- two tasks: the frame ----
  await load({ listen: 30, moods: ["a", "b", "c"] });
  check("two tasks open the frame at once", (await mine()).items.includes("frame_pumpkin") && await b.eval("document.getElementById('home-avatar').dataset.frame === 'pumpkin'"));
  check("and the banner says 2 of 6", await b.eval("document.getElementById('event-banner-count').textContent === '2/6'"));

  // ---- four: the theme, which can then be put on in «Оформление» ----
  await load({ listen: 30, moods: ["a", "b", "c"], days: [day(1), day(2), day(3), day(4)], playlist: 5 });
  const items = (await mine()).items;
  check("four open the theme", items.includes("atmo_halloween"), items.join(","));
  await b.eval(`document.getElementById("menu-look").click(); true`);
  await b.sleep(900);
  await b.click('#atmo-stage .atmo-card[data-atmo="halloween"]');
  await b.sleep(600);
  check("it is put on for good — no try, no banner", (await b.eval("document.body.dataset.atmo")) === "halloween" && await b.eval("document.getElementById('look-try').hidden"));
  check("the golden light is not there yet", await b.eval("![...document.querySelectorAll('#atmo-opts .chip[data-setting=light]')].some((c) => c.textContent === 'Золотая паутина')"));

  // ---- six: the server numbers the edition ----
  await load({ listen: 30, moods: ["a", "b", "c"], days: [day(1), day(2), day(3), day(4)], playlist: 5, share: 1, bats: 3 });
  await b.waitFor("JSON.parse(localStorage.getItem('notka_state_v2')).events.editions.halloween > 0", 12000, "the server's number");
  const ev = await mine();
  check("six open the numbered edition, and the server gave it a number", ev.editions.halloween > 0 && ev.items.includes("edition_halloween"), JSON.stringify(ev.editions));
  await b.click("#home-avatar-btn");
  await b.sleep(900);
  check("the profile shows the number", await b.eval("!document.getElementById('edition-badge').hidden && /№ \d+/.test(document.getElementById('edition-badge').textContent)"));
  await b.shot("event-profile");
  await b.eval(`document.getElementById("menu-look").click(); true`);
  await b.sleep(800);
  await b.click('#atmo-stage .atmo-card[data-atmo="halloween"]');
  await b.sleep(600);
  check("and the golden light is offered", await b.eval("[...document.querySelectorAll('#atmo-opts .chip[data-setting=light]')].some((c) => c.textContent === 'Золотая паутина')"));
  await b.click('#atmo-opts .chip[data-setting="light"][data-v="gold"]');
  await b.sleep(500);
  await b.shot("event-gold-light");

  // ---- catching bats ----
  await load({});
  await b.eval(`Atmosphere.onCatch("bat"); Atmosphere.onCatch("bat"); Atmosphere.onCatch("bat"); true`);
  check("three caught bats finish that task", (await mine()).progress.halloween.bats === 3);
  check("no page errors", b.errors.length === 0, b.errors.join(" | ").slice(0, 500));
} catch (err) {
  failed++;
  console.log("FAIL", err.message);
  await b.shot("events-fail");
} finally {
  await b.close();
}
process.exit(failed ? 1 : 0);
