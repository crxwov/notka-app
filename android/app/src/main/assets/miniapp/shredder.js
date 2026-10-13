/*
 * Shredder — vanilla port of the React <Shredder> component.
 * Drag an item into the slit (or call shred()) and it is torn into
 * strips that flutter down and fade; dragging it elsewhere in the
 * list reorders it. Used on the "edit playlist" screen.
 *
 * new Shredder(rootEl, {
 *   items: [{ id, el }],        // el = the element to show inside the slot
 *   onShred(item), onReorder(items),
 *   inset, gap, slitHeight, fallHeight, feedSpeed, bite, autoFeed,
 *   stripWidth, curl, dragTilt, lift, holdDelay
 * })
 */
(function () {
  const FOLLOW = 30;
  const SETTLE = 16;
  const TUG = 2.4;
  const TUG_DECAY = 0.14;
  const SLIT = 6;
  const OVER = 40;
  const STACK_K = 320;
  const STACK_C = 22;
  const STAGGER = 0.035;
  const ENTER = 22;
  const HYSTERESIS = 8;
  const DEG = Math.PI / 180;

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const ease = (from, to, dt, tau) => from + (to - from) * (1 - Math.exp(-dt / tau));
  const smooth = (t) => {
    const u = clamp(t, 0, 1);
    return u * u * (3 - 2 * u);
  };
  const pick = (lo, hi) => lo + Math.random() * (hi - lo);
  const side = () => (Math.random() < 0.5 ? -1 : 1);

  const spring = (p, v, target, dt, omega) => {
    const offset = p - target;
    const term = v + omega * offset;
    const decay = Math.exp(-omega * dt);
    return [target + (offset + term * dt) * decay, (v - omega * term * dt) * decay];
  };

  // ---- fast texture: paint the item straight onto a canvas ----
  // (the React original serialized every computed style into an SVG
  // foreignObject — hundreds of ms on a phone, right as the drag starts)
  const radiusOf = (cs) => parseFloat(cs.borderTopLeftRadius) || 0;
  const roundRect = (ctx, x, y, w, h, r) => {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  };
  const quickTexture = (el, W, H) => {
    const scale = Math.min(2, window.devicePixelRatio || 1);
    const tex = document.createElement("canvas");
    tex.width = Math.ceil(W * scale);
    tex.height = Math.ceil(H * scale);
    const ctx = tex.getContext("2d");
    ctx.scale(scale, scale);
    const base = el.getBoundingClientRect();
    const face = el.firstElementChild || el;
    const fcs = getComputedStyle(face);
    roundRect(ctx, 0, 0, W, H, radiusOf(fcs));
    ctx.fillStyle = fcs.backgroundColor && fcs.backgroundColor !== "rgba(0, 0, 0, 0)" ? fcs.backgroundColor : "rgba(127, 127, 127, 0.35)";
    ctx.fill();
    ctx.strokeStyle = "rgba(236, 228, 255, 0.1)";
    ctx.lineWidth = 1;
    ctx.stroke();
    face.querySelectorAll("*").forEach((node) => {
      const r = node.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const x = r.left - base.left;
      const y = r.top - base.top;
      if (node.tagName === "IMG") {
        if (!node.complete || !node.naturalWidth) return;
        const holder = node.parentElement ? getComputedStyle(node.parentElement) : null;
        const s = Math.max(r.width / node.naturalWidth, r.height / node.naturalHeight);
        const sw = r.width / s, shh = r.height / s;
        ctx.save();
        roundRect(ctx, x, y, r.width, r.height, holder ? radiusOf(holder) : 0);
        ctx.clip();
        ctx.drawImage(node, (node.naturalWidth - sw) / 2, (node.naturalHeight - shh) / 2, sw, shh, x, y, r.width, r.height);
        ctx.restore();
        return;
      }
      if (node.classList && node.classList.contains("cover") && !node.querySelector("img")) {
        roundRect(ctx, x, y, r.width, r.height, radiusOf(getComputedStyle(node)));
        ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
        ctx.fill();
        return;
      }
      if (node.children.length === 0 && node.textContent.trim() && !(node instanceof SVGElement)) {
        const cs = getComputedStyle(node);
        ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        ctx.fillStyle = cs.color;
        ctx.textBaseline = "middle";
        let text = node.textContent.trim();
        if (ctx.measureText(text).width > r.width) {
          while (text.length > 1 && ctx.measureText(text + "…").width > r.width) text = text.slice(0, -1);
          text += "…";
        }
        ctx.fillText(text, x, y + r.height / 2);
      }
    });
    return { tex, scale };
  };

  const flat = (W, H, fill) => {
    const tex = document.createElement("canvas");
    tex.width = W;
    tex.height = H;
    const ctx = tex.getContext("2d");
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, W, H);
    return { tex, scale: 1 };
  };

  // ---- strip geometry + painting ----
  const shape = (st, len, time, tear, sliver) => {
    const pts = st.pts;
    pts.length = 0;
    let x = st.ax;
    let y = st.ay;
    const steps = Math.ceil(len / sliver);
    const swing = (3 + 9 * st.rA) * tear;
    const pace = time * (1.6 + st.rA * 2.2) + st.rA * 6.2832;
    for (let j = 0; j <= steps; j += 1) {
      const d = Math.min(j * sliver, len);
      const a = st.th + st.curl * d + st.amp * Math.sin(d * st.freq + st.wave);
      const flutter = swing * Math.sin(d * 0.045 + pace);
      pts.push(x + flutter * Math.cos(a), y - flutter * Math.sin(a), a);
      const h = Math.min(sliver, len - d);
      x += Math.sin(a) * h;
      y += Math.cos(a) * h;
    }
  };

  const middle = (pts) => {
    let y = 0;
    for (let j = 1; j < pts.length; j += 3) y += pts[j];
    return (y * 3) / pts.length;
  };

  const paintStrip = (ctx, st, len, dpr, sliver) => {
    const { tex, ts } = st.feed;
    if (!tex) return;
    const pts = st.pts;
    const wc = st.w * st.core;
    const half = wc / 2;
    const sx = (st.x + (st.w - wc) / 2) * ts;
    const v0 = st.H - len;
    ctx.globalAlpha = st.alpha;
    for (let j = 0; j + 3 < pts.length; j += 3) {
      const d = (j / 3) * sliver;
      const h = Math.min(sliver, len - d);
      if (h <= 0) break;
      const ca = Math.cos(pts[j + 2]);
      const sa = Math.sin(pts[j + 2]);
      ctx.setTransform(dpr * ca, -dpr * sa, dpr * sa, dpr * ca, dpr * (pts[j] + OVER), dpr * pts[j + 1]);
      ctx.drawImage(tex, sx, (v0 + d) * ts, wc * ts, h * ts, -half, 0, wc, h + 0.4);
    }
    ctx.globalAlpha = 1;
  };

  class Shredder {
    constructor(root, opts) {
      this.root = root;
      this.c = Object.assign({
        items: [], onShred: null, onReorder: null,
        inset: 0, gap: 6, slitHeight: 4, fallHeight: 150, feedSpeed: 190,
        bite: 18, autoFeed: true, stripWidth: 9, curl: 1,
        dragTilt: 5, lift: 1.03, holdDelay: 260,
      }, opts || {});
      this.items = this.c.items.slice();
      // Lighter strips on weaker phones: fewer, coarser, lower-res. Also
      // switches on by itself if a shred ever runs slow (see tick).
      this.lowPower = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
      this.slowFrames = 0;
      this.slots = new Map();
      this.itemEls = new Map();
      this.s = {
        raf: 0, last: 0, t: 0, drag: null, feeds: [], strips: [],
        shifts: new Map(), tops: new Map(), timers: new Set(), dpr: 1, cw: 0, ch: 0,
      };
      this.step = (now) => {
        try { this.tick(now); } catch (err) { this.s.raf = 0; throw err; }
      };
      this.build();
    }

    // ---------------- DOM ----------------
    build() {
      const c = this.c;
      const root = this.root;
      root.innerHTML = "";
      root.classList.add("shredder");
      const vars = {
        "--sh-inset": `${c.inset}px`, "--sh-gap": `${c.gap}px`, "--sh-slit-h": `${c.slitHeight}px`,
        "--sh-fall": `${c.fallHeight}px`, "--sh-slit-inset": `${Math.max(0, c.inset - SLIT)}px`, "--sh-over": `${OVER}px`,
      };
      Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));

      this.list = document.createElement("ul");
      this.list.className = "shredder__list";
      this.items.forEach((item) => this.list.appendChild(this.makeSlot(item)));
      this.slit = document.createElement("div");
      this.slit.className = "shredder__slit";
      this.slit.setAttribute("aria-hidden", "true");
      const fall = document.createElement("div");
      fall.className = "shredder__fall";
      fall.setAttribute("aria-hidden", "true");
      this.canvas = document.createElement("canvas");
      this.canvas.className = "shredder__canvas";
      if (c.bin) {
        const bin = document.createElement("div");
        bin.className = "shredder__bin";
        bin.innerHTML = c.bin;
        fall.appendChild(bin);
      }
      fall.appendChild(this.canvas);
      root.appendChild(this.list);
      root.appendChild(this.slit);
      root.appendChild(fall);

      // The list is anchored to the slit and stacks upward, so the box is
      // sized once to hold everything; removed items let the stack settle
      // down toward the slit.
      root.style.height = `${this.list.offsetHeight + c.slitHeight + c.fallHeight}px`;

      this.ro = new ResizeObserver(() => this.fit());
      this.ro.observe(root);
      this.fit();
      this.settle(null, null);

    }

    makeSlot(item) {
      const li = document.createElement("li");
      li.className = "shredder__slot";
      const el = document.createElement("div");
      el.className = "shredder__item";
      el.tabIndex = 0;
      el.appendChild(item.el);
      li.appendChild(el);
      this.slots.set(item.id, li);
      this.itemEls.set(item.id, el);

      // Hold briefly before dragging so the page can still be scrolled
      // with a finger that lands on an item.
      let hold = null;
      let start = null;
      el.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 || this.c.disabled) return;
        if (e.target.closest("button")) return; // row buttons keep their own taps
        start = { x: e.clientX, y: e.clientY, id: e.pointerId };
        clearTimeout(hold);
        const go = () => {
          hold = null;
          try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
          if (navigator.vibrate && e.pointerType !== "mouse") { try { navigator.vibrate(8); } catch (err) { /* ignore */ } }
          this.begin(item, "drag", e);
        };
        // a mouse can't scroll by dragging, so it grabs at once
        if (e.pointerType === "mouse") go();
        else hold = setTimeout(go, this.c.holdDelay);
      });
      el.addEventListener("pointermove", (e) => {
        if (hold && start && e.pointerId === start.id && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) {
          clearTimeout(hold); // it's a scroll, not a drag
          hold = null;
        }
        this.onMove(e);
      });
      const up = (e) => {
        clearTimeout(hold);
        hold = null;
        this.onUp(e);
      };
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
      el.addEventListener("lostpointercapture", up);
      // while dragging, a finger must not scroll the page
      el.addEventListener("touchmove", (e) => { if (this.s.drag && this.s.drag.el === el) e.preventDefault(); }, { passive: false });
      el.addEventListener("keydown", (e) => {
        if (e.key !== "Delete" && e.key !== "Backspace") return;
        e.preventDefault();
        if (!e.repeat) this.shred(item.id);
      });
      el.addEventListener("dragstart", (e) => e.preventDefault());
      el.addEventListener("contextmenu", (e) => e.preventDefault());
      return li;
    }

    sliver() { return this.lowPower ? 5 : 3; }

    fit() {
      const s = this.s;
      const dpr = Math.min(this.lowPower ? 1 : 1.5, window.devicePixelRatio || 1);
      const cw = this.root.offsetWidth + OVER * 2;
      const ch = this.c.fallHeight;
      if (cw === s.cw && ch === s.ch && dpr === s.dpr) return;
      if (s.cw) s.tops = new Map();
      s.cw = cw;
      s.ch = ch;
      s.dpr = dpr;
      this.canvas.width = Math.ceil(cw * dpr);
      this.canvas.height = Math.ceil(ch * dpr);
    }

    destroy() {
      const s = this.s;
      cancelAnimationFrame(s.raf);
      s.raf = 0;
      s.timers.forEach((id) => clearTimeout(id));
      s.timers.clear();
      if (this.ro) this.ro.disconnect();
      document.body.classList.remove("is-shredding");
    }

    /** Programmatic shred (the ✕ button / Delete key): carry the item into the slit. */
    shred(key) {
      const item = this.items.find((it) => it.id === key);
      if (item) this.begin(item, "carry", null);
    }

    // ---------------- geometry helpers ----------------
    metrics() {
      const c = this.c;
      const root = this.root;
      const r = root.getBoundingClientRect();
      const k = r.width / root.offsetWidth || 1;
      const lip = root.offsetHeight - c.fallHeight - c.slitHeight;
      return { left: r.left, top: r.top, k, rw: root.offsetWidth, lip, exit: lip + c.slitHeight };
    }
    at(el, m) {
      const r = el.getBoundingClientRect();
      return { x: (r.left - m.left) / m.k, y: (r.top - m.top) / m.k };
    }
    local(e, m) {
      return { x: (e.clientX - m.left) / m.k, y: (e.clientY - m.top) / m.k };
    }

    run() {
      const s = this.s;
      if (s.raf) return;
      s.last = performance.now();
      s.raf = requestAnimationFrame(this.step);
    }
    later(ms, fn) {
      const s = this.s;
      const id = setTimeout(() => { s.timers.delete(id); fn(); }, ms);
      s.timers.add(id);
    }

    slotOf(key) { return this.slots.get(key); }
    isLive(key) {
      const slot = this.slotOf(key);
      return !!slot && slot.dataset.gone === undefined;
    }
    liveKeys() { return this.items.map((it) => it.id).filter((k) => this.isLive(k)); }

    shiftOf(slot) {
      const s = this.s;
      let sh = s.shifts.get(slot);
      if (!sh) {
        sh = { el: slot, y: 0, v: 0, target: 0, delay: 0, item: null };
        s.shifts.set(slot, sh);
      }
      return sh;
    }

    // FLIP: measure where every slot now sits and spring it from where it was
    settle(origin, entering) {
      const s = this.s;
      const m = this.metrics();
      const next = new Map();
      const active = s.drag ? s.drag.slot : null;
      const slots = this.items.map((it) => this.slotOf(it.id));
      const from = origin ? slots.indexOf(origin) : -1;
      let born = 0;
      this.items.forEach((item, idx) => {
        const slot = slots[idx];
        if (!slot) return;
        const sh = s.shifts.get(slot);
        const top = this.at(slot, m).y - (sh ? sh.y : 0);
        const prev = s.tops.get(slot);
        next.set(slot, top);
        if (slot === active) return;
        const fresh = (entering && entering.has(slot)) || (prev === undefined && s.tops.size > 0);
        if (fresh) {
          const rec = this.shiftOf(slot);
          const el = this.itemEls.get(item.id) || null;
          rec.y = -ENTER;
          rec.v = 0;
          rec.target = 0;
          rec.delay = born * 0.05;
          rec.item = el;
          born += 1;
          if (el) el.style.opacity = "0";
          slot.style.transform = `translateY(${rec.y}px)`;
          return;
        }
        if (prev === undefined) return;
        const delta = prev - top;
        if (Math.abs(delta) < 0.5) return;
        const rec = this.shiftOf(slot);
        rec.y += delta;
        if (from >= 0) rec.delay = Math.max(0, from - 1 - idx) * STAGGER;
        slot.style.transform = `translateY(${rec.y}px)`;
      });
      s.tops = next;
      this.run();
    }

    reflow(mutate, origin, entering) {
      mutate();
      this.settle(origin || null, entering || null);
    }

    arrange(key, index) {
      const ids = this.items.map((it) => it.id).filter((id) => id !== key);
      const live = ids.filter((id) => this.isLive(id));
      let anchor = 0;
      if (index < live.length) anchor = ids.indexOf(live[index]);
      else if (live.length) anchor = ids.indexOf(live[live.length - 1]) + 1;
      ids.splice(anchor, 0, key);
      return ids;
    }

    // apply a new order to the data and the DOM (replaces React's re-render)
    commit(ids) {
      const same = ids.every((id, i) => this.items[i] && id === this.items[i].id);
      if (same) return false;
      const byId = new Map(this.items.map((it) => [it.id, it]));
      this.items = ids.map((id) => byId.get(id));
      this.items.forEach((it) => this.list.appendChild(this.slotOf(it.id)));
      return true;
    }

    collapse(f) {
      const s = this.s;
      f.consumed = true;
      f.el.style.visibility = "hidden";
      delete f.slot.dataset.active;
      s.shifts.forEach((sh) => { sh.target = 0; });
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
