// Плашка «7 дней бесплатно» на странице Плюса: первый заход, каждый десятый и после 3 дней без захода.
//   node tests/plus_bar_rule.mjs   (нужен tests/serve_local.py)
import { launch } from "./cdp.mjs";
const BASE = "http://127.0.0.1:8099";
const b = await launch({ dir: "C:/Users/leksik/Documents/Notka/tests/shots", port: 9378 });
let bad = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "PASS " : "FAIL ") + name + " " + extra); if (!ok) bad++; };
await b.goto(`${BASE}/health`);
await b.eval(`localStorage.clear(); localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify({ onboardingSeenV2: true, favorites: [], playlists: [], settings: {} }))}); true`);
await b.goto(`${BASE}/app/`);
await b.waitFor("!!document.body && document.body.dataset.screen !== 'splash'", 8000, "x");
await b.sleep(800);
const shown = () => b.eval("getComputedStyle(document.getElementById('plus-bar')).display !== 'none'");
const visit = async () => {
  await b.click("#home-avatar-btn"); await b.sleep(450);
  await b.eval("document.getElementById('menu-plus').hidden=false; true");
  await b.click("#menu-plus"); await b.sleep(900);
  const r = await shown();
  await b.click("#plus-back-btn"); await b.sleep(450);
  await b.click("#profile-back-btn").catch(() => {}); await b.sleep(300);
  return r;
};
const seq = [];
for (let i = 0; i < 12; i++) seq.push(await visit());
check("shown on the 1st visit", seq[0] === true, JSON.stringify(seq));
check("hidden on visits 2 to 10", seq.slice(1, 10).every((x) => x === false));
check("shown on the 11th visit", seq[10] === true);
check("hidden on the 12th", seq[11] === false);
await b.eval(`localStorage.setItem("notka_plus_last", String(Date.now() - 4 * 86400000)); true`);
check("shown after 4 days away", (await visit()) === true);
console.log(bad ? "FAILED" : "ALL PASS");
process.exit(bad ? 1 : 0);
