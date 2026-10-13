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
