// «Микс под настроение». Needs tests/serve_local.py running and the internet.
//   node tests/mood.mjs
import { launch } from "./cdp.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "http://127.0.0.1:8099";
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "shots");
let failed = 0;
const check = (name, ok, extra = "") => { if (!ok) failed++; console.log(ok ? "PASS" : "FAIL", name, extra); };

const ask = async (body) => { const res = await fetch(`${BASE}/mood`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); return { status: res.status, tracks: res.ok ? (await res.json()).results : [] }; };
for (const key of ["energize", "ru_rock"]) {
  const { tracks } = await ask({ key });
  check(`the server builds «${key}»`, tracks.length >= 20 && new Set(tracks.map((t) => t.id)).size === tracks.length, String(tracks.length));
}
check("an unknown mood is refused", (await ask({ key: "nope" })).status === 400);
// the mix is grown from the listener's own music: for a calm mood — from their calmer tracks, for a lively one — from the livelier
const find = async (q) => ((await (await fetch(`${BASE}/search?q=${encodeURIComponent(q)}&limit=5`)).json()).results || []).find((t) => t.source === "youtube_music");
const calmQ = ["Billie Eilish when the party's over", "Кино Кукушка", "Adele Someone Like You", "Ludovico Einaudi Nuvole Bianche", "Земфира Хочешь"];
const liveQ = ["Nirvana Smells Like Teen Spirit", "Rammstein Du Hast", "Король и Шут Кукла колдуна", "Skrillex Bangarang", "Кино Группа крови"];
const calm = (await Promise.all(calmQ.map(find))).filter(Boolean), live = (await Promise.all(liveQ.map(find))).filter(Boolean);
const lib = [...calm, ...live];
for (const t of lib) await fetch(`${BASE}/prepare?source=${t.source}&id=${encodeURIComponent(t.sourceId)}`); // their audio has to be there to be measured
const grow = async (key) => { const res = await fetch(`${BASE}/mood`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, seeds: lib.map((t) => ({ source: t.source, id: t.sourceId })), artists: lib.map((t) => t.artist), ru_share: 0.4 }) }); return res.json(); };
const calmIds = new Set(calm.map((t) => t.sourceId)), liveIds = new Set(live.map((t) => t.sourceId));
const name = (id) => { const t = lib.find((x) => x.sourceId === id); return t ? t.artist + " — " + t.title : id; };
const sleep = await grow("sleep"), workout = await grow("workout");
check("«Для сна» grows from the listener's calm tracks", sleep.grownFrom.length >= 2 && sleep.grownFrom.every((id) => calmIds.has(id)), sleep.grownFrom.map(name).join(" | "));
check("«Спорт» grows from their lively ones", workout.grownFrom.length >= 2 && workout.grownFrom.every((id) => liveIds.has(id)), workout.grownFrom.map(name).join(" | "));
check("the two mixes are different music", sleep.results.filter((t) => workout.results.some((w) => w.id === t.id)).length < 8 && sleep.results.length >= 20 && workout.results.length >= 20);

