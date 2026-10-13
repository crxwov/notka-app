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

