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

