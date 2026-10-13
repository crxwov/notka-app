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