const b = await launch({ dir });
const audio = "document.getElementById('audio')";
const playing = `(!${audio}.paused && ${audio}.currentTime > 0.4)`;
const queue = () => b.eval("document.querySelectorAll('#queue-list .track-row').length");
try {
  await b.goto(`${BASE}/app/`);
  await b.eval(`localStorage.clear(); localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify({ favorites: [], playlists: [], onboardingSeenV2: true }))}); true`);
  await b.goto(`${BASE}/app/`);
  await b.waitFor("document.body.dataset.screen !== 'splash'", 8000, "leave splash");

  // ---- without Плюс: three tracks to taste ----
  await b.click("#mood-open-btn");
  await b.sleep(1500);
  check("the screen offers eight moods and three genres", (await b.eval("document.body.dataset.screen")) === "mood" && await b.eval("document.querySelectorAll('#mood-cloud .mood-orb').length === 8 && document.querySelectorAll('#mood-genres .mood-genre').length === 3 && !document.getElementById('mood-note').hidden"));
  check("every light is inside its field", await b.eval("(() => { const c = document.getElementById('mood-cloud').getBoundingClientRect(); return document.getElementById('mood-cloud').classList.contains('is-live') && [...document.querySelectorAll('.mood-orb')].every((o) => { const r = o.getBoundingClientRect(); return r.left >= c.left - 1 && r.right <= c.right + 1 && r.top >= c.top - 1 && r.bottom <= c.bottom + 1; }); })()"));
  await b.shot("mood-screen");
  // a light can be dragged into another one, and that one is knocked away
  const centre = (mood) => b.eval(`(() => { const r = document.querySelector('.mood-orb[data-mood="${mood}"]').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  const from = await centre("energize"), target = await centre("party");
  const touch = (type, x, y) => b.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  await touch("touchStart", from.x, from.y);
  for (let i = 1; i <= 10; i++) { await touch("touchMove", Math.round(from.x + (target.x - from.x) * i / 10), Math.round(from.y + (target.y - from.y) * i / 10)); await b.sleep(30); }
  const dragged = await centre("energize");
  await touch("touchEnd");
  await b.sleep(400);
  const knocked = await centre("party");
  check("a light follows the finger", Math.hypot(dragged.x - target.x, dragged.y - target.y) < 60, JSON.stringify({ dragged, target }));
  check("the light it hits is knocked away", Math.hypot(knocked.x - target.x, knocked.y - target.y) > 30, JSON.stringify({ before: target, after: knocked }));
  check("dragging is not a choice", !(await b.eval("document.getElementById('screen-mood').classList.contains('is-picking')")) && (await b.eval("document.body.dataset.screen")) === "mood");
  await b.shot("mood-knocked");
  await b.click('.mood-orb[data-mood="chill"]');
  check("the chosen light is marked while the mix is built", await b.eval("document.getElementById('screen-mood').classList.contains('is-picking') && document.querySelector('.mood-orb.is-picked').dataset.mood === 'chill'"));
  await b.shot("mood-picking");
  await b.waitFor(playing, 60000, "taste playing");
  check("without Плюс it says so and plays a taste", await b.eval("document.getElementById('toast').textContent.includes('Три трека на пробу')"));
  await b.click("#mini-open-btn");
  await b.click("#player-queue-btn");
  await b.sleep(500);
  check("the taste is three tracks", (await queue()) === 3 && (await b.eval("document.getElementById('player-context').textContent")).includes("Спокойное"), `${await queue()} / ${await b.eval("document.getElementById('player-context').textContent")}`);
  await b.eval("document.getElementById('queue-sheet-close').click(); true");
  await b.click("#player-back-btn");
  await b.sleep(400);

  // ---- with Плюс: the whole mix, and it goes on ----
  await b.eval(`localStorage.setItem("notka_plus_local", "1"); true`);
  check("after the mix starts the listener is back where they came from", (await b.eval("document.body.dataset.screen")) === "home");
  await b.click("#mood-open-btn");
  await b.sleep(900);
  check("with Плюс there is no «на пробу» note", await b.eval("document.getElementById('mood-note').hidden"));
  await b.click('.mood-genre[data-mood="ru_rock"]');
  await b.waitFor(`${playing} && document.getElementById('player-context').textContent.includes('Русский рок')`, 60000, "mood mix playing");
  await b.click("#mini-open-btn");
  await b.shot("mood-playing");
  await b.click("#player-queue-btn");
  await b.sleep(500);
  check("with Плюс the queue is a whole mix", (await queue()) >= 20, String(await queue()));
  check("the mix card on Home shows it is on", await b.eval("document.getElementById('mymix-card').classList.contains('is-current')"));
  check("no page errors", b.errors.length === 0, b.errors.join(" | ").slice(0, 400));
} catch (err) {
  failed++;
  console.log("FAIL", err.message);
  await b.shot("mood-fail");
} finally {
  await b.close();
}
process.exit(failed ? 1 : 0);
