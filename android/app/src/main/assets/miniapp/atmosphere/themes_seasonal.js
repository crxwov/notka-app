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

