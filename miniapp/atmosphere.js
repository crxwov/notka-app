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

  // ---------- sprites ----------
  // draw(ctx, w, h) paints a shape of w x h; `soft` shrinks it and lets the
  // browser stretch it back, which is a cheap blur for pieces near the glass
  function sprite(w, h, draw, soft) {
    const k = soft ? 1 / soft : 1;
    const c = document.createElement("canvas");
    c.width = Math.max(2, Math.ceil(w * DPR * k));
    c.height = Math.max(2, Math.ceil(h * DPR * k));
    const x = c.getContext("2d");
    x.scale(DPR * k, DPR * k);
    draw(x, w, h);
    return { img: c, w, h };
  }
  function put(ctx, sp, x, y, size, rot, alpha, flip) {
    const w = size * (sp.w / sp.h), h = size;
    ctx.globalAlpha = alpha;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    if (flip !== undefined) ctx.scale(flip, 1);
    ctx.drawImage(sp.img, -w / 2, -h / 2, w, h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  const glowDot = (color, edge) => (x, w, h) => {
    const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, color);
    g.addColorStop(edge === undefined ? 0.35 : edge, color.replace(/[\d.]+\)$/, "0.5)"));
    g.addColorStop(1, color.replace(/[\d.]+\)$/, "0)"));
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
  };
  function hexToRgba(h) { const n = parseInt(h.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},1)`; }

  // ---------- shapes ----------
  function mapleLeaf(x, w, h, c1, c2) {
    const cx = w / 2, cy = h / 2 + 1, R = Math.min(w, h) / 2 - 1;
    x.beginPath();
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * TAU) / 10;
      const r = i % 2 === 0 ? R : R * 0.46;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * (i === 5 ? 1.15 : 1)]);
    }
    x.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i <= 10; i++) {
      const p = pts[i % 10], q = pts[(i + 1) % 10];
      x.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
    }
    x.closePath();
    const g = x.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    x.fillStyle = g; x.fill();
    x.strokeStyle = "rgba(60,20,0,0.35)"; x.lineWidth = 0.7;
    x.beginPath(); x.moveTo(cx, cy + R * 0.85); x.lineTo(cx, cy - R * 0.7); x.stroke();
  }
  function ovalLeaf(x, w, h, c1, c2) {
    x.beginPath();
    x.moveTo(w / 2, 1);
    x.bezierCurveTo(w * 0.98, h * 0.3, w * 0.9, h * 0.8, w / 2, h - 1);
    x.bezierCurveTo(w * 0.1, h * 0.8, w * 0.02, h * 0.3, w / 2, 1);
    const g = x.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    x.fillStyle = g; x.fill();
    x.strokeStyle = "rgba(60,20,0,0.3)"; x.lineWidth = 0.7;
    x.beginPath(); x.moveTo(w / 2, 3); x.lineTo(w / 2, h - 2); x.stroke();
  }
  function petal(x, w, h, c1, c2) {
    x.beginPath();
    x.moveTo(w / 2, h);
    x.bezierCurveTo(-w * 0.2, h * 0.7, w * 0.05, h * 0.05, w * 0.42, h * 0.08);
    x.lineTo(w * 0.5, h * 0.2);
    x.lineTo(w * 0.58, h * 0.08);
    x.bezierCurveTo(w * 0.95, h * 0.05, w * 1.2, h * 0.7, w / 2, h);
    const g = x.createLinearGradient(w / 2, 0, w / 2, h);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    x.fillStyle = g; x.fill();
  }
  function crystal(x, w, h) {
    const cx = w / 2, cy = h / 2, R = w / 2 - 1;
    x.strokeStyle = "rgba(235,246,255,0.95)"; x.lineCap = "round";
    x.lineWidth = Math.max(1, w / 16);
    for (let i = 0; i < 6; i++) {
      x.save(); x.translate(cx, cy); x.rotate((i * TAU) / 6);
      x.beginPath();
      x.moveTo(0, 0); x.lineTo(0, -R);
      x.moveTo(0, -R * 0.55); x.lineTo(-R * 0.25, -R * 0.78);
      x.moveTo(0, -R * 0.55); x.lineTo(R * 0.25, -R * 0.78);
      x.stroke(); x.restore();
    }
  }
  function sparkle(x, w, h, color) {
    const cx = w / 2, cy = h / 2;
    x.fillStyle = color;
    x.beginPath();
    x.moveTo(cx, 0); x.quadraticCurveTo(cx, cy, w, cy); x.quadraticCurveTo(cx, cy, cx, h);
    x.quadraticCurveTo(cx, cy, 0, cy); x.quadraticCurveTo(cx, cy, cx, 0);
    x.fill();
  }
  function droplet(x, w, h) {
    const cx = w / 2, cy = h / 2, r = w / 2 - 1;
    let g = x.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
    g.addColorStop(0, "rgba(255,255,255,0.04)");
    g.addColorStop(0.7, "rgba(150,180,220,0.14)");
    g.addColorStop(1, "rgba(10,20,40,0.34)");
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill();
    g = x.createRadialGradient(cx - r * 0.35, cy - r * 0.4, 0, cx - r * 0.35, cy - r * 0.4, r * 0.55);
    g.addColorStop(0, "rgba(255,255,255,0.95)"); g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill();
    x.strokeStyle = "rgba(255,255,255,0.28)"; x.lineWidth = 0.8;
    x.beginPath(); x.arc(cx, cy, r - 0.5, Math.PI * 0.1, Math.PI * 0.9); x.stroke();
  }
  function bat(ctx, x, y, size, flap, alpha) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.translate(x, y);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#07030c";
    const s = size, lift = Math.sin(flap) * s * 0.55;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(side * s * 0.5, -s * 0.5 - lift, side * s * 1.0, -s * 0.35 - lift, side * s * 1.3, -lift * 1.2);
      ctx.quadraticCurveTo(side * s * 1.0, s * 0.05 - lift * 0.5, side * s * 0.75, s * 0.12 - lift * 0.3);
      ctx.quadraticCurveTo(side * s * 0.55, s * 0.32, side * s * 0.35, s * 0.1);
      ctx.quadraticCurveTo(side * s * 0.15, s * 0.28, 0, s * 0.18);
      ctx.fill();
    }
    ctx.beginPath(); ctx.ellipse(0, s * 0.04, s * 0.17, s * 0.28, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-s * 0.12, -s * 0.2); ctx.lineTo(-s * 0.06, -s * 0.42); ctx.lineTo(0, -s * 0.22); ctx.lineTo(s * 0.06, -s * 0.42); ctx.lineTo(s * 0.12, -s * 0.2); ctx.fill();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  const THEMES = {};

  // ---------- Осень ----------
  THEMES.autumn = {
    sprites() {
      const cols = [["#ffb347", "#d9531e"], ["#ff8a2b", "#b8321b"], ["#f4c542", "#c77d1a"], ["#e2552d", "#8f1d14"], ["#c9a227", "#7b5b12"]];
      const sharp = [], soft = [];
      cols.forEach(([a, b], i) => {
        const draw = i % 2 ? (x, w, h) => ovalLeaf(x, w, h, a, b) : (x, w, h) => mapleLeaf(x, w, h, a, b);
        sharp.push(sprite(34, 34, draw));
        soft.push(sprite(34, 34, draw, 5));
      });
      return { sharp, soft };
    },
    init() {
      this.wind = { calm: 0, soft: 9, gusty: 9 }[opts.wind];
      if (this.wind === undefined) this.wind = 9;
      this.p = [];
      for (let i = 0; i < N(11); i++) this.p.push(this.piece("back", true));
      for (let i = 0; i < N(2); i++) this.p.push(this.piece("front", true));
      this.nextGust = rnd(5, 9);
    },
    piece(layer, scatter) {
      const near = layer === "front";
      return {
        layer, near,
        x: rnd(-40, W + 40), y: scatter ? rnd(-H * 0.1, H) : rnd(-60, -10),
        size: near ? rnd(46, 70) : rnd(16, 32),
        vy: near ? rnd(34, 56) : rnd(16, 38), sway: rnd(14, 40), f: rnd(0.35, 0.9), ph: rnd(TAU),
        rot: rnd(TAU), vr: rnd(-1, 1) * (near ? 0.5 : 0.9), flut: rnd(TAU), vf: rnd(1, 2.4),
        a: near ? rnd(0.3, 0.5) : rnd(0.5, 0.9), s: Math.floor(rnd(5)), wx: 0, wy: 0,
      };
    },
    burst(x, y, n) {
      for (let i = 0; i < n; i++) {
        const p = this.piece("back", false);
        Object.assign(p, { x: x + rnd(-14, 14), y: y + rnd(-14, 14), wx: rnd(-170, 170), wy: rnd(-220, -50), burst: true, a: rnd(0.6, 0.95) });
        this.p.push(p);
      }
    },
    onMove(x, y, dx, dy) { gust(this.p, x, y, dx, dy); },
    onTap(x, y) { this.burst(x, y, 5); },
    frame(dt, t) {
      if (opts.wind === "gusty") {
        this.nextGust -= dt;
        if (this.nextGust <= 0) {
          this.nextGust = rnd(6, 11);
          const dir = Math.random() < 0.7 ? 1 : -1;
          for (const p of this.p) { p.wx = (p.wx || 0) + dir * rnd(90, 200); p.wy = (p.wy || 0) - rnd(0, 60); }
        }
      }
      for (let i = this.p.length - 1; i >= 0; i--) {
        const p = this.p[i];
        p.y += p.vy * dt;
        p.x += (this.wind + Math.sin(t * p.f + p.ph) * p.sway) * dt;
        drift(p, dt);
        p.rot += p.vr * dt;
        p.flut += p.vf * dt;
        if (p.y > H + 60 || p.x > W + 90 || p.x < -90) {
          if (p.burst) { this.p.splice(i, 1); continue; }
          Object.assign(p, this.piece(p.layer, false), { x: rnd(-80, W) });
        }
        const ctx = p.near ? fctx : bctx;
        const sp = (p.near ? sprites.soft : sprites.sharp)[p.s];
        put(ctx, sp, p.x, p.y, p.size, p.rot, p.a, Math.max(0.12, Math.cos(p.flut) * 0.55 + 0.45));
      }
    },
  };

  // ---------- Зима ----------
  THEMES.winter = {
    sprites() {
      return { dot: sprite(24, 24, glowDot("rgba(255,255,255,1)", 0.3)), dotSoft: sprite(24, 24, glowDot("rgba(255,255,255,1)", 0.3), 3), crystal: sprite(40, 40, crystal), crystalSoft: sprite(40, 40, crystal, 4) };
    },
    init() {
      this.p = [];
      for (let i = 0; i < N(26); i++) this.p.push(this.piece("back", true));
      for (let i = 0; i < N(3); i++) this.p.push(this.piece("front", true));
    },
    piece(layer, scatter) {
      const near = layer === "front";
      return {
        layer, near, kind: near ? "crystal" : Math.random() < 0.1 ? "crystal" : "dot",
        x: rnd(-20, W + 20), y: scatter ? rnd(-H * 0.1, H) : rnd(-30, -6),
        size: near ? rnd(24, 40) : rnd(3, 10),
        vy: near ? rnd(24, 40) : rnd(14, 34), sway: rnd(10, 32), f: rnd(0.3, 0.8), ph: rnd(TAU),
        rot: rnd(TAU), vr: rnd(-0.6, 0.6), a: near ? rnd(0.35, 0.6) : rnd(0.35, 0.9), wx: 0, wy: 0,
      };
    },
    onMove(x, y, dx, dy) { gust(this.p, x, y, dx, dy); },
    onTap(x, y) {
      for (let i = 0; i < 8; i++) {
        const p = this.piece("back", false);
        Object.assign(p, { kind: Math.random() < 0.3 ? "crystal" : "dot", x: x + rnd(-10, 10), y: y + rnd(-10, 10), size: rnd(5, 12), wx: rnd(-150, 150), wy: rnd(-170, -30), burst: true, a: rnd(0.6, 1) });
        this.p.push(p);
      }
    },
    frame(dt, t) {
      for (let i = this.p.length - 1; i >= 0; i--) {
        const p = this.p[i];
        p.y += p.vy * dt;
        p.x += Math.sin(t * p.f + p.ph) * p.sway * dt + 5 * dt;
        drift(p, dt);
        p.rot += p.vr * dt;
        if (p.y > H + 30 || p.x > W + 40 || p.x < -50) {
          if (p.burst) { this.p.splice(i, 1); continue; }
          Object.assign(p, this.piece(p.layer, false), { x: rnd(-40, W) });
        }
        const ctx = p.near ? fctx : bctx;
        const sp = p.kind === "crystal" ? (p.near ? sprites.crystalSoft : sprites.crystal) : p.near ? sprites.dotSoft : sprites.dot;
        put(ctx, sp, p.x, p.y, p.size, p.kind === "crystal" ? p.rot : 0, p.a);
      }
    },
  };

  // ---------- Весна ----------
  THEMES.spring = {
    sprites() {
      const sets = { sakura: [["#ffe3ee", "#ff9fc0"], ["#fff0f5", "#ffb3cd"], ["#ffd1e1", "#f06da8"]], white: [["#ffffff", "#f3e9ee"], ["#fffaf5", "#ffe6ec"], ["#ffffff", "#ffd9e4"]] };
      const cols = opts.petals === "white" ? sets.white : opts.petals === "mixed" ? sets.sakura.slice(0, 2).concat(sets.white.slice(0, 1)) : sets.sakura;
      const sharp = [], soft = [];
      cols.forEach(([a, b]) => {
        const d = (x, w, h) => petal(x, w, h, a, b);
        sharp.push(sprite(26, 30, d));
        soft.push(sprite(26, 30, d, 5));
      });
      return { sharp, soft, pollen: sprite(16, 16, glowDot("rgba(255,244,190,1)", 0.3)) };
    },
    init() {
      this.p = [];
      for (let i = 0; i < N(9); i++) this.p.push(this.piece("back", true));
      for (let i = 0; i < N(2); i++) this.p.push(this.piece("front", true));
      if (isOn("pollen")) for (let i = 0; i < N(7); i++) this.p.push(Object.assign(this.piece("back", true), { pollen: true, size: rnd(4, 8), vy: rnd(-6, 8), a: rnd(0.3, 0.7) }));
    },
    piece(layer, scatter) {
      const near = layer === "front";
      return {
        layer, near, x: rnd(-40, W + 40), y: scatter ? rnd(-H * 0.1, H) : rnd(-60, -10),
        size: near ? rnd(34, 54) : rnd(14, 26), vy: near ? rnd(24, 42) : rnd(14, 32), sway: rnd(20, 56), f: rnd(0.3, 0.8), ph: rnd(TAU),
        rot: rnd(TAU), vr: rnd(-1.2, 1.2), flut: rnd(TAU), vf: rnd(1.5, 3), a: near ? rnd(0.3, 0.5) : rnd(0.55, 0.9),
        s: Math.floor(rnd(sprites.sharp ? sprites.sharp.length : 3)), wind: rnd(8, 28), wx: 0, wy: 0,
      };
    },
    onMove(x, y, dx, dy) { gust(this.p, x, y, dx, dy); },
    onTap(x, y) {
      for (let i = 0; i < 6; i++) {
        const p = this.piece("back", false);
        Object.assign(p, { x: x + rnd(-12, 12), y: y + rnd(-12, 12), wx: rnd(-150, 150), wy: rnd(-200, -40), burst: true, a: rnd(0.65, 0.95), size: rnd(14, 24) });
        this.p.push(p);
      }
    },
    frame(dt, t) {
      for (let i = this.p.length - 1; i >= 0; i--) {
        const p = this.p[i];
        p.y += p.vy * dt;
        p.x += ((p.wind || 6) + Math.sin(t * p.f + p.ph) * p.sway) * dt;
        drift(p, dt);
        if (!p.pollen) { p.rot += p.vr * dt; p.flut += p.vf * dt; }
        if (p.y > H + 50 || p.y < -40 || p.x > W + 70 || p.x < -80) {
          if (p.burst) { this.p.splice(i, 1); continue; }
          if (p.pollen) { p.x = rnd(W); p.y = p.vy < 0 ? H + 20 : -20; }
          else Object.assign(p, this.piece(p.layer, false), { x: rnd(-60, W) });
        }
        const ctx = p.near ? fctx : bctx;
        if (p.pollen) { put(ctx, sprites.pollen, p.x, p.y, p.size, 0, p.a * (0.6 + 0.4 * Math.sin(t * 2 + p.ph))); continue; }
        const sp = (p.near ? sprites.soft : sprites.sharp)[p.s];
        put(ctx, sp, p.x, p.y, p.size, p.rot, p.a, Math.max(0.15, Math.cos(p.flut) * 0.5 + 0.5));
      }
    },
  };

  // ---------- Хэллоуин ----------
  THEMES.halloween = {
    sprites() {
      return {
        ember: sprite(24, 24, glowDot("rgba(255,150,40,1)", 0.25)),
        emberHot: sprite(24, 24, glowDot("rgba(255,220,120,1)", 0.25)),
        fly: sprite(28, 28, glowDot("rgba(222,236,160,1)", 0.2)),
        fog: sprite(256, 256, glowDot("rgba(150,110,200,0.5)", 0.1)),
        fogOrange: sprite(256, 256, glowDot("rgba(255,120,40,0.4)", 0.1)),
      };
    },
    init() {
      this.p = [];
      const life = opts.life || "flies";
      if (life !== "flies") for (let i = 0; i < N(12); i++) this.p.push({ kind: "ember", x: rnd(W), y: rnd(H), size: rnd(3, 8), vy: -rnd(14, 40), sway: rnd(8, 26), f: rnd(0.4, 1.2), ph: rnd(TAU), a: rnd(0.4, 1), hot: Math.random() < 0.3, tw: rnd(2, 6), wx: 0, wy: 0 });
      if (life !== "embers") for (let i = 0; i < N(6); i++) this.p.push({ kind: "fly", x: rnd(W), y: rnd(H * 0.35, H), size: rnd(10, 16), ang: rnd(TAU), spd: rnd(10, 24), turn: rnd(-0.8, 0.8), ph: rnd(TAU), tw: rnd(1, 2.4), wx: 0, wy: 0 });
      this.fog = [];
      if (isOn("fog")) for (let i = 0; i < 3; i++) this.fog.push({ x: rnd(W), y: H * rnd(0.6, 1), r: rnd(220, 380), vx: rnd(5, 12) * (Math.random() < 0.5 ? -1 : 1), orange: i === 1, a: rnd(0.3, 0.5) });
      this.bats = [];
      this.puffs = [];
      this.nextBat = opts.bats === "often" ? rnd(2, 4) : rnd(14, 28);
      this.batCool = 0;
    },
    spawnBat(x, y, dir) {
      // slow enough to be caught with a finger
      this.bats.push({ x, y, dir, spd: rnd(85, 125), size: rnd(20, 28), ph: rnd(TAU), bob: rnd(TAU) });
    },
    onTap(x, y) {
      // a tap on a bat catches it (that is what the tasks of an event ask for)
      const hit = this.bats.findIndex((b) => Math.hypot(b.x - x, b.y - y) < b.size * 1.6 + 26);
      if (hit >= 0) {
        this.puffs.push({ x: this.bats[hit].x, y: this.bats[hit].y, life: 1 });
        this.bats.splice(hit, 1);
        if (window.Atmosphere && window.Atmosphere.onCatch) window.Atmosphere.onCatch("bat");
        return;
      }
      if (opts.bats === "off" || this.batCool > 0) return;
      this.batCool = 7;
      this.spawnBat(x, y, x < W / 2 ? 1 : -1);
    },
    frame(dt, t) {
      this.batCool -= dt;
      for (const f of this.fog) {
        f.x += f.vx * dt;
        if (f.x < -f.r) f.x = W + f.r;
        if (f.x > W + f.r) f.x = -f.r;
        put(bctx, f.orange ? sprites.fogOrange : sprites.fog, f.x, f.y, f.r * 2, 0, f.a);
      }
      bctx.globalCompositeOperation = "lighter";
      for (const p of this.p) {
        // while a finger is on the glass the fireflies come to it
        if (ptr.down && !ptr.ui) {
          const dx = ptr.x - p.x, dy = ptr.y - p.y, d = Math.hypot(dx, dy);
          if (d < 280 && d > 18) { p.x += (dx / d) * 70 * dt; p.y += (dy / d) * 70 * dt; }
        }
        if (p.kind === "ember") {
          p.y += p.vy * dt;
          p.x += Math.sin(t * p.f + p.ph) * p.sway * dt;
          if (p.y < -20) { p.y = H + 20; p.x = rnd(W); }
          put(bctx, p.hot ? sprites.emberHot : sprites.ember, p.x, p.y, p.size * 2.4, 0, p.a * (0.55 + 0.45 * Math.sin(t * p.tw + p.ph)));
        } else {
          p.ang += p.turn * dt * Math.sin(t * 0.4 + p.ph);
          p.x += Math.cos(p.ang) * p.spd * dt;
          p.y += Math.sin(p.ang) * p.spd * dt;
          if (p.x < -30) p.x = W + 30;
          if (p.x > W + 30) p.x = -30;
          if (p.y < H * 0.2) p.ang = Math.abs(p.ang) % Math.PI;
          if (p.y > H + 20) p.ang = -Math.abs(p.ang);
          put(bctx, sprites.fly, p.x, p.y, p.size * 2.2, 0, Math.max(0, Math.sin(t * p.tw + p.ph)) * 0.95);
        }
      }
      bctx.globalCompositeOperation = "source-over";
      this.nextBat -= dt;
      if (this.nextBat <= 0 && opts.bats !== "off") {
        this.nextBat = opts.bats === "often" ? rnd(7, 13) : rnd(30, 55);
        const dir = Math.random() < 0.5 ? 1 : -1;
        this.spawnBat(dir > 0 ? -60 : W + 60, rnd(H * 0.12, H * 0.45), dir);
      }
      this.puffs = this.puffs.filter((p) => p.life > 0);
      fctx.globalCompositeOperation = "lighter";
      for (const p of this.puffs) { p.life -= dt * 1.6; put(fctx, sprites.ember, p.x, p.y, 70 * (2 - p.life), 0, Math.max(0, p.life)); }
      fctx.globalCompositeOperation = "source-over";
      this.bats = this.bats.filter((b) => b.x > -140 && b.x < W + 140 && b.y > -80);
      for (const b of this.bats) {
        b.x += b.dir * b.spd * dt;
        b.y += Math.sin(t * 2 + b.bob) * 22 * dt - 14 * dt;
        bat(fctx, b.x, b.y, b.size, t * 14 + b.ph, 0.9);
      }
    },
  };

  // ---------- Новый год: the garland you can pull ----------
  const GARLAND_COLORS = {
    warm: ["#ffd9a0", "#ffc46b", "#ffb347", "#fff1c9"],
    color: ["#ff4d5e", "#ffd166", "#4de3a1", "#6aa9ff", "#fff1c9"],
    cold: ["#e4f3ff", "#a8d4ff", "#7aaeff", "#ffffff"],
  };
  THEMES.newyear = {
    sprites() {
      const bokeh = (rgb) => sprite(64, 64, (x, w, h) => {
        const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        g.addColorStop(0, `rgba(${rgb},0.2)`); g.addColorStop(0.82, `rgba(${rgb},0.3)`); g.addColorStop(0.92, `rgba(${rgb},0.55)`); g.addColorStop(1, `rgba(${rgb},0)`);
        x.fillStyle = g; x.fillRect(0, 0, w, h);
      });
      const glow = {};
      Object.values(GARLAND_COLORS).flat().forEach((c) => { glow[c] = sprite(48, 48, glowDot(hexToRgba(c), 0.2)); });
      return {
        bokeh: [bokeh("255,205,110"), bokeh("255,240,205"), bokeh("130,190,255")],
        star: sprite(30, 30, (x, w, h) => sparkle(x, w, h, "rgba(255,244,205,1)")),
        glow,
      };
    },
    init() {
      this.p = [];
      if (isOn("bokeh")) {
        for (let i = 0; i < N(7); i++) this.p.push({ kind: "bokeh", s: Math.floor(rnd(3)), x: rnd(W), y: rnd(H), size: rnd(30, 80), vy: -rnd(4, 12), vx: rnd(-5, 5), a: rnd(0.25, 0.5), tw: rnd(0.4, 1.1), ph: rnd(TAU) });
      }
      if (opts.glitter !== "off") for (let i = 0; i < N(5); i++) this.p.push({ kind: "star", x: rnd(W), y: rnd(H), size: rnd(8, 16), tw: rnd(1, 3), ph: rnd(TAU) });
      this.glitter = [];
      this.buildGarland();
    },
    buildGarland() {
      this.nodes = []; this.cons = []; this.bulbs = []; this.grab = null; this.grabbed = false;
      this.on = opts.garland !== "off";
      if (!this.on) return;
      this.colors = GARLAND_COLORS[opts.garland] || GARLAND_COLORS.warm;
      const sat = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sat")) || 0;
      const topY = sat + 8, ARCS = 4, SEG = 8;
      for (let a = 0; a < ARCS; a++) {
        const x0 = -10 + ((W + 20) * a) / ARCS, x1 = -10 + ((W + 20) * (a + 1)) / ARCS, span = x1 - x0, rest = (span * 1.12) / SEG;
        const first = this.nodes.length;
        for (let k = 0; k <= SEG; k++) {
          const tt = k / SEG, x = x0 + span * tt, y = topY + Math.sin(tt * Math.PI) * span * 0.2;
          this.nodes.push({ x, y, px: x, py: y, k, pin: k === 0 || k === SEG });
          if (k > 0) this.cons.push([first + k - 1, first + k, rest]);
        }
        [2, 4, 6].forEach((k, j) => this.bulbs.push({ n: first + k, ci: (a * 3 + j) % this.colors.length, ex: 0, ph: rnd(TAU) }));
      }
    },
    nearest(x, y, R, bulbsOnly) {
      let best = null, bd = R;
      const list = bulbsOnly ? this.bulbs.map((b) => this.nodes[b.n]) : this.nodes;
      for (const n of list) { if (!bulbsOnly && (n.k < 2 || n.k > 6)) continue; const d = Math.hypot(n.x - x, n.y + (bulbsOnly ? 8 : 0) - y); if (d < bd) { bd = d; best = n; } }
      return best;
    },
    onDown(x, y, ui) {
      if (!this.on || ui) return;
      const n = this.nearest(x, y, 60, false);
      if (n && !n.pin) { this.grab = n; this.grabbed = true; this.tx = x; this.ty = y; }
    },
    onMove(x, y) { if (this.grab) { this.tx = x; this.ty = y; } },
    onUp() { this.grab = null; this.grabbed = false; },
    onTap(x, y) {
      if (!this.on) return;
      const n = this.nearest(x, y, 30, true);
      if (!n) return;
      const b = this.bulbs.find((q) => this.nodes[q.n] === n);
      if (b) { b.ci = (b.ci + 1) % this.colors.length; b.ex = 1; }
    },
    step(dt) {
      const g = 1300, damp = 0.992;
      for (const n of this.nodes) {
        if (n.pin) continue;
        const vx = (n.x - n.px) * damp, vy = (n.y - n.py) * damp;
        n.px = n.x; n.py = n.y;
        n.x += vx; n.y += vy + g * dt * dt;
      }
      if (this.grab) { this.grab.x += (this.tx - this.grab.x) * 0.4; this.grab.y += (this.ty - this.grab.y) * 0.4; }
      for (let it = 0; it < 4; it++) {
        for (const [i, j, rest] of this.cons) {
          const A = this.nodes[i], B = this.nodes[j];
          const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1, diff = ((d - rest) / d) * 0.5; // a little stretch, so the garland gives way to a hand
          const wa = A.pin ? 0 : 1, wb = B.pin ? 0 : 1, wsum = wa + wb;
          if (!wsum) continue;
          A.x += (dx * diff * wa) / wsum; A.y += (dy * diff * wa) / wsum;
          B.x -= (dx * diff * wb) / wsum; B.y -= (dy * diff * wb) / wsum;
        }
      }
    },
    drawGarland(dt, t) {
      for (let s = 0; s < 2; s++) this.step(dt / 2);
      const ctx = bctx;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = "#0a0f1c";
      ctx.lineWidth = 1.6; ctx.lineCap = "round";
      const per = 9;
      for (let a = 0; a < this.nodes.length / per; a++) {
        ctx.beginPath();
        ctx.moveTo(this.nodes[a * per].x, this.nodes[a * per].y);
        for (let k = 1; k < per; k++) {
          const n = this.nodes[a * per + k], m = this.nodes[a * per + k + (k < per - 1 ? 1 : 0)];
          ctx.quadraticCurveTo(n.x, n.y, (n.x + m.x) / 2, (n.y + m.y) / 2);
        }
        ctx.stroke();
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (const b of this.bulbs) {
        const n = this.nodes[b.n], sp = Math.hypot(n.x - n.px, n.y - n.py);
        b.ex = Math.min(1, Math.max(b.ex * 0.95, Math.min(1, sp * 0.06)));
        const col = this.colors[b.ci], bright = clamp(0.5 + 0.3 * Math.sin(t * 1.6 + b.ph) + b.ex * 0.8, 0.2, 1.2);
        const tilt = clamp((n.x - n.px) * 0.18, -0.6, 0.6), by = n.y + 8;
        bctx.globalCompositeOperation = "lighter";
        put(bctx, sprites.glow[col], n.x, by + 4, 34 + b.ex * 18, 0, Math.min(1, bright * 0.8));
        bctx.globalCompositeOperation = "source-over";
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        ctx.translate(n.x, n.y); ctx.rotate(tilt);
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#12182a";
        ctx.fillRect(-1.7, 0, 3.4, 4);
        ctx.fillStyle = col;
        ctx.globalAlpha = clamp(0.55 + bright * 0.45, 0.4, 1);
        ctx.beginPath(); ctx.moveTo(-2.6, 4); ctx.quadraticCurveTo(-5.4, 11, 0, 14); ctx.quadraticCurveTo(5.4, 11, 2.6, 4); ctx.closePath(); ctx.fill();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (sp > 5 && Math.random() < dt * 14) this.glitter.push({ x: n.x, y: by + 10, vx: rnd(-20, 20), vy: rnd(10, 40), life: 1.3, size: rnd(6, 11) });
      }
    },
    frame(dt, t) {
      for (const p of this.p) {
        if (p.kind === "bokeh") {
          p.y += p.vy * dt; p.x += p.vx * dt;
          if (p.y < -p.size) p.y = H + p.size;
          if (p.x < -p.size) p.x = W + p.size;
          if (p.x > W + p.size) p.x = -p.size;
          bctx.globalCompositeOperation = "lighter";
          put(bctx, sprites.bokeh[p.s], p.x, p.y, p.size, 0, p.a * (0.6 + 0.4 * Math.sin(t * p.tw + p.ph)));
          bctx.globalCompositeOperation = "source-over";
        } else {
          bctx.globalCompositeOperation = "lighter";
          put(bctx, sprites.star, p.x, p.y, p.size, Math.sin(t * 0.3 + p.ph) * 0.2, Math.pow(Math.max(0, Math.sin(t * p.tw + p.ph)), 3));
          bctx.globalCompositeOperation = "source-over";
        }
      }
      if (this.on) this.drawGarland(dt, t);
      this.glitter = this.glitter.filter((g) => g.life > 0);
      bctx.globalCompositeOperation = "lighter";
      for (const g of this.glitter) {
        g.life -= dt; g.x += g.vx * dt; g.y += g.vy * dt; g.vy += 60 * dt;
        put(bctx, sprites.star, g.x, g.y, g.size, g.life * 3, Math.max(0, g.life / 1.3));
      }
      bctx.globalCompositeOperation = "source-over";
    },
    stop() { this.nodes = []; this.grabbed = false; },
  };

  // ---------- Дождь ----------
  THEMES.rain = {
    sprites() { return { drop: sprite(40, 40, droplet) }; },
    init() {
      this.streaks = [];
      for (let i = 0; i < N(26); i++) this.streaks.push(this.streak(true));
      this.drops = [];
      if (isOn("glass")) for (let i = 0; i < Math.min(14, N(8)); i++) this.drops.push(this.glass());
      this.ripples = [];
      const old = document.getElementById("atmo-flash");
      if (old) old.remove();
      if (isOn("thunder")) {
        this.flash = document.createElement("div");
        this.flash.id = "atmo-flash";
        this.flash.setAttribute("aria-hidden", "true");
        document.body.appendChild(this.flash);
      } else this.flash = null;
      this.nextFlash = rnd(20, 40);
    },
    streak(scatter) { return { x: rnd(-60, W + 60), y: scatter ? rnd(H) : rnd(-80, -10), len: rnd(10, 24), v: rnd(620, 960), a: rnd(0.1, 0.3) }; },
    glass() { return { x: rnd(W), y: rnd(H * 0.9), r: rnd(3, 8), slide: 0, wait: rnd(0.5, 8), trail: 0, life: 0, ttl: rnd(14, 32), v: 0, fade: 1 }; },
    onMove(x, y) {
      // a finger wipes the glass
      for (const d of this.drops) if (Math.hypot(d.x - x, d.y - y) < 38) { d.ttl = 0; d.life = 1; }
    },
    onTap(x, y) {
      this.ripples.push({ x, y, r: 4, life: 1 });
      if (isOn("glass") && this.drops.length < 14) this.drops.push(Object.assign(this.glass(), { x, y, wait: 0.2 }));
    },
    frame(dt) {
      bctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      bctx.lineCap = "round";
      for (const s of this.streaks) {
        s.y += s.v * dt; s.x -= s.v * 0.16 * dt;
        if (s.y > H + 30) Object.assign(s, this.streak(false));
        bctx.globalAlpha = s.a; bctx.strokeStyle = "#cfe0f5"; bctx.lineWidth = 1;
        bctx.beginPath(); bctx.moveTo(s.x, s.y); bctx.lineTo(s.x + s.len * 0.16, s.y - s.len); bctx.stroke();
      }
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      fctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      for (const d of this.drops) {
        d.life += dt;
        if (d.wait > 0) d.wait -= dt;
        else if (d.slide <= 0 && Math.random() < dt * 0.12) { d.slide = rnd(40, 200); d.v = rnd(40, 120); d.trail = d.y; }
        if (d.slide > 0) { const dy = d.v * dt; d.y += dy; d.slide -= dy; d.v *= 0.995; if (d.slide <= 0) d.wait = rnd(2, 9); }
        if (d.life > d.ttl) d.fade -= dt * (d.ttl === 0 ? 3 : 0.8);
        if (d.fade <= 0 || d.y > H + 20) Object.assign(d, this.glass(), { y: rnd(H * 0.7), life: 0 });
        if (d.slide > 0 || d.trail) {
          const g = fctx.createLinearGradient(0, d.trail, 0, d.y);
          g.addColorStop(0, "rgba(180,210,245,0)"); g.addColorStop(1, "rgba(180,210,245,0.18)");
          fctx.globalAlpha = d.fade; fctx.strokeStyle = g; fctx.lineWidth = Math.max(1, d.r * 0.5);
          fctx.beginPath(); fctx.moveTo(d.x, d.trail); fctx.lineTo(d.x, d.y); fctx.stroke();
        }
      }
      this.ripples = this.ripples.filter((r) => r.life > 0);
      for (const r of this.ripples) {
        r.life -= dt * 1.1; r.r += dt * 90;
        fctx.globalAlpha = Math.max(0, r.life) * 0.5; fctx.strokeStyle = "#cfe0f5"; fctx.lineWidth = 1.4;
        fctx.beginPath(); fctx.arc(r.x, r.y, r.r, 0, TAU); fctx.stroke();
        fctx.globalAlpha = Math.max(0, r.life) * 0.25;
        fctx.beginPath(); fctx.arc(r.x, r.y, r.r * 0.62, 0, TAU); fctx.stroke();
      }
      fctx.setTransform(1, 0, 0, 1, 0, 0);
      for (const d of this.drops) put(fctx, sprites.drop, d.x, d.y, d.r * 2.2, 0, d.fade);
      if (this.flash) {
        this.nextFlash -= dt;
        if (this.nextFlash <= 0) {
          this.nextFlash = rnd(24, 50);
          const f = this.flash;
          f.classList.remove("go"); void f.offsetWidth; f.classList.add("go");
        }
      }
    },
    stop() { const f = document.getElementById("atmo-flash"); if (f) f.remove(); },
  };

  // ---------- Звёздная ночь ----------
  THEMES.night = {
    sprites() { return { dot: sprite(16, 16, glowDot("rgba(255,255,255,1)", 0.25)), blue: sprite(16, 16, glowDot("rgba(170,200,255,1)", 0.25)), warm: sprite(16, 16, glowDot("rgba(255,225,190,1)", 0.25)) }; },
    init() {
      this.stars = [];
      for (let i = 0; i < N(70); i++) this.stars.push({ x: rnd(W), y: rnd(H), size: Math.random() < 0.07 ? rnd(5, 8) : rnd(1.6, 3.6), tw: rnd(0.6, 2.4), ph: rnd(TAU), s: pick(["dot", "dot", "blue", "warm"]), a: rnd(0.35, 1), boost: 0 });
      this.cons = [];
      if (isOn("cons")) {
        for (let c = 0; c < 2; c++) {
          const ox = rnd(W * 0.1, W * 0.7), oy = rnd(H * 0.05, H * 0.7), pts = [];
          let x = ox, y = oy;
          for (let i = 0; i < 5 + Math.floor(rnd(2)); i++) { pts.push([x, y]); x += rnd(26, 62) * (Math.random() < 0.7 ? 1 : -1); y += rnd(-36, 40); }
          this.cons.push(pts);
        }
      }
      this.meteors = [];
      this.links = []; // lines that the finger draws between stars, and fade
      this.nextMeteor = opts.meteors === "often" ? rnd(3, 6) : rnd(8, 16);
    },
    near(x, y, n, R) {
      return this.stars.map((s) => ({ s, d: Math.hypot(s.x - x, s.y - y) })).filter((o) => o.d < R).sort((a, b) => a.d - b.d).slice(0, n);
    },
    onMove(x, y) {
      if (!ptr.down || ptr.ui) return;
      for (const o of this.near(x, y, 3, 110)) { o.s.boost = 1; this.links.push({ x1: x, y1: y, x2: o.s.x, y2: o.s.y, life: 1 }); }
    },
    onTap(x, y) {
      for (const o of this.near(x, y, 1, 90)) o.s.boost = 2.2;
      if (opts.meteors !== "off") this.meteors.push({ x: rnd(W * 0.5, W * 1.05), y: rnd(-20, H * 0.25), v: rnd(520, 760), life: 0 });
    },
    frame(dt, t) {
      bctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      bctx.strokeStyle = "rgba(190,210,255,0.16)"; bctx.lineWidth = 0.8;
      for (const pts of this.cons) {
        bctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 0.4 + pts[0][0]);
        bctx.beginPath(); pts.forEach(([x, y], i) => (i ? bctx.lineTo(x, y) : bctx.moveTo(x, y))); bctx.stroke();
      }
      this.links = this.links.filter((l) => l.life > 0);
      bctx.strokeStyle = "rgba(210,225,255,0.9)";
      for (const l of this.links) {
        l.life -= dt * 1.4;
        bctx.globalAlpha = Math.max(0, l.life) * 0.5; bctx.lineWidth = 0.9;
        bctx.beginPath(); bctx.moveTo(l.x1, l.y1); bctx.lineTo(l.x2, l.y2); bctx.stroke();
      }
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      for (const s of this.stars) {
        s.boost = Math.max(0, s.boost - dt * 0.9);
        put(bctx, sprites[s.s], s.x, s.y, s.size * (2.4 + s.boost * 2), 0, Math.min(1, s.a * (0.45 + 0.55 * Math.sin(t * s.tw + s.ph)) + s.boost * 0.5));
      }
      for (const pts of this.cons) for (const [x, y] of pts) put(bctx, sprites.dot, x, y, 10, 0, 0.85);
      this.nextMeteor -= dt;
      if (this.nextMeteor <= 0 && opts.meteors !== "off") {
        this.nextMeteor = opts.meteors === "often" ? rnd(4, 9) : rnd(14, 26);
        this.meteors.push({ x: rnd(W * 0.35, W * 1.05), y: rnd(-20, H * 0.3), v: rnd(520, 760), life: 0 });
      }
      this.meteors = this.meteors.filter((m) => m.life < 1.1);
      fctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      for (const m of this.meteors) {
        m.life += dt; m.x -= m.v * dt * 0.9; m.y += m.v * dt * 0.5;
        const a = Math.max(0, 1 - m.life / 1.1);
        const g = fctx.createLinearGradient(m.x, m.y, m.x + 130, m.y - 72);
        g.addColorStop(0, `rgba(255,255,255,${0.95 * a})`); g.addColorStop(1, "rgba(160,190,255,0)");
        fctx.strokeStyle = g; fctx.lineWidth = 2; fctx.lineCap = "round";
        fctx.beginPath(); fctx.moveTo(m.x, m.y); fctx.lineTo(m.x + 130, m.y - 72); fctx.stroke();
      }
      fctx.setTransform(1, 0, 0, 1, 0, 0);
    },
  };

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
