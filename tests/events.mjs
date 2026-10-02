// «События»: ten days, a task a day, rewards at 3 / 5 / 10, the pumpkin, the check section.
// Needs tests/serve_local.py running (it plays the server with a made-up listener and a made-up today:
// the 22nd of October, day 1). Restart serve_local.py before each run: the server remembers the listeners.
//   node tests/events.mjs
import { launch } from "./cdp.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "http://127.0.0.1:8099";
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "shots");
let failed = 0;
const check = (name, ok, extra = "") => { if (!ok) failed++; console.log(ok ? "PASS" : "FAIL", name, extra); };

// what a task needs to be done
const DONE = { t1: 10, t2: 1, t3: ["a"], t4: 3, t5: 1, t6: 5, t7: ["a", "b", "c"], t8: 3, t9: 3, t10: 30 };
const done = (n) => Object.fromEntries(Object.entries(DONE).slice(0, n));
const state = (progress) => ({ favorites: [], playlists: [], recent: [], onboardingSeenV2: true, settings: {}, listens: { seconds: 0, plays: 0, tracks: {}, artists: {} }, events: { progress: { halloween: progress }, items: [], editions: {} } });

// the day of the made-up today, set on the server: a reset puts it back to day 1, then it is moved forward
const setDay = async (n) => {
  const head = { "content-type": "application/json", "X-Notka-Test-User": "1" };
  await fetch(`${BASE}/events/reset`, { method: "POST", headers: head, body: JSON.stringify({ event: "halloween" }) });
  for (let i = 1; i < n; i++) await fetch(`${BASE}/events/advance`, { method: "POST" });
};

