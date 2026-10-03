// Вкладка «Аккаунт»: копия данных, восстановление, сброс статистики. Нужен tests/serve_local.py.   node tests/account.mjs
import { launch } from "./cdp.mjs";
const BASE = "http://127.0.0.1:8099";
let failed = 0;
const check = (name, ok, extra = "") => { if (!ok) failed++; console.log(ok ? "PASS" : "FAIL", name, extra); };
const b = await launch({ dir: "C:/Users/leksik/Documents/Notka/tests/shots", port: 9372 });
const mk = (t, a, v) => ({ id: `youtube_music_${v}`, source: "youtube_music", sourceId: v, title: t, artist: a, duration: 240, artwork: `https://i.ytimg.com/vi/${v}/hqdefault.jpg` });
const tr = [mk("Yellow", "Coldplay", "yKNxeF4KMsY"), mk("Creep", "Radiohead", "XFkzRNyygfk")];
const st = { favorites: tr, onboardingSeenV2: true, recent: tr, playlists: [{ id: "p1", name: "Вечер", tracks: tr, createdAt: 1 }], settings: {}, accountName: "Лёша", followedArtists: ["Coldplay"], listens: { seconds: 5400, plays: 30, tracks: { [tr[0].id]: { track: tr[0], plays: 12, seconds: 3000 } }, artists: { Coldplay: { plays: 12, seconds: 3000 } } } };
try {
  await b.goto(`${BASE}/health`);
  await b.eval(`localStorage.clear(); localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify(st))}); true`);
  await b.goto(`${BASE}/app/`);
  await b.waitFor("!!document.body && document.body.dataset.screen !== 'splash'", 8000, "leave splash");
  await b.sleep(1000);
  await b.click("#home-avatar-btn"); await b.sleep(700);
  await b.click("#menu-account"); await b.sleep(1200);
  await b.shot("account-1");
  check("the name and counts are shown", await b.eval("document.getElementById('acc-name-val').textContent === 'Лёша' && document.getElementById('acc-favs').textContent === '2' && document.getElementById('acc-lists').textContent === '1' && document.getElementById('acc-follows').textContent === '1'"));
  // копия: если буфер недоступен, текст показывается в окне
  await b.click("#account-backup"); await b.sleep(800);
  const text = await b.eval("(() => { const m = document.getElementById('restore-modal'); const v = document.getElementById('restore-input').value; return v || ''; })()");
  const copied = await b.eval("document.querySelector('.toast') ? document.querySelector('.toast').textContent : ''");
  check("a backup text is made (copied or shown)", text.startsWith("NOTKA1:") || /скопирована/.test(copied), (text.slice(0, 12) || copied));
  let backup = text;
  if (!backup) backup = await b.eval("(async () => { return ''; })()");
  // стираем данные и восстанавливаем
  await b.eval(`(() => { const s = JSON.parse(localStorage.getItem("notka_state_v2")); s.favorites = []; s.playlists = []; s.followedArtists = []; localStorage.setItem("notka_state_v2", JSON.stringify(s)); return true; })()`);
  if (text) {
    await b.goto(`${BASE}/app/`);
    await b.waitFor("!!document.body && document.body.dataset.screen !== 'splash'", 8000, "leave splash");
    await b.sleep(800);
    await b.click("#home-avatar-btn"); await b.sleep(600);
    await b.click("#menu-account"); await b.sleep(900);
    check("data is gone before restoring", await b.eval("document.getElementById('acc-favs').textContent === '0'"));
    await b.click("#account-restore"); await b.sleep(500);
    await b.eval(`(() => { const t = document.getElementById('restore-input'); t.value = ${JSON.stringify(text)}; return true; })()`);
    await b.shot("account-2-restore");
    await b.click("#restore-confirm"); await b.sleep(2500);
    await b.waitFor("!!document.body && document.body.dataset.screen !== 'splash'", 8000, "reload");
    await b.sleep(800);
    const back = await b.eval("(() => { const s = JSON.parse(localStorage.getItem('notka_state_v2')); return JSON.stringify([s.favorites.length, s.playlists.length, s.followedArtists.length, s.accountName, s.listens.plays]); })()");
    check("the backup brings everything back", back === JSON.stringify([2, 1, 1, "Лёша", 30]), back);
    // чужой текст не принимается
    await b.click("#home-avatar-btn"); await b.sleep(600);
    await b.click("#menu-account"); await b.sleep(900);
    await b.click("#account-restore"); await b.sleep(400);
    await b.eval("(() => { document.getElementById('restore-input').value = 'привет'; return true; })()");
    await b.click("#restore-confirm"); await b.sleep(500);
    check("a foreign text is refused and nothing changes", await b.eval("JSON.parse(localStorage.getItem('notka_state_v2')).favorites.length === 2"));
  }
  check("no page errors", b.errors.filter((e) => !/Haptic|clipboard|Clipboard/.test(e)).length === 0, b.errors.filter((e) => !/Haptic|clipboard|Clipboard/.test(e)).join(" | ").slice(0, 200));
} catch (e) { failed++; console.log("FAIL", e.message); }
await b.close();
process.exit(failed ? 1 : 0);
