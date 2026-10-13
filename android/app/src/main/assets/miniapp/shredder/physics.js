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

