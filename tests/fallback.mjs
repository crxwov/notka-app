// Если выбранный трек не играет (сервер отвечает ошибкой), Нотка ищет равноценный и включает его.
//   node tests/fallback.mjs   (нужен tests/serve_local.py и интернет)
import { launch } from "./cdp.mjs";
const BASE = "http://127.0.0.1:8099";
const b = await launch({ dir: "C:/Users/leksik/Documents/Notka/tests/shots", port: 9378 });
let bad = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "PASS " : "FAIL ") + name + " " + extra); if (!ok) bad++; };
const found = ((await (await fetch(`${BASE}/search?q=${encodeURIComponent("Sabrina Carpenter Espresso")}`)).json()).results || []).filter((t) => t.artwork);
const orig = found.find((t) => /espresso/i.test(t.title) && /sabrina carpenter/i.test(t.artist)) || found[0];
// для проверки механизма: у «сломанного» трека длина такая же, как у фанатской загрузки того же трека (3:22)
const seed = { favorites: [{ ...orig, duration: 202 }], recent: [], playlists: [], onboardingSeenV2: true, settings: {} };
await b.goto(`${BASE}/health`);
await b.eval(`localStorage.clear(); localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify(seed))}); true`);
await b.goto(`${BASE}/app/`);
await b.waitFor("!!document.body && document.body.dataset.screen !== 'splash'", 8000, "x");
await b.sleep(800);
// «ломаем» именно этот трек: сервер на него отвечает ошибкой
await b.eval(`(() => { const f = window.fetch; window.__broken = 0; window.fetch = (u, o) => { if (String(u).includes('/prepare') && String(u).includes(${JSON.stringify(orig.sourceId)})) { window.__broken++; return Promise.resolve(new Response(JSON.stringify({ error: { code: 'RESOLVE_FAILED' } }), { status: 502 })); } return f(u, o); }; return true; })()`);
await b.click('.tab[data-tab="library"]'); await b.sleep(500);
await b.click("#open-favorites-btn"); await b.sleep(600);
await b.click("#favorites-list .track-row .row-main");
await b.waitFor("window.__broken >= 1", 20000, "the broken track was tried");
await b.waitFor("(() => { const a = document.getElementById('audio'); return !a.paused && a.currentTime > 0.5; })()", 90000, "an equivalent plays");
const src = await b.eval("document.getElementById('audio').getAttribute('src')");
check("the broken track was replaced, music plays", !src.includes(orig.sourceId) && src.includes("/stream?"), src);
check("only one try on the broken id", (await b.eval("window.__broken")) === 1);
console.log(bad ? "FAILED" : "ALL PASS");
process.exit(bad ? 1 : 0);
