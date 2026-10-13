/* «Атмосфера» — seasonal and nature themes: the air of the app.
 *
 * A theme gives the light a palette (app.js / atmosphere.css) and this file
 * gives it weather. It is meant to stay quiet: a few pieces, never a storm
 * unless asked. What it does have is a response to the hand: a swipe is a
 * gust of wind, a touch is a ripple, a puff of leaves, a firefly that comes
 * to the finger, a star that lights up, and at New Year a garland that can
 * be pulled and let go.
 *
 * Two canvases carry it — one behind the interface and one in front of it
 * (a couple of big soft pieces near the glass, for depth).
 *
 *   Atmosphere.set("autumn", { amount: "mid", wind: "soft" })
 *   Atmosphere.set("none")
 */
(function () {
  "use strict";

  const TAU = Math.PI * 2;
  const rnd = (a, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  let back = null, front = null, bctx = null, fctx = null;
  let W = 0, H = 0, DPR = 1;
  let raf = 0, lastT = 0, time = 0;
  let id = "none", theme = null, opts = {}, optsKey = "";
  let sprites = {};

  const AMOUNT = { none: 0, low: 0.55, mid: 1, high: 1.6, drizzle: 0.45, rain: 1, storm: 2 };
  const amt = () => (AMOUNT[opts.amount] === undefined ? 1 : AMOUNT[opts.amount]);
  const N = (base) => Math.round(base * amt());
  const isOn = (key) => opts[key] !== "off";

  // ---------- canvases ----------
  function ensureCanvases() {
    if (back) return;
    back = document.createElement("canvas");
    back.id = "atmo-back";
    back.setAttribute("aria-hidden", "true");
    (document.getElementById("light") || document.body).appendChild(back);
    front = document.createElement("canvas");
    front.id = "atmo-front";
    front.setAttribute("aria-hidden", "true");
    document.body.appendChild(front);
    bctx = back.getContext("2d");
    fctx = front.getContext("2d");
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", () => { if (document.hidden) stopLoop(); else if (theme) startLoop(); });
    document.addEventListener("notka:idle", (e) => { if (e.detail && e.detail.idle) stopLoop(); else if (theme && !document.hidden) startLoop(); });
    bindPointer();
  }
  function resize() {
    if (!back) return;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    [back, front].forEach((c) => { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); });
    if (theme) { sprites = theme.sprites ? theme.sprites() : {}; theme.init(); }
  }

  // ---------- the hand ----------
  const ptr = { x: 0, y: 0, down: false, sx: 0, sy: 0, st: 0, moved: 0, ui: false };
  const UI = "button, a, input, textarea, select, .sheet, .mini-player, .tabbar, .scrub, [role=slider]";
  const isUI = (t) => !!(t && t.closest && t.closest(UI));
  function pDown(x, y, target) {
    Object.assign(ptr, { x, y, sx: x, sy: y, st: performance.now(), down: true, moved: 0, ui: isUI(target) });
    if (theme && theme.onDown) theme.onDown(x, y, ptr.ui);
  }
  function pMove(x, y) {
    const dx = clamp(x - ptr.x, -70, 70), dy = clamp(y - ptr.y, -70, 70);
    ptr.x = x; ptr.y = y;
    ptr.moved += Math.abs(dx) + Math.abs(dy);
    if (theme && theme.onMove) theme.onMove(x, y, dx, dy);
  }
  function pUp() {
    if (!ptr.down) return;
    ptr.down = false;
    const quick = performance.now() - ptr.st < 400 && ptr.moved < 14;
    if (theme && theme.onUp) theme.onUp();
    if (quick && !ptr.ui && theme && theme.onTap) theme.onTap(ptr.x, ptr.y);
  }
  function bindPointer() {
    // touch events keep coming while the page scrolls, so a swipe over a list is felt as wind
    window.addEventListener("touchstart", (e) => { const t = e.touches[0]; if (t) pDown(t.clientX, t.clientY, e.target); }, { passive: true });
    window.addEventListener("touchmove", (e) => {
      const t = e.touches[0];
      if (!t) return;
      pMove(t.clientX, t.clientY);
      if (theme && theme.grabbed && e.cancelable) e.preventDefault(); // a pulled garland does not scroll the page
    }, { passive: false });
    window.addEventListener("touchend", pUp, { passive: true });
    window.addEventListener("touchcancel", pUp, { passive: true });
    window.addEventListener("mousedown", (e) => pDown(e.clientX, e.clientY, e.target));
    window.addEventListener("mousemove", (e) => { if (!theme) return; if (!ptr.x && !ptr.y) { ptr.x = e.clientX; ptr.y = e.clientY; } pMove(e.clientX, e.clientY); });
    window.addEventListener("mouseup", pUp);
  }
  // wind: whatever is near the finger is pushed the way the finger goes
  function gust(list, x, y, dx, dy, R, k) {
    R = R || 130; k = k || 3;
    for (const p of list) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < R) {
        const f = 1 - d / R;
        p.wx = clamp((p.wx || 0) + dx * k * f, -460, 460);
        p.wy = clamp((p.wy || 0) + dy * k * f, -460, 460);
      }
    }
  }
  function drift(p, dt) {
    if (p.wx || p.wy) {
      p.x += (p.wx || 0) * dt; p.y += (p.wy || 0) * dt;
      const k = Math.exp(-dt * 1.7);
      p.wx *= k; p.wy *= k;
    }
  }

  // ---------- loop ----------
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016);
    lastT = now;
    time += dt;
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.clearRect(0, 0, back.width, back.height);
    fctx.clearRect(0, 0, front.width, front.height);
    theme.frame(dt, time);
    bctx.globalAlpha = 1; fctx.globalAlpha = 1;
  }
  function startLoop() { if (!raf && theme) { lastT = performance.now(); raf = requestAnimationFrame(loop); } }
  function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

  function set(next, nextOpts) {
    ensureCanvases();
    next = next || "none";
    nextOpts = nextOpts || {};
    const key = next + JSON.stringify(nextOpts);
    if (key === optsKey && (theme || next === "none")) return;
    optsKey = key;
    if (theme && theme.stop) theme.stop();
    stopLoop();
    id = next;
    opts = nextOpts;
    theme = THEMES[id] || null;
    document.body.classList.toggle("has-atmo-air", !!theme);
    if (!theme) { bctx.clearRect(0, 0, back.width, back.height); fctx.clearRect(0, 0, front.width, front.height); return; }
    resize();
    startLoop();
  }
  window.Atmosphere = { set, themes: Object.keys(THEMES) };
})();
