      this.reflow(() => {
        f.slot.dataset.gone = "";
        f.slot.style.height = "0px";
        f.slot.style.marginBottom = "0px";
      }, f.slot);
      if (this.c.onShred) this.c.onShred(f.item);
    }

    grab(d, m) {
      const s = this.s;
      const c = this.c;
      s.drag = null;
      s.shifts.forEach((sh) => { sh.target = 0; });
      const over = d.ry + d.H - m.lip;
      const ry = over > c.bite * 1.5 ? m.lip + c.bite * 1.5 - d.H : d.ry;
      const lo = c.inset - SLIT;
      const hi = m.rw - c.inset + SLIT - d.W;
      const n = Math.max(1, Math.round(d.W / Math.max(4, this.lowPower ? Math.max(c.stripWidth, 22) : c.stripWidth)));
      const sw = Math.floor(d.W / n);
      const f = {
        key: d.key, item: d.item, el: d.el, slot: d.slot, W: d.W, H: d.H,
        rx: d.rx, ry, tx: clamp(d.rx, Math.min(lo, hi), Math.max(lo, hi)),
        tilt: d.tilt, lift: d.lift, v: c.feedSpeed * TUG, age: 0,
        tex: null, ts: 1, consumed: false, strips: n,
      };
      let settled = false;
      const use = ({ tex, scale }) => {
        if (settled) return;
        settled = true;
        f.tex = tex;
        f.ts = scale;
        this.run();
      };
      d.snap.then(use, () => use(flat(d.W, d.H, d.fill)));
      setTimeout(() => use(flat(d.W, d.H, d.fill)), 400);
      d.el.dataset.state = "feed";
      s.feeds.push(f);
      for (let i = 0; i < n; i += 1) {
        s.strips.push({
          feed: f, x: i * sw, w: i === n - 1 ? d.W - sw * (n - 1) : sw, H: d.H,
          phase: "attached",
          curl: side() * pick(0.35, 0.9) * DEG * c.curl,
          amp: pick(1.5, 4) * DEG * c.curl,
          freq: (Math.PI * 2) / pick(34, 60),
          wave: pick(0, Math.PI * 2),
          rA: Math.random(), rB: Math.random(),
          speed: 0, splay: 0, core: 1, rest: 0, alpha: 1,
          th: 0, ax: 0, ay: 0, vx: 0, vy: 0, hang: 0, pts: [],
        });
      }
    }

    place(d, sp) {
      d.el.style.transform = `translate(${d.rx - sp.x}px, ${d.ry - sp.y}px) rotate(${d.tilt}deg) scale(${d.lift})`;
    }

    aim(d, m) {
      const s = this.s;
      const c = this.c;
      const rows = [];
      this.items.forEach((item) => {
        if (item.id === d.key) return;
        const slot = this.slotOf(item.id);
        if (!slot || slot.dataset.gone !== undefined) return;
        const top = s.tops.get(slot);
        if (top === undefined) return;
        rows.push({ slot, mid: top + slot.offsetHeight / 2 });
      });
      let j = -1;
      if (d.moved && d.ry + d.H < m.lip - 8) {
        const cy = d.ry + d.H / 2;
        let n = 0;
        rows.forEach((row) => { if (row.mid < cy) n += 1; });
        if (d.j >= 0 && n !== d.j) {
          const edge = rows[n > d.j ? n - 1 : n];
          if (edge && Math.abs(edge.mid - cy) < HYSTERESIS) n = d.j;
        }
        j = n;
      }
      if (j === d.j) return;
      d.j = j;
      rows.forEach((row, k) => {
        this.shiftOf(row.slot).target = j >= 0 && k < j ? -(d.H + c.gap) : 0;
      });
    }

    drop(d) {
      const s = this.s;
      const live = this.liveKeys().filter((key) => key !== d.key);
      const index = clamp(d.j >= 0 ? d.j : d.from, 0, live.length);
      s.shifts.forEach((sh) => { sh.target = 0; });
      let changed = false;
      this.reflow(() => {
        changed = this.commit(this.arrange(d.key, index));
        d.slot.style.height = `${d.H}px`;
        d.slot.style.marginBottom = "";
      });
      d.phase = "return";
      if (changed && this.c.onReorder) this.c.onReorder(this.items.filter((it) => this.isLive(it.id)));
    }

    tick(now) {
      const s = this.s;
      const c = this.c;
      if (!this.root.isConnected) { s.raf = 0; return; }
      const raw = now - s.last;
      const dt = clamp(raw / 1000, 0, 0.05);
      if (s.strips.length && !this.lowPower) {
        this.slowFrames = raw > 26 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 1);
        if (this.slowFrames > 8) { this.lowPower = true; this.s.cw = 0; this.fit(); }
      }
      s.last = now;
      s.t += dt;
      const m = this.metrics();
      const d = s.drag;
      if (d) {
        if (!d.el.isConnected) {
          s.drag = null;
        } else {
          const sp = this.at(d.slot, m);
          const ceiling = m.lip + c.bite - d.H;
          if (d.phase === "drag") {
            d.tx = d.px - d.gx;
            d.ty = Math.min(d.py - d.gy, ceiling);
            if (!d.moved && Math.hypot(d.px - d.ox, d.py - d.oy) > 6) d.moved = true;
            this.aim(d, m);
          } else if (d.phase === "carry") {
            d.tx = (m.rw - d.W) / 2;
            d.ty = ceiling;
          } else {
            d.tx = sp.x;
            d.ty = sp.y;
          }
          const omega = d.phase === "drag" ? FOLLOW : SETTLE;
          [d.rx, d.vx] = spring(d.rx, d.vx, d.tx, dt, omega);
          [d.ry, d.vy] = spring(d.ry, d.vy, d.ty, dt, omega);
          const lean = d.phase === "drag" ? clamp(d.vx * 0.012, -c.dragTilt, c.dragTilt) : 0;
          d.tilt = ease(d.tilt, lean, dt, 0.09);
          d.lift = ease(d.lift, d.phase === "return" ? 1 : c.lift, dt, 0.12);
          const over = d.ry + d.H - m.lip;
          const bites = d.phase === "carry" || (d.phase === "drag" && c.autoFeed);
          if (bites && over >= c.bite - 0.5) {
            this.grab(d, m);
          } else {
            this.place(d, sp);
            const still = Math.abs(d.rx - d.tx) < 0.2 && Math.abs(d.ry - d.ty) < 0.2 && Math.abs(d.vy) < 2 && Math.abs(d.vx) < 2;
            if (d.phase === "return" && still && Math.abs(d.lift - 1) < 0.002 && Math.abs(d.tilt) < 0.05) {
              d.el.style.transform = "";
              delete d.el.dataset.state;
              delete d.slot.dataset.active;
              d.slot.style.height = "";
              s.drag = null;
            }
          }
        }
      }
      let pulling = false;
      for (let i = s.feeds.length - 1; i >= 0; i -= 1) {
        const f = s.feeds[i];
        if (!f.consumed) {
          if (!f.el.isConnected) { s.feeds.splice(i, 1); continue; }
          pulling = true;
          const sp = this.at(f.slot, m);
          if (f.tex) {
            f.age += dt;
            f.v = c.feedSpeed * (1 + (TUG - 1) * Math.exp(-f.age / TUG_DECAY));
            f.ry += f.v * dt;
          }
          f.rx = ease(f.rx, f.tx, dt, 0.1);
          f.tilt = ease(f.tilt, 0, dt, 0.08);
          f.lift = ease(f.lift, 1, dt, 0.1);
          if (f.ry >= m.lip) {
            this.collapse(f);
          } else {
            const jitter = Math.sin(s.t * 150) * 0.5;
            f.el.style.transform = `translate(${f.rx - sp.x + jitter}px, ${f.ry - sp.y}px) rotate(${f.tilt}deg) scale(${f.lift})`;
          }
        } else {
          f.ry += f.v * dt;
          if (f.strips === 0) s.feeds.splice(i, 1);
        }
      }
      let moving = false;
      s.shifts.forEach((sh, el) => {
        if (!el.isConnected) { s.shifts.delete(el); return; }
        if (sh.delay > 0) { sh.delay -= dt; moving = true; return; }
        if (sh.item) {
          const it = sh.item;
          it.style.transition = "opacity 280ms ease";
          it.style.opacity = "";
          setTimeout(() => { it.style.transition = ""; }, 320);
          sh.item = null;
        }
        const n = Math.ceil(dt * 240);
        const h = dt / n;
        for (let k = 0; k < n; k += 1) {
          sh.v += (-STACK_K * (sh.y - sh.target) - STACK_C * sh.v) * h;
          sh.y += sh.v * h;
        }
        if (Math.abs(sh.y - sh.target) < 0.15 && Math.abs(sh.v) < 4) {
          sh.y = sh.target;
          sh.v = 0;
          if (sh.target === 0) {
            el.style.transform = "";
            s.shifts.delete(el);
          } else {
            el.style.transform = `translateY(${sh.y}px)`;
          }
        } else {
          el.style.transform = `translateY(${sh.y}px)`;
          moving = true;
        }
      });
      const ctx = this.canvas.getContext("2d");
      const dpr = s.dpr;
      if (s.strips.length) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      }
      for (let i = s.strips.length - 1; i >= 0; i -= 1) {
        const st = s.strips[i];
        const f = st.feed;
        let len = st.H;
        if (st.phase === "attached") {
          const top = f.ry - m.exit;
          st.hang = top + st.H;
          if (st.hang <= 0) { moving = true; continue; }
          st.ax = f.rx + st.x + st.w / 2;
          st.th = Math.sin(s.t * 6 + st.wave) * 0.03 * smooth(st.hang / 40);
          if (top >= 0) {
            st.phase = "free";
            st.ay = top;
            st.vy = f.v;
            st.vx = pick(-20, 20);
            st.speed = 150 + st.rA * 230;
            st.splay = (st.rA - 0.5) * 320;
            st.rest = side() * pick(0.15, 0.6);
            f.strips -= 1;
          } else {
            st.ay = 0;
            len = st.hang;
          }
        }
        if (st.phase === "free") {
          const tear = Math.pow(clamp(middle(st.pts) / c.fallHeight, 0, 1), 1.2);
          const breath = 0.85 + 0.15 * Math.sin(s.t * (1 + st.rB * 2) + st.rA * 6.2832);
          st.vy = ease(st.vy, st.speed * breath, dt, 0.25);
          st.vx = ease(st.vx, st.splay * tear + (st.ax - m.rw / 2) * 0.25, dt, 0.4);
          st.ax += st.vx * dt;
          st.ay += st.vy * dt;
          st.th = ease(st.th, st.rest, dt, 0.5);
          st.core = 1 - smooth(tear / 0.85) * (0.8 - st.rA * 0.16);
          shape(st, st.H, s.t, tear, this.sliver());
          st.alpha = 1 - smooth((tear - 0.6) / 0.4);
          if (st.alpha <= 0.01 || st.pts[1] > c.fallHeight) { s.strips.splice(i, 1); continue; }
        } else {
          st.core = 1;
          shape(st, len, s.t, 0, this.sliver());
          st.alpha = 1;
        }
        paintStrip(ctx, st, len, dpr, this.sliver());
        moving = true;
      }
      if (!s.strips.length) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      }
      this.slit.style.transform = pulling ? `translate(${Math.sin(s.t * 140) * 0.5}px, ${Math.cos(s.t * 97) * 0.35}px)` : "";
      this.root.classList.toggle("is-pulling", pulling);
      this.root.classList.toggle("is-dragging", !!(s.drag && s.drag.phase === "drag"));
      const busy = !!(s.drag || s.feeds.length || s.strips.length);
      document.body.classList.toggle("is-shredding", busy);
      if (s.drag || s.feeds.length || moving) s.raf = requestAnimationFrame(this.step);
      else { s.raf = 0; document.body.classList.remove("is-shredding"); }
    }

    begin(item, phase, e) {
      const s = this.s;
      const key = item.id;
      const el = this.itemEls.get(key);
      const slot = this.slotOf(key);
      if (this.c.disabled || s.drag || !el || !slot || slot.dataset.gone !== undefined) return;
      if (s.feeds.some((f) => f.key === key)) return;
      const m = this.metrics();
      const sp = this.at(slot, m);
      const W = slot.offsetWidth;
      const H = slot.offsetHeight;
      const p = e ? this.local(e, m) : { x: sp.x, y: sp.y };
      const face = el.firstElementChild || el;
      const fill = getComputedStyle(face).backgroundColor;
      let snap;
      try { snap = Promise.resolve(quickTexture(el, W, H)); } catch (err) { snap = Promise.reject(new Error("texture")); }
      snap.catch(() => {});
      const d = {
        key, item, el, slot, W, H,
        rx: sp.x, ry: sp.y, tx: sp.x, ty: sp.y, vx: 0, vy: 0, tilt: 0, lift: 1,
        gx: p.x - sp.x, gy: p.y - sp.y, px: p.x, py: p.y, ox: p.x, oy: p.y,
        moved: false, from: this.liveKeys().indexOf(key), j: -1, phase,
        id: e ? e.pointerId : null, snap,
        fill: fill === "rgba(0, 0, 0, 0)" || fill === "transparent" ? "rgba(127, 127, 127, 0.35)" : fill,
      };
      s.drag = d;
      s.shifts.delete(slot);
      slot.style.transform = "";
      this.reflow(() => {
        slot.dataset.active = "";
        el.dataset.state = "drag";
        slot.style.height = "0px";
        slot.style.marginBottom = "0px";
      }, slot);
      this.place(d, this.at(slot, m));
      this.run();
    }

    onMove(e) {
      const d = this.s.drag;
      if (!d || d.id !== e.pointerId) return;
      const p = this.local(e, this.metrics());
      d.px = p.x;
      d.py = p.y;
    }

    onUp(e) {
      const d = this.s.drag;
      if (!d || d.id !== e.pointerId) return;
      d.id = null;
      try {
        if (d.el.hasPointerCapture(e.pointerId)) d.el.releasePointerCapture(e.pointerId);
      } catch (err) { /* ignore */ }
      const m = this.metrics();
      if (d.ry + d.H > m.lip + 0.5) this.grab(d, m);
      else this.drop(d);
      this.run();
    }
  }

  window.Shredder = Shredder;
})();
