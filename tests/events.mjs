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
let headerScript = null;
const load = async (progress, fresh = true) => {
  if (fresh) listener += 1;
  // every load is a listener of its own: the page asks the server with a test header
  if (headerScript) await b.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: headerScript });
  const added = await b.send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => { const f = window.fetch; window.fetch = (u, o) => { o = Object.assign({}, o); o.headers = Object.assign({}, o.headers, { "X-Notka-Test-User": "${listener}" }); return f(u, o); }; })();` });
  headerScript = added && added.identifier;
  // the state is put in place on a page that is not the app, so nothing of the last scenario is sent under the new listener
  await b.goto(`${BASE}/health`);
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
  check("it starts at 0 of 4", await b.eval("document.getElementById('event-banner-count').textContent === '0/4'"), JSON.stringify(m0.progress));
  await b.eval("document.getElementById('home-event').scrollIntoView({ block: 'center' }); true");
  await b.sleep(500);
  await b.shot("event-banner");
  await b.click("#home-event");
  await b.sleep(1800);
  check("the page opens in the atmosphere of the event", (await b.eval("document.body.dataset.screen")) === "event" && (await b.eval("document.body.dataset.atmo")) === "halloween");
  check("it shows four tasks and three rewards", await b.eval("document.querySelectorAll('#event-tasks .event-task').length === 4 && document.querySelectorAll('#event-rewards .event-reward').length === 3"));
  check("the numbered one tells how many are left", await b.eval("/осталось [0-9]+ из 100/.test(document.getElementById('event-edition').textContent)"));
  await b.shot("event-page");
  await b.eval("document.getElementById('screen-event').scrollTo(0, 99999); true");
  await b.sleep(400);
  await b.shot("event-page-tasks");
  await b.click("#event-back-btn");
  await b.sleep(700);
  check("leaving gives the usual look back", (await b.eval("document.body.dataset.atmo")) === "none");

  // ---- two tasks: the frame ----
  await load({ listen: 15, bats: 3 });
  check("two tasks open the frame at once", (await mine()).items.includes("frame_pumpkin") && await b.eval("document.getElementById('home-avatar').dataset.frame === 'pumpkin'"));
  check("and the banner says 2 of 4", await b.eval("document.getElementById('event-banner-count').textContent === '2/4'"));

  // ---- three: the theme, which can then be put on in «Оформление» ----
  await load({ listen: 15, bats: 3, mood: ["a"] });
  const items = (await mine()).items;
  check("three open the theme", items.includes("atmo_halloween"), items.join(","));
  await b.eval(`document.getElementById("menu-look").click(); true`);
  await b.sleep(900);
  await b.click('#atmo-stage .atmo-card[data-atmo="halloween"]');
  await b.sleep(600);
  check("it is put on for good — no try, no banner", (await b.eval("document.body.dataset.atmo")) === "halloween" && await b.eval("document.getElementById('look-try').hidden"));
  check("the golden light is not there yet", await b.eval("![...document.querySelectorAll('#atmo-opts .chip[data-setting=light]')].some((c) => c.textContent === 'Золотая паутина')"));

  // ---- four: the server numbers the edition ----
  await load({ listen: 15, bats: 3, mood: ["a"], share: 1 });
  await b.waitFor("JSON.parse(localStorage.getItem('notka_state_v2')).events.editions.halloween > 0", 12000, "the server's number");
  const ev = await mine();
  check("four open the numbered edition, and the server gave it a number", ev.editions.halloween > 0 && ev.items.includes("edition_halloween"), JSON.stringify(ev.editions));
  await b.eval("document.getElementById('rp-ok') && document.getElementById('rp-ok').click(); true");
  await b.sleep(500);
  await b.click("#home-event");
  await b.sleep(4600);
  await b.shot("event-page-lit");
  await b.click("#event-back-btn");
  await b.sleep(500);
  await b.click("#home-avatar-btn");
  await b.sleep(900);
  check("the profile shows the number", await b.eval("!document.getElementById('edition-badge').hidden && /№ [0-9]+/.test(document.getElementById('edition-badge').textContent)"));
  await b.shot("event-profile");
  await b.eval(`document.getElementById("menu-look").click(); true`);
  await b.sleep(800);
  await b.click('#atmo-stage .atmo-card[data-atmo="halloween"]');
  await b.sleep(600);
  check("and the golden light is offered", await b.eval("[...document.querySelectorAll('#atmo-opts .chip[data-setting=light]')].some((c) => c.textContent === 'Золотая паутина')"));
  await b.click('#atmo-opts .chip[data-setting="light"][data-v="gold"]');
  await b.sleep(500);
  await b.shot("event-gold-light");

  // ---- the check section: finish tasks without doing them, and start over ----
  await load({});
  await b.click("#home-event");
  await b.sleep(1500);
  check("the check section is there in preview mode", await b.eval("!document.getElementById('event-debug').hidden"));
  const press = async (id) => { await b.eval(`document.getElementById("${id}").click(); true`); await b.sleep(900); };
  const closePop = async () => { await b.eval("(() => { const o = document.getElementById('reward-pop'); if (o && !o.hidden) document.getElementById('rp-ok').click(); return true; })()"); await b.sleep(500); };
  await press("evd-next");
  const c1 = await b.eval("document.getElementById('event-count').textContent");
  check("«next task» finishes one", c1 === "1", `got ${c1}: ${JSON.stringify((await mine()).progress)}`);
  await press("evd-next");
  await closePop();
  const c2 = await b.eval("document.getElementById('event-count').textContent");
  check("the second one opens the frame", (await mine()).items.includes("frame_pumpkin") && c2 === "2", `got ${c2}: ${JSON.stringify(await mine())}`);
  await press("evd-all");
  await b.waitFor("JSON.parse(localStorage.getItem('notka_state_v2')).events.editions.halloween > 0", 12000, "the number");
  await closePop();
  await closePop();
  await closePop();
  check("«all» finishes everything and the server numbers the edition", (await b.eval("document.getElementById('event-count').textContent")) === "4" && (await mine()).items.includes("edition_halloween"));
  await b.eval("document.getElementById('screen-event').scrollTo(0, 99999); true");
  await b.sleep(300);
  await b.shot("event-debug");
  await press("evd-reset");
  check("«start over» clears the phone", (await b.eval("document.getElementById('event-count').textContent")) === "0" && (await mine()).items.length === 0 && !(await mine()).editions.halloween);
  await b.sleep(1500);
  check("and the server forgot too: the edition is free again", await b.eval("/осталось [0-9]+ из 100/.test(document.getElementById('event-edition').textContent)") && !(await mine()).editions.halloween);

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
