// Замер плавности на «слабом телефоне»: процессор замедлен, считаем кадры и долгие кадры на каждом экране.
// Нужен tests/serve_local.py.   node tests/perf.mjs [замедление, по умолчанию 4]
import { launch } from "./cdp.mjs";
const BASE = "http://127.0.0.1:8099";
const RATE = Number(process.argv[2] || 4);
const b = await launch({ dir: "C:/Users/leksik/Documents/Notka/tests/shots", port: 9344 });
const mk = (t, a, v) => ({ id: `youtube_music_${v}`, source: "youtube_music", sourceId: v, title: t, artist: a, duration: 240, artwork: `https://i.ytimg.com/vi/${v}/hqdefault.jpg` });
const tr = [mk("Yellow", "Coldplay", "yKNxeF4KMsY"), mk("Creep", "Radiohead", "XFkzRNyygfk")];
const st = { favorites: tr, onboardingSeenV2: true, recent: tr, playlists: [], settings: {}, accountName: "Лёша", listens: { seconds: 5400, plays: 30, tracks: {}, artists: {} } };
await b.goto(`${BASE}/health`);
await b.eval(`localStorage.clear(); localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify(st))}); true`);
await b.goto(`${BASE}/app/`);
await b.waitFor("!!document.body && document.body.dataset.screen !== 'splash'", 8000, "x");
await b.sleep(1500);
await b.send("Emulation.setCPUThrottlingRate", { rate: RATE });

async function measure(label, ms = 3000) {
  await b.eval(`(() => { window.__f = []; let last = performance.now(); const tick = (t) => { window.__f.push(t - last); last = t; if (window.__run) requestAnimationFrame(tick); }; window.__run = true; requestAnimationFrame(tick); return true; })()`);
  await b.sleep(ms);
  const r = await b.eval(`(() => { window.__run = false; const f = window.__f.slice(2); const sum = f.reduce((a, x) => a + x, 0); const long = f.filter((x) => x > 50).length; const worst = Math.max(...f); return JSON.stringify({ fps: Math.round(f.length / (sum / 1000)), long, worst: Math.round(worst) }); })()`);
  const o = JSON.parse(r);
  console.log(`${label.padEnd(22)} fps ${String(o.fps).padStart(3)}  кадров >50мс: ${String(o.long).padStart(3)}  худший: ${o.worst}мс`);
}
await b.send("Performance.enable");
const metric = async () => Object.fromEntries((await b.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
async function audit(label) {
  const a = await metric(); await b.sleep(2500); const c = await metric();
  const per = (k) => Math.round(((c[k] - a[k]) / 2.5) * 1000);
  const info = await b.eval(`(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && el.offsetParent !== null; };
    let bd = 0, bl = 0, wc = 0, nodes = document.getElementsByTagName("*").length;
    for (const el of document.querySelectorAll("body *")) {
      if (!vis(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.backdropFilter && cs.backdropFilter !== "none") bd++;
      if (cs.filter && cs.filter.includes("blur")) bl++;
      if (cs.willChange && cs.willChange !== "auto") wc++;
    }
    const an = document.getAnimations().filter((x) => x.playState === "running");
    const names = {}; an.forEach((x) => { const n = x.animationName || x.constructor.name; names[n] = (names[n] || 0) + 1; });
    const top = Object.entries(names).sort((x, y) => y[1] - x[1]).slice(0, 5).map((e) => e[0] + "×" + e[1]).join(", ");
    return JSON.stringify({ bd, bl, wc, nodes, anim: an.length, top });
  })()`);
  const o = JSON.parse(info);
  console.log(`${label.padEnd(18)} поток: ${String(per("TaskDuration")).padStart(4)}мс/с (скрипты ${String(per("ScriptDuration")).padStart(3)}, стили ${String(per("RecalcStyleDuration")).padStart(3)}, раскладка ${String(per("LayoutDuration")).padStart(3)}) | размытий фона ${o.bd}, blur ${o.bl}, анимаций ${o.anim}, узлов ${o.nodes}`);
  if (o.top) console.log(`${"".padEnd(18)} анимации: ${o.top}`);
}
console.log(`замедление процессора x${RATE}`);
await audit("главная");
await b.click('.tab[data-tab="search"]'); await b.sleep(800); await audit("поиск");
await b.click('.tab[data-tab="library"]'); await b.sleep(800); await audit("моё");
await b.click('.tab[data-tab="home"]'); await b.sleep(600);
await b.click("#home-avatar-btn"); await b.sleep(900); await audit("профиль");
await b.eval("document.getElementById('menu-plus').hidden=false; true");
await b.click("#menu-plus"); await b.sleep(1800); await audit("плюс");
console.log(b.errors.filter((e) => !/Haptic/.test(e)).join("|").slice(0, 300) || "ошибок нет");
await b.close();