const b = await launch({ dir });
let listener = 1000 + Math.floor(Math.random() * 900000);
let headerScript = null;
const load = async (progress, day = 1) => {
  listener += 1;
  await setDay(day);
  if (headerScript) await b.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: headerScript });
  const added = await b.send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => { const f = window.fetch; window.fetch = (u, o) => { o = Object.assign({}, o); o.headers = Object.assign({}, o.headers, { "X-Notka-Test-User": "${listener}" }); return f(u, o); }; })();` });
  headerScript = added && added.identifier;
  // the state is put in place on a page that is not the app, so nothing of the last scenario is sent under the new listener
  await b.goto(`${BASE}/health`);
  await b.eval(`localStorage.clear(); localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify(state(progress)))}); true`);
  await b.goto(`${BASE}/app/`);
  await b.waitFor("document.body.dataset.screen !== 'splash'", 8000, "leave splash");
  await b.waitFor("!document.getElementById('home-event').hidden", 6000, "the banner");
  await b.sleep(1100);
};
const mine = () => b.eval(`JSON.parse(localStorage.getItem("notka_state_v2")).events`);
const closePops = async () => {
  for (let i = 0; i < 5; i++) {
    await b.eval("(() => { const o = document.getElementById('reward-pop'); if (o && !o.hidden) document.getElementById('rp-ok').click(); return true; })()");
    await b.sleep(450);
  }
};
const text = (id) => b.eval(`document.getElementById("${id}").textContent`);
try {
  // ---- day 1, nothing done ----
  await load({}, 1);
  check("the banner shows on Home with the day", (await text("event-banner-kicker")) === "День 1 из 10", await text("event-banner-kicker"));
  check("it starts at 0 of 10", (await text("event-banner-count")) === "0/10");
  await b.eval("document.getElementById('home-event').scrollIntoView({ block: 'center' }); true");
  await b.sleep(500);
  await b.shot("event-banner");
  await b.click("#home-event");
  await b.sleep(2200);
  check("the page opens in the atmosphere of the event", (await b.eval("document.body.dataset.screen")) === "event" && (await b.eval("document.body.dataset.atmo")) === "halloween");
  check("the calendar has ten days, today is marked", await b.eval("document.querySelectorAll('#event-calendar .cal-day').length === 10 && document.querySelectorAll('#event-calendar .cal-day.is-today').length === 1 && document.querySelectorAll('#event-calendar .cal-day.is-closed').length === 9"));
  check("only today's task is shown, the others only wait for their date", await b.eval("document.querySelectorAll('#event-tasks .event-task:not(.is-closed)').length === 1 && document.querySelectorAll('#event-tasks .event-task.is-closed').length === 9"));
  check("the next-step card names today's task", await b.eval("document.getElementById('event-next').textContent.includes('Задание дня 1') && document.getElementById('event-next').textContent.includes('Послушай 10 минут')"));
  check("three rewards are shown", await b.eval("document.querySelectorAll('#event-rewards .event-reward').length === 3"));
  await b.shot("event-page");
  await b.eval("document.getElementById('screen-event').scrollTo(0, 99999); true");
  await b.sleep(400);
  await b.shot("event-page-tasks");
  await b.click("#event-back-btn");
  await b.sleep(700);
  check("leaving gives the usual look back", (await b.eval("document.body.dataset.atmo")) === "none");

  // ---- a task that has not opened does not count ----
  await b.eval(`Atmosphere.onCatch("bat"); Atmosphere.onCatch("bat"); true`);
  check("a bat caught on day 1 counts for nothing (its task opens on day 2)", !((await mine()).progress.halloween || {}).t2);

  // ---- day 3: three done, the theme ----
  await load(done(3), 3);
  const items3 = (await mine()).items;
  check("three tasks open the theme at once", items3.includes("atmo_halloween") && !items3.includes("plus_3"), items3.join(","));
  check("and the banner says 3 of 10", (await text("event-banner-count")) === "3/10");
  await b.eval(`document.getElementById("menu-look").click(); true`);
  await b.sleep(900);
  await b.click('#atmo-stage .atmo-card[data-atmo="halloween"]');
  await b.sleep(600);
  check("the theme is put on for good — no try, no banner", (await b.eval("document.body.dataset.atmo")) === "halloween" && await b.eval("document.getElementById('look-try').hidden"));

  // ---- day 5: five done, three days of Плюс ----
  await load(done(5), 5);
  await b.waitFor("JSON.parse(localStorage.getItem('notka_state_v2')).events.items.includes('plus_3')", 12000, "the days of Плюс");
  check("five tasks give three days of Плюс, and the phone knows it", (await b.eval("+localStorage.getItem('notka_plus_until') * 1000 > Date.now() + 2.5 * 86400000")));
  await closePops();

  // ---- day 10: ten done, ten more days of Плюс ----
  await load(done(10), 10);
  await b.waitFor("JSON.parse(localStorage.getItem('notka_state_v2')).events.items.includes('plus_10')", 12000, "the ten days");
  check("ten tasks give ten more days of Плюс", (await mine()).items.includes("plus_10") && (await b.eval("+localStorage.getItem('notka_plus_until') * 1000 > Date.now() + 9.5 * 86400000")));
  await closePops();
  await b.click("#home-event");
  await b.sleep(4800);
  await b.shot("event-page-lit");
  check("the whole pumpkin shines when all are done", await b.eval("document.querySelector('#event-stage svg.pk').classList.contains('is-glow') && document.querySelector('#event-stage svg.pk').classList.contains('is-rays')"));
  await b.click("#event-back-btn");
  await b.sleep(500);

  // ---- the check section: open the next day, finish tasks, start over ----
  await load({}, 1);
  await b.click("#home-event");
  await b.sleep(1500);
  check("the check section is there in preview mode", await b.eval("!document.getElementById('event-debug').hidden"));
  const press = async (id) => { await b.eval(`document.getElementById("${id}").click(); true`); await b.sleep(1100); };
  await press("evd-next");
  check("«next task» finishes today's task", (await text("event-count")) === "1");
  await press("evd-next");
  check("and when today's is done, there is nothing left to finish", (await text("event-count")) === "1");
  await press("evd-day");
  check("«next day» opens day 2", (await text("event-days")) === "День 2 из 10" && await b.eval("document.querySelectorAll('#event-tasks .event-task:not(.is-closed)').length === 2"));
  await press("evd-next");
  await press("evd-day");
  await press("evd-next");
  await closePops();
  check("three days of three tasks give the theme", (await text("event-count")) === "3" && (await mine()).items.includes("atmo_halloween"));
  for (let i = 0; i < 7; i++) await press("evd-day");
  await press("evd-all");
  await b.waitFor("JSON.parse(localStorage.getItem('notka_state_v2')).events.items.includes('plus_10')", 12000, "the ten days");
  await closePops();
  check("«all open tasks» on day 10 finishes everything", (await text("event-count")) === "10" && (await mine()).items.includes("plus_10"));
  await b.eval("document.getElementById('screen-event').scrollTo(0, 99999); true");
  await b.sleep(300);
  await b.shot("event-debug");
  await press("evd-reset");
  check("«start over» clears the phone and goes back to day 1", (await text("event-count")) === "0" && (await mine()).items.length === 0 && (await text("event-days")) === "День 1 из 10");
  await b.sleep(1500);
  check("and the server forgot too", (await mine()).items.length === 0 && (await text("event-count")) === "0");

  // ---- a bat on its day ----
  await load({}, 2);
  await b.eval(`Atmosphere.onCatch("bat"); true`);
  check("a bat caught on day 2 finishes that day's task", (await mine()).progress.halloween.t2 === 1);
  check("no page errors", b.errors.length === 0, b.errors.join(" | ").slice(0, 500));
} catch (err) {
  failed++;
  console.log("FAIL", err.message);
  await b.shot("events-fail");
} finally {
  await b.close();
}
process.exit(failed ? 1 : 0);
