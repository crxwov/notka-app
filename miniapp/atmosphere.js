/* «Атмосфера» — seasonal and nature themes: the air of the app.
 *
 * Each theme gives the light a palette (done in app.js / atmosphere.css),
 * and this file gives it weather: leaves, snow, petals, embers, rain,
 * stars. Two canvases carry it — one behind the interface and one in front
 * of it (a few big, soft pieces near the glass, for depth). Everything is
 * drawn from small sprites made here, so no image files are needed.
 *
 *   Atmosphere.set("autumn", 1)   // theme id, density (0 = still air)
 *   Atmosphere.set("none")        // off
 */
(function () {
  "use strict";

  const TAU = Math.PI * 2;
  const rnd = (a, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  let back = null, front = null, bctx = null, fctx = null;
  let W = 0, H = 0, DPR = 1;
  let raf = 0, lastT = 0, time = 0;
  let id = "none", density = 1, theme = null;
  let sprites = {};

  // ---------- canvases ----------
  function ensureCanvases() {
    if (back) return;
    back = document.createElement("canvas");
    back.id = "atmo-back";
    back.setAttribute("aria-hidden", "true");
    const light = document.getElementById("light");
    // behind the interface, above the light's own shapes
    (light || document.body).appendChild(back);
    front = document.createElement("canvas");
    front.id = "atmo-front";
    front.setAttribute("aria-hidden", "true");
    document.body.appendChild(front);
    bctx = back.getContext("2d");
    fctx = front.getContext("2d");
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", () => { if (document.hidden) stopLoop(); else if (theme) startLoop(); });
  }
  function resize() {
    if (!back) return;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    [back, front].forEach((c) => { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); });
    if (theme) { sprites = theme.sprites ? theme.sprites() : {}; theme.init(); }
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
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    x.fillStyle = g;
    x.fill();
    x.strokeStyle = "rgba(60,20,0,0.35)";
    x.lineWidth = 0.7;
    x.beginPath();
    x.moveTo(cx, cy + R * 0.85);
    x.lineTo(cx, cy - R * 0.7);
    x.stroke();
  }
  function ovalLeaf(x, w, h, c1, c2) {
    x.beginPath();
    x.moveTo(w / 2, 1);
    x.bezierCurveTo(w * 0.98, h * 0.3, w * 0.9, h * 0.8, w / 2, h - 1);
    x.bezierCurveTo(w * 0.1, h * 0.8, w * 0.02, h * 0.3, w / 2, 1);
    const g = x.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    x.fillStyle = g;
    x.fill();
    x.strokeStyle = "rgba(60,20,0,0.3)";
    x.lineWidth = 0.7;
    x.beginPath();
    x.moveTo(w / 2, 3);
    x.lineTo(w / 2, h - 2);
    x.stroke();
  }
  function petal(x, w, h, c1, c2) {
    x.beginPath();
    x.moveTo(w / 2, h);
    x.bezierCurveTo(-w * 0.2, h * 0.7, w * 0.05, h * 0.05, w * 0.42, h * 0.08);
    x.lineTo(w * 0.5, h * 0.2);
    x.lineTo(w * 0.58, h * 0.08);
    x.bezierCurveTo(w * 0.95, h * 0.05, w * 1.2, h * 0.7, w / 2, h);
    const g = x.createLinearGradient(w / 2, 0, w / 2, h);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    x.fillStyle = g;
    x.fill();
  }
  function crystal(x, w, h) {
    const cx = w / 2, cy = h / 2, R = w / 2 - 1;
    x.strokeStyle = "rgba(235,246,255,0.95)";
    x.lineCap = "round";
    x.lineWidth = Math.max(1, w / 16);
    for (let i = 0; i < 6; i++) {
      x.save();
      x.translate(cx, cy);
      x.rotate((i * TAU) / 6);
      x.beginPath();
      x.moveTo(0, 0);
      x.lineTo(0, -R);
      x.moveTo(0, -R * 0.55);
      x.lineTo(-R * 0.25, -R * 0.78);
      x.moveTo(0, -R * 0.55);
      x.lineTo(R * 0.25, -R * 0.78);
      x.stroke();
      x.restore();
    }
  }
  function sparkle(x, w, h, color) {
    const cx = w / 2, cy = h / 2;
    x.fillStyle = color;
    x.beginPath();
    x.moveTo(cx, 0);
    x.quadraticCurveTo(cx, cy, w, cy);
    x.quadraticCurveTo(cx, cy, cx, h);
    x.quadraticCurveTo(cx, cy, 0, cy);
    x.quadraticCurveTo(cx, cy, cx, 0);
    x.fill();
  }
  function droplet(x, w, h) {
    // a drop on glass: clear in the middle, dark at the lower edge, bright at the upper left
    const cx = w / 2, cy = h / 2, r = w / 2 - 1;
    let g = x.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
    g.addColorStop(0, "rgba(255,255,255,0.04)");
    g.addColorStop(0.7, "rgba(150,180,220,0.14)");
    g.addColorStop(1, "rgba(10,20,40,0.34)");
    x.fillStyle = g;
    x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill();
    g = x.createRadialGradient(cx - r * 0.35, cy - r * 0.4, 0, cx - r * 0.35, cy - r * 0.4, r * 0.55);
    g.addColorStop(0, "rgba(255,255,255,0.95)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill();
    x.strokeStyle = "rgba(255,255,255,0.28)";
    x.lineWidth = 0.8;
    x.beginPath(); x.arc(cx, cy, r - 0.5, Math.PI * 0.1, Math.PI * 0.9); x.stroke();
  }
  function bat(ctx, x, y, size, flap, alpha) {
    // a silhouette: body and two wings that beat
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

  // ---------- themes ----------
  // every theme: init() builds its pieces, frame(dt, t) moves and draws them
  const N = (base) => Math.round(base * density);

  const THEMES = {};

  // ---- Осень ----
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
      this.p = [];
      for (let i = 0; i < N(30); i++) this.p.push(this.piece("back", true));
      for (let i = 0; i < N(6); i++) this.p.push(this.piece("front", true));
    },
    piece(layer, scatter) {
      const near = layer === "front";
      return {
        layer, near,
        x: rnd(-40, W + 40), y: scatter ? rnd(-H * 0.1, H) : rnd(-60, -10),
        size: near ? rnd(46, 74) : rnd(16, 34),
        vy: near ? rnd(36, 60) : rnd(16, 40), sway: rnd(14, 44), f: rnd(0.35, 0.9), ph: rnd(TAU),
        rot: rnd(TAU), vr: rnd(-1, 1) * (near ? 0.5 : 0.9), flut: rnd(TAU), vf: rnd(1, 2.4),
        a: near ? rnd(0.35, 0.6) : rnd(0.5, 0.95), s: Math.floor(rnd(5)),
        wind: rnd(6, 22),
      };
    },
    frame(dt, t) {
      for (const p of this.p) {
        p.y += p.vy * dt;
        p.x += (p.wind + Math.sin(t * p.f + p.ph) * p.sway) * dt;
        p.rot += p.vr * dt;
        p.flut += p.vf * dt;
        if (p.y > H + 60 || p.x > W + 80) Object.assign(p, this.piece(p.layer, false), { x: rnd(-80, W) });
        const ctx = p.near ? fctx : bctx;
        const sp = (p.near ? sprites.soft : sprites.sharp)[p.s];
        put(ctx, sp, p.x, p.y, p.size, p.rot, p.a, Math.max(0.12, Math.cos(p.flut) * 0.55 + 0.45));
      }
    },
  };

  // ---- Зима ----
  THEMES.winter = {
    sprites() {
      const dot = sprite(24, 24, glowDot("rgba(255,255,255,1)", 0.3));
      const dotSoft = sprite(24, 24, glowDot("rgba(255,255,255,1)", 0.3), 3);
      return { dot, dotSoft, crystal: sprite(40, 40, crystal), crystalSoft: sprite(40, 40, crystal, 4) };
    },
    init() {
      this.p = [];
      for (let i = 0; i < N(70); i++) this.p.push(this.piece("back", true));
      for (let i = 0; i < N(6); i++) this.p.push(this.piece("front", true));
    },
    piece(layer, scatter) {
      const near = layer === "front";
      return {
        layer, near, kind: near ? "crystal" : Math.random() < 0.08 ? "crystal" : "dot",
        x: rnd(-20, W + 20), y: scatter ? rnd(-H * 0.1, H) : rnd(-30, -6),
        size: near ? rnd(26, 46) : rnd(3, 11),
        vy: near ? rnd(26, 44) : rnd(14, 38), sway: rnd(10, 36), f: rnd(0.3, 0.8), ph: rnd(TAU),
        rot: rnd(TAU), vr: rnd(-0.6, 0.6), a: near ? rnd(0.4, 0.7) : rnd(0.35, 0.95),
      };
    },
    frame(dt, t) {
      for (const p of this.p) {
        p.y += p.vy * dt;
        p.x += Math.sin(t * p.f + p.ph) * p.sway * dt + 6 * dt;
        p.rot += p.vr * dt;
        if (p.y > H + 30 || p.x > W + 40) Object.assign(p, this.piece(p.layer, false), { x: rnd(-40, W) });
        const ctx = p.near ? fctx : bctx;
        const sp = p.kind === "crystal" ? (p.near ? sprites.crystalSoft : sprites.crystal) : p.near ? sprites.dotSoft : sprites.dot;
        put(ctx, sp, p.x, p.y, p.size, p.kind === "crystal" ? p.rot : 0, p.a);
      }
    },
  };

  // ---- Весна ----
  THEMES.spring = {
    sprites() {
      const cols = [["#ffe3ee", "#ff9fc0"], ["#fff0f5", "#ffb3cd"], ["#ffd1e1", "#f06da8"]];
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
      for (let i = 0; i < N(22); i++) this.p.push(this.piece("back", true));
      for (let i = 0; i < N(4); i++) this.p.push(this.piece("front", true));
      for (let i = 0; i < N(16); i++) this.p.push(Object.assign(this.piece("back", true), { pollen: true, size: rnd(4, 9), vy: rnd(-6, 8), a: rnd(0.3, 0.8) }));
    },
    piece(layer, scatter) {
      const near = layer === "front";
      return {
        layer, near, x: rnd(-40, W + 40), y: scatter ? rnd(-H * 0.1, H) : rnd(-60, -10),
        size: near ? rnd(36, 58) : rnd(14, 28), vy: near ? rnd(26, 46) : rnd(14, 34), sway: rnd(20, 60), f: rnd(0.3, 0.8), ph: rnd(TAU),
        rot: rnd(TAU), vr: rnd(-1.2, 1.2), flut: rnd(TAU), vf: rnd(1.5, 3), a: near ? rnd(0.35, 0.6) : rnd(0.55, 0.95), s: Math.floor(rnd(3)), wind: rnd(10, 34),
      };
    },
    frame(dt, t) {
      for (const p of this.p) {
        p.y += p.vy * dt;
        p.x += ((p.wind || 6) + Math.sin(t * p.f + p.ph) * p.sway) * dt;
        if (!p.pollen) { p.rot += p.vr * dt; p.flut += p.vf * dt; }
        if (p.y > H + 50 || p.y < -40 || p.x > W + 70) {
          const fresh = this.piece(p.layer, false);
          Object.assign(p, p.pollen ? { x: rnd(W), y: p.vy < 0 ? H + 20 : -20 } : fresh, p.pollen ? {} : { x: rnd(-60, W) });
        }
        const ctx = p.near ? fctx : bctx;
        if (p.pollen) { put(ctx, sprites.pollen, p.x, p.y, p.size, 0, p.a * (0.6 + 0.4 * Math.sin(t * 2 + p.ph))); continue; }
        const sp = (p.near ? sprites.soft : sprites.sharp)[p.s];
        const fl = Math.cos(p.flut) * 0.5 + 0.5;
        put(ctx, sp, p.x, p.y, p.size, p.rot, p.a, Math.max(0.15, fl));
      }
    },
  };

  // ---- Хэллоуин ----
  THEMES.halloween = {
    sprites() {
      return {
        ember: sprite(24, 24, glowDot("rgba(255,150,40,1)", 0.25)),
        emberHot: sprite(24, 24, glowDot("rgba(255,220,120,1)", 0.25)),
        fly: sprite(28, 28, glowDot("rgba(190,255,120,1)", 0.2)),
        fog: sprite(256, 256, glowDot("rgba(150,110,200,0.5)", 0.1)),
        fogOrange: sprite(256, 256, glowDot("rgba(255,120,40,0.4)", 0.1)),
      };
    },
    init() {
      this.p = [];
      for (let i = 0; i < N(34); i++) this.p.push({ kind: "ember", x: rnd(W), y: rnd(H), size: rnd(3, 9), vy: -rnd(14, 46), sway: rnd(8, 30), f: rnd(0.4, 1.2), ph: rnd(TAU), a: rnd(0.4, 1), hot: Math.random() < 0.3, tw: rnd(2, 6) });
      for (let i = 0; i < N(10); i++) this.p.push({ kind: "fly", x: rnd(W), y: rnd(H * 0.35, H), size: rnd(10, 18), ang: rnd(TAU), spd: rnd(10, 26), turn: rnd(-0.8, 0.8), ph: rnd(TAU), tw: rnd(1, 2.4) });
      this.fog = [];
      for (let i = 0; i < 5; i++) this.fog.push({ x: rnd(W), y: H * rnd(0.55, 1), r: rnd(220, 420), vx: rnd(6, 16) * (Math.random() < 0.5 ? -1 : 1), orange: i === 2, a: rnd(0.35, 0.6) });
      this.bats = [];
      this.nextBat = 3;
    },
    frame(dt, t) {
      for (const f of this.fog) {
        f.x += f.vx * dt;
        if (f.x < -f.r) f.x = W + f.r;
        if (f.x > W + f.r) f.x = -f.r;
        put(bctx, f.orange ? sprites.fogOrange : sprites.fog, f.x, f.y, f.r * 2, 0, f.a * (density ? 1 : 0));
      }
      bctx.globalCompositeOperation = "lighter";
      for (const p of this.p) {
        if (p.kind === "ember") {
          p.y += p.vy * dt;
          p.x += Math.sin(t * p.f + p.ph) * p.sway * dt;
          if (p.y < -20) { p.y = H + 20; p.x = rnd(W); }
          put(bctx, p.hot ? sprites.emberHot : sprites.ember, p.x, p.y, p.size * 2.4, 0, p.a * (0.55 + 0.45 * Math.sin(t * p.tw + p.ph)));
        } else {
          p.ang += p.turn * dt * Math.sin(t * 0.4 + p.ph);
          p.x += Math.cos(p.ang) * p.spd * dt;
          p.y += Math.sin(p.ang) * p.spd * dt;
          if (p.x < -30) p.x = W + 30; if (p.x > W + 30) p.x = -30;
          if (p.y < H * 0.25) p.ang = Math.abs(p.ang) % Math.PI; if (p.y > H + 20) p.ang = -Math.abs(p.ang);
          put(bctx, sprites.fly, p.x, p.y, p.size * 2.2, 0, Math.max(0, Math.sin(t * p.tw + p.ph)) * 0.95);
        }
      }
      bctx.globalCompositeOperation = "source-over";
      // a bat now and then, across the upper part of the screen
      this.nextBat -= dt;
      if (this.nextBat <= 0 && density > 0) {
        this.nextBat = rnd(9, 20);
        const dir = Math.random() < 0.5 ? 1 : -1;
        this.bats.push({ x: dir > 0 ? -60 : W + 60, y: rnd(H * 0.12, H * 0.4), dir, spd: rnd(110, 170), size: rnd(18, 30), ph: rnd(TAU), bob: rnd(TAU) });
      }
      this.bats = this.bats.filter((b) => b.x > -120 && b.x < W + 120);
      for (const b of this.bats) {
        b.x += b.dir * b.spd * dt;
        b.y += Math.sin(t * 2 + b.bob) * 20 * dt;
        bat(fctx, b.x, b.y, b.size, t * 14 + b.ph, 0.9);
      }
    },
  };


  // the garland: a wire along the top of the screen with lit bulbs, in the light's layer
  function buildGarland() {
    const old = document.getElementById("atmo-garland");
    if (old) old.remove();
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.id = "atmo-garland";
    svg.setAttribute("viewBox", "0 0 400 70");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    const colors = ["#ff4d5e", "#ffd166", "#4de3a1", "#6aa9ff", "#fff1c9"];
    let wire = "M-4 6";
    const bulbs = [];
    for (let a = 0; a < 4; a++) {
      const x0 = a * 100, x1 = x0 + 100, cx = x0 + 50, sag = 30;
      wire += ` Q${cx} ${6 + sag} ${x1} 6`;
      for (const t of [0.22, 0.5, 0.78]) {
        const mt = 1 - t;
        bulbs.push([mt * mt * x0 + 2 * mt * t * cx + t * t * x1, mt * mt * 6 + 2 * mt * t * (6 + sag) + t * t * 6]);
      }
    }
    svg.innerHTML = `<path d="${wire}" fill="none" stroke="#0a0f1c" stroke-width="1.6" stroke-linecap="round"/>` + bulbs.map(([x, y], i) => {
      const c = colors[i % colors.length];
      return `<g class="gb" style="animation-delay:${((i * 0.37) % 2.4).toFixed(2)}s"><circle cx="${x.toFixed(1)}" cy="${(y + 9).toFixed(1)}" r="9" fill="${c}" opacity=".28"/><rect x="${(x - 1.6).toFixed(1)}" y="${(y + 0.5).toFixed(1)}" width="3.2" height="3.4" rx=".8" fill="#12182a"/><path d="M${(x - 2.6).toFixed(1)} ${(y + 3.6).toFixed(1)} q-1.4 6 2.6 8.6 q4-2.6 2.6-8.6z" fill="${c}"/></g>`;
    }).join("");
    (document.getElementById("light") || document.body).appendChild(svg);
  }

  // ---- Новый год ----
  THEMES.newyear = {
    sprites() {
      const bokeh = (rgb) => sprite(64, 64, (x, w, h) => {
        const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        g.addColorStop(0, `rgba(${rgb},0.22)`);
        g.addColorStop(0.82, `rgba(${rgb},0.34)`);
        g.addColorStop(0.92, `rgba(${rgb},0.6)`);
        g.addColorStop(1, `rgba(${rgb},0)`);
        x.fillStyle = g;
        x.fillRect(0, 0, w, h);
      });
      return {
        bokeh: [bokeh("255,205,110"), bokeh("255,240,205"), bokeh("130,190,255"), bokeh("255,150,170")],
        bokehSoft: [sprite(64, 64, glowDot("rgba(255,205,110,0.8)", 0.3), 4), sprite(64, 64, glowDot("rgba(255,240,205,0.8)", 0.3), 4)],
        star: sprite(30, 30, (x, w, h) => sparkle(x, w, h, "rgba(255,244,205,1)")),
        flake: sprite(14, 14, glowDot("rgba(255,244,215,1)", 0.3)),
      };
    },
    stop() { const g = document.getElementById("atmo-garland"); if (g) g.remove(); },
    init() {
      buildGarland();
      this.p = [];
      for (let i = 0; i < N(16); i++) this.p.push({ kind: "bokeh", near: false, s: Math.floor(rnd(4)), x: rnd(W), y: rnd(H), size: rnd(30, 84), vy: -rnd(4, 14), vx: rnd(-6, 6), a: rnd(0.25, 0.6), tw: rnd(0.4, 1.2), ph: rnd(TAU) });
      for (let i = 0; i < N(3); i++) this.p.push({ kind: "bokeh", near: true, s: Math.floor(rnd(2)), x: rnd(W), y: rnd(H), size: rnd(110, 170), vy: -rnd(4, 10), vx: rnd(-8, 8), a: rnd(0.2, 0.4), tw: rnd(0.3, 0.7), ph: rnd(TAU) });
      for (let i = 0; i < N(14); i++) this.p.push({ kind: "star", x: rnd(W), y: rnd(H), size: rnd(8, 20), a: 1, tw: rnd(1, 3), ph: rnd(TAU), vy: 0, vx: 0 });
      for (let i = 0; i < N(34); i++) this.p.push({ kind: "flake", x: rnd(W), y: rnd(H), size: rnd(3, 8), vy: rnd(14, 36), sway: rnd(10, 30), f: rnd(0.3, 0.8), ph: rnd(TAU), a: rnd(0.4, 0.9) });
    },
    frame(dt, t) {
      for (const p of this.p) {
        if (p.kind === "bokeh") {
          p.y += p.vy * dt; p.x += p.vx * dt;
          if (p.y < -p.size) p.y = H + p.size;
          if (p.x < -p.size) p.x = W + p.size; if (p.x > W + p.size) p.x = -p.size;
          const tw = 0.6 + 0.4 * Math.sin(t * p.tw + p.ph);
          bctx.globalCompositeOperation = "lighter";
          if (p.near) { fctx.globalCompositeOperation = "lighter"; put(fctx, sprites.bokehSoft[p.s], p.x, p.y, p.size, 0, p.a * tw); fctx.globalCompositeOperation = "source-over"; }
          else put(bctx, sprites.bokeh[p.s], p.x, p.y, p.size, 0, p.a * tw);
          bctx.globalCompositeOperation = "source-over";
        } else if (p.kind === "star") {
          bctx.globalCompositeOperation = "lighter";
          put(bctx, sprites.star, p.x, p.y, p.size, Math.sin(t * 0.3 + p.ph) * 0.2, Math.pow(Math.max(0, Math.sin(t * p.tw + p.ph)), 3));
          bctx.globalCompositeOperation = "source-over";
        } else {
          p.y += p.vy * dt; p.x += Math.sin(t * p.f + p.ph) * p.sway * dt;
          if (p.y > H + 10) { p.y = -10; p.x = rnd(W); }
          put(bctx, sprites.flake, p.x, p.y, p.size, 0, p.a);
        }
      }
    },
  };

  // ---- Дождь ----
  THEMES.rain = {
    sprites() { return { drop: sprite(40, 40, droplet) }; },
    init() {
      this.streaks = [];
      for (let i = 0; i < N(70); i++) this.streaks.push(this.streak(true));
      this.drops = [];
      for (let i = 0; i < N(16); i++) this.drops.push(this.glass(true));
      this.flash = document.getElementById("atmo-flash") || (() => { const f = document.createElement("div"); f.id = "atmo-flash"; f.setAttribute("aria-hidden", "true"); document.body.appendChild(f); return f; })();
      this.nextFlash = rnd(12, 30);
    },
    streak(scatter) { return { x: rnd(-60, W + 60), y: scatter ? rnd(H) : rnd(-80, -10), len: rnd(10, 26), v: rnd(620, 980), a: rnd(0.1, 0.32) }; },
    glass(scatter) { return { x: rnd(W), y: rnd(H * 0.9), r: rnd(3, 8.5), slide: 0, wait: rnd(0.5, 8), trail: 0, life: 0, ttl: rnd(14, 32), v: 0, fade: 1, a: 1 }; },
    frame(dt, t) {
      bctx.lineCap = "round";
      bctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      for (const s of this.streaks) {
        s.y += s.v * dt; s.x -= s.v * 0.16 * dt;
        if (s.y > H + 30) Object.assign(s, this.streak(false));
        bctx.globalAlpha = s.a;
        bctx.strokeStyle = "#cfe0f5";
        bctx.lineWidth = 1;
        bctx.beginPath(); bctx.moveTo(s.x, s.y); bctx.lineTo(s.x + s.len * 0.16, s.y - s.len); bctx.stroke();
      }
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      fctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      for (const d of this.drops) {
        d.life += dt;
        if (d.wait > 0) d.wait -= dt;
        else if (d.slide <= 0 && Math.random() < dt * 0.12) { d.slide = rnd(40, 200); d.v = rnd(40, 120); d.trail = d.y; }
        if (d.slide > 0) { const dy = d.v * dt; d.y += dy; d.slide -= dy; d.v *= 0.995; d.r *= 0.9995; if (d.slide <= 0) d.wait = rnd(2, 9); }
        if (d.life > d.ttl) d.fade -= dt * 0.8;
        if (d.fade <= 0 || d.y > H + 20) { Object.assign(d, this.glass(false), { y: rnd(H * 0.7), life: 0 }); }
        if (d.slide > 0 || d.trail) {
          const g = fctx.createLinearGradient(0, d.trail, 0, d.y);
          g.addColorStop(0, "rgba(180,210,245,0)");
          g.addColorStop(1, "rgba(180,210,245,0.18)");
          fctx.globalAlpha = d.fade;
          fctx.strokeStyle = g; fctx.lineWidth = Math.max(1, d.r * 0.5);
          fctx.beginPath(); fctx.moveTo(d.x, d.trail); fctx.lineTo(d.x, d.y); fctx.stroke();
        }
      }
      fctx.setTransform(1, 0, 0, 1, 0, 0);
      for (const d of this.drops) put(fctx, sprites.drop, d.x, d.y, d.r * 2.2, 0, d.fade);
      this.nextFlash -= dt;
      if (this.nextFlash <= 0 && density > 0) {
        this.nextFlash = rnd(18, 42);
        const f = this.flash;
        f.classList.remove("go"); void f.offsetWidth; f.classList.add("go");
      }
    },
    stop() { const f = document.getElementById("atmo-flash"); if (f) f.remove(); },
  };

  // ---- Звёздная ночь ----
  THEMES.night = {
    sprites() { return { dot: sprite(16, 16, glowDot("rgba(255,255,255,1)", 0.25)), blue: sprite(16, 16, glowDot("rgba(170,200,255,1)", 0.25)), warm: sprite(16, 16, glowDot("rgba(255,225,190,1)", 0.25)) }; },
    init() {
      this.stars = [];
      for (let i = 0; i < N(110); i++) this.stars.push({ x: rnd(W), y: rnd(H), size: Math.random() < 0.08 ? rnd(5, 9) : rnd(1.6, 4), tw: rnd(0.6, 2.4), ph: rnd(TAU), s: pick(["dot", "dot", "blue", "warm"]), a: rnd(0.35, 1) });
      // three constellations: a few bright stars joined by thin lines
      this.cons = [];
      for (let c = 0; c < 3 && density > 0; c++) {
        const ox = rnd(W * 0.1, W * 0.7), oy = rnd(H * 0.05, H * 0.75), pts = [];
        let x = ox, y = oy;
        for (let i = 0; i < 5 + Math.floor(rnd(2)); i++) { pts.push([x, y]); x += rnd(26, 62) * (Math.random() < 0.7 ? 1 : -1); y += rnd(-36, 40); }
        this.cons.push(pts);
      }
      this.meteors = [];
      this.nextMeteor = rnd(2, 6);
    },
    frame(dt, t) {
      bctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      bctx.strokeStyle = "rgba(190,210,255,0.16)";
      bctx.lineWidth = 0.8;
      for (const pts of this.cons) {
        bctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 0.4 + pts[0][0]);
        bctx.beginPath(); pts.forEach(([x, y], i) => (i ? bctx.lineTo(x, y) : bctx.moveTo(x, y))); bctx.stroke();
      }
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      for (const s of this.stars) put(bctx, sprites[s.s], s.x, s.y, s.size * 2.4, 0, s.a * (0.45 + 0.55 * Math.sin(t * s.tw + s.ph)));
      for (const pts of this.cons) for (const [x, y] of pts) put(bctx, sprites.dot, x, y, 11, 0, 0.9);
      this.nextMeteor -= dt;
      if (this.nextMeteor <= 0 && density > 0) {
        this.nextMeteor = rnd(6, 13);
        this.meteors.push({ x: rnd(W * 0.35, W * 1.05), y: rnd(-20, H * 0.3), v: rnd(520, 760), life: 0 });
      }
      this.meteors = this.meteors.filter((m) => m.life < 1.1);
      fctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      for (const m of this.meteors) {
        m.life += dt;
        m.x -= m.v * dt * 0.9; m.y += m.v * dt * 0.5;
        const a = Math.max(0, 1 - m.life / 1.1);
        const g = fctx.createLinearGradient(m.x, m.y, m.x + 130, m.y - 72);
        g.addColorStop(0, `rgba(255,255,255,${0.95 * a})`);
        g.addColorStop(1, "rgba(160,190,255,0)");
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

  function set(next, dens) {
    ensureCanvases();
    dens = typeof dens === "number" ? dens : density;
    next = next || "none";
    if (next === id && dens === density) return;
    density = dens;
    if (theme && theme.stop) theme.stop();
    stopLoop();
    id = next || "none";
    theme = THEMES[id] || null;
    document.body.classList.toggle("has-atmo-air", !!theme);
    if (!theme) { bctx.clearRect(0, 0, back.width, back.height); fctx.clearRect(0, 0, front.width, front.height); return; }
    resize();
    startLoop();
  }
  window.Atmosphere = { set, themes: Object.keys(THEMES) };
})();
