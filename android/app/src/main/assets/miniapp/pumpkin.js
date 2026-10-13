/* The pumpkin of the Хэллоуин event: «Зажги тыкву».
 *
 * A pumpkin of liquid glass, like the rest of Нотка: three overlapping
 * translucent lobes, a bright rim, glints on top and a warm light inside.
 * The face lights from the inside as tasks are finished: the parts at the
 * steps given in ``opts.steps`` (the number of finished tasks at which the
 * left eye, the right eye, the nose and the mouth light up), and when all
 * ``opts.total`` tasks are done the whole pumpkin shines and soft rays come
 * out behind it. What is not lit yet is only etched with a dashed line, so
 * it is plain what is still to be done.
 *
 *   PumpkinArt.svg()                 -> markup of one pumpkin
 *   PumpkinArt.lightTo(el, n, opts)  -> light n parts (opts.animate: one after another)
 *   PumpkinArt.burst(host, x, y, n)  -> a handful of sparks from a point
 */
window.PumpkinArt = (function () {
  "use strict";
  let uid = 0;

  function svg() {
    const k = "pk" + ++uid;
    const eyeL = "M92 152 L140 160 L116 110 Z";
    const eyeR = "M228 152 L180 160 L204 110 Z";
    const nose = "M160 172 L145 198 L175 198 Z";
    const mouth = "M104 212 Q160 292 216 212 L206 222 L196 210 L186 228 L173 213 L160 232 L147 213 L134 228 L124 210 L114 222 Z";
    const rays = Array.from({ length: 14 }, (_, i) => {
      const a = (i * 2 * Math.PI) / 14, w = 0.1;
      const p = (ang, r) => `${(160 + Math.cos(ang) * r).toFixed(1)},${(172 + Math.sin(ang) * r).toFixed(1)}`;
      return `<polygon points="${p(a - w, 90)} ${p(a, 210)} ${p(a + w, 90)}"/>`;
    }).join("");
    const part = (n, d, extra) => `<g class="pk-cut pk-${n}"><path class="pk-glow" d="${d}" fill="#ffb347" filter="url(#${k}g)"/><path class="pk-hole" d="${d}"/><path class="pk-lit" d="${d}" fill="url(#${k}l)"/>${extra || ""}</g>`;
    return `<svg class="pk" viewBox="0 0 320 300" aria-hidden="true">
  <defs>
    <radialGradient id="${k}a" cx="36%" cy="28%" r="82%"><stop offset="0" stop-color="#ffe7c4" stop-opacity=".95"/><stop offset=".42" stop-color="#ff9d5a" stop-opacity=".8"/><stop offset="1" stop-color="#cf2f78" stop-opacity=".9"/></radialGradient>
    <radialGradient id="${k}b" cx="64%" cy="28%" r="82%"><stop offset="0" stop-color="#ffe0b8" stop-opacity=".95"/><stop offset=".42" stop-color="#ff8f52" stop-opacity=".8"/><stop offset="1" stop-color="#b8286f" stop-opacity=".9"/></radialGradient>
    <radialGradient id="${k}c" cx="50%" cy="24%" r="88%"><stop offset="0" stop-color="#fff3da" stop-opacity=".97"/><stop offset=".48" stop-color="#ffb26a" stop-opacity=".84"/><stop offset="1" stop-color="#ff5f86" stop-opacity=".9"/></radialGradient>
    <linearGradient id="${k}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".5" stop-color="#fff" stop-opacity=".14"/><stop offset="1" stop-color="#fff" stop-opacity=".6"/></linearGradient>
    <linearGradient id="${k}h" x1="0" y1="0" x2=".7" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <radialGradient id="${k}i" cx="50%" cy="55%" r="55%"><stop offset="0" stop-color="#ffd27a" stop-opacity=".9"/><stop offset="1" stop-color="#ff8a3d" stop-opacity="0"/></radialGradient>
    <radialGradient id="${k}l" cx="50%" cy="50%" r="65%"><stop offset="0" stop-color="#fffbe6"/><stop offset=".55" stop-color="#ffd36b"/><stop offset="1" stop-color="#ff9a3d"/></radialGradient>
    <linearGradient id="${k}s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eaffb0" stop-opacity=".95"/><stop offset="1" stop-color="#6fc83a" stop-opacity=".9"/></linearGradient>
    <radialGradient id="${k}y"><stop offset="0" stop-color="#ffd9a0" stop-opacity=".7"/><stop offset="1" stop-color="#ffd9a0" stop-opacity="0"/></radialGradient>
    <radialGradient id="${k}d"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    <filter id="${k}g" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="7"/></filter>
    <filter id="${k}t" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>
  </defs>
  <g class="pk-rays" fill="url(#${k}y)" filter="url(#${k}t)">${rays}</g>
  <ellipse class="pk-shadow" cx="160" cy="282" rx="124" ry="14" fill="url(#${k}d)"/>
  <g class="pk-body">
    <ellipse cx="104" cy="172" rx="84" ry="98" fill="url(#${k}a)" stroke="url(#${k}r)" stroke-width="1.6"/>
    <ellipse cx="216" cy="172" rx="84" ry="98" fill="url(#${k}b)" stroke="url(#${k}r)" stroke-width="1.6"/>
    <ellipse cx="160" cy="172" rx="70" ry="106" fill="url(#${k}c)" stroke="url(#${k}r)" stroke-width="2"/>
    <ellipse class="pk-inner" cx="160" cy="178" rx="100" ry="94" fill="url(#${k}i)"/>
    <path d="M44 152C46 112 70 86 104 82C78 100 62 124 60 160Z" fill="url(#${k}h)" opacity=".7"/>
    <path d="M276 152C274 112 250 86 216 82C242 100 258 124 260 160Z" fill="url(#${k}h)" opacity=".4"/>
    <path d="M122 96C136 76 178 74 198 92C174 88 146 92 134 114Z" fill="url(#${k}h)" opacity=".85"/>
    <circle cx="124" cy="102" r="4.5" fill="#fff" opacity=".9"/>
    <path d="M98 262Q160 292 222 262" stroke="#fff" stroke-opacity=".28" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path d="M146 82C138 54 154 30 188 28C186 46 178 60 180 86Z" fill="url(#${k}s)" stroke="url(#${k}r)" stroke-width="1.2"/>
    <path d="M154 70C152 56 160 44 172 38" stroke="#fff" stroke-opacity=".7" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <g class="pk-face">
      ${part(1, eyeL, '<circle class="pk-pupil pk-pl" cx="120" cy="140" r="6"/>')}
      ${part(2, eyeR, '<circle class="pk-pupil pk-pr" cx="200" cy="140" r="6"/>')}
      ${part(3, nose)}
      ${part(4, mouth)}
    </g>
  </g>
</svg>`;
  }

  function lightTo(root, n, opts) {
    opts = opts || {};
    const el = root.querySelector("svg.pk");
    if (!el) return;
    const total = opts.total || 6;
    const steps = opts.steps || [1, 2, 3, 4];
    const apply = (count) => {
      for (let i = 1; i <= 4; i++) el.querySelector(".pk-" + i).classList.toggle("is-lit", count >= steps[i - 1]);
      el.classList.toggle("is-glow", count >= total);
      el.classList.toggle("is-rays", count >= total);
      root.style.setProperty("--lit", String(Math.min(1, count / total)));
      root.dataset.lit = String(count);
    };
    if (!opts.animate || n === 0) { apply(n); return; }
    let c = 0;
    apply(0);
    const step = () => {
      c += 1;
      apply(c);
      el.classList.add("is-flash");
      setTimeout(() => el.classList.remove("is-flash"), 380);
      if (opts.onStep) opts.onStep(c);
      if (c < n) setTimeout(step, 340);
    };
    setTimeout(step, opts.delay || 450);
  }

  const COLORS = ["#ffd9a0", "#ff9a5c", "#ff6aa0", "#fff4dc", "#c79bff"];
  function burst(host, x, y, count) {
    const n = count || 16;
    for (let i = 0; i < n; i++) {
      const s = document.createElement("i");
      s.className = "pk-spark";
      const a = Math.random() * Math.PI * 2, d = 50 + Math.random() * 120;
      s.style.cssText = `left:${x}px;top:${y}px;--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(Math.sin(a) * d - 40).toFixed(0)}px;--s:${(0.6 + Math.random() * 1).toFixed(2)};--c:${COLORS[i % COLORS.length]}`;
      host.appendChild(s);
      setTimeout(() => s.remove(), 1300);
    }
  }

  return { svg, lightTo, burst };
})();
