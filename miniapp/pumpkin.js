/* The pumpkin of the Хэллоуин event: «Зажги тыкву».
 *
 * It is the Нотка orb — two circles that overlap, with a bright rim — made a
 * pumpkin: three overlapping lobes in an orange-to-magenta gradient, grain on
 * them, and a face cut out in black. Every finished task lights one part
 * of the face, in the acid yellow of the event:
 *   1 left eye   2 right eye        (the frame)
 *   3 nose       4 mouth            (the theme)
 *   5 the whole pumpkin starts to shine
 *   6 the rays come out behind it   (the numbered edition)
 * Parts that are not lit yet are only drawn with a dashed line, so it is
 * plain what is still to be done.
 *
 *   PumpkinArt.svg()                 -> markup of one pumpkin
 *   PumpkinArt.lightTo(el, n, opts)  -> light n parts (opts.animate: one after another)
 *   PumpkinArt.burst(host, x, y, n)  -> confetti from a point
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
      const a = (i * 2 * Math.PI) / 14, w = 0.12;
      const p = (ang, r) => `${(160 + Math.cos(ang) * r).toFixed(1)},${(172 + Math.sin(ang) * r).toFixed(1)}`;
      return `<polygon points="${p(a - w, 96)} ${p(a, 214)} ${p(a + w, 96)}"/>`;
    }).join("");
    const part = (n, d, extra) => `<g class="pk-cut pk-${n}"><path class="pk-glow" d="${d}"/><path class="pk-hole" d="${d}"/>${extra || ""}</g>`;
    return `<svg class="pk" viewBox="0 0 320 300" aria-hidden="true">
  <defs>
    <linearGradient id="${k}a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff8a1f"/><stop offset=".55" stop-color="#ff4d6d"/><stop offset="1" stop-color="#d12a9a"/></linearGradient>
    <linearGradient id="${k}b" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb02e"/><stop offset=".5" stop-color="#ff5a3d"/><stop offset="1" stop-color="#b8239a"/></linearGradient>
    <linearGradient id="${k}c" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#ffd24a"/><stop offset=".5" stop-color="#ff8a2a"/><stop offset="1" stop-color="#ff3f7a"/></linearGradient>
    <linearGradient id="${k}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6dc"/><stop offset=".5" stop-color="#ffd9a0" stop-opacity=".55"/><stop offset="1" stop-color="#fff6dc" stop-opacity=".9"/></linearGradient>
    <filter id="${k}n" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 .92  0 0 0 0 .8  0 0 0 .55 0"/></filter>
    <filter id="${k}f" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="8"/></filter>
    <clipPath id="${k}p"><ellipse cx="104" cy="172" rx="84" ry="98"/><ellipse cx="216" cy="172" rx="84" ry="98"/><ellipse cx="160" cy="172" rx="70" ry="106"/></clipPath>
  </defs>
  <g class="pk-rays" fill="#ffe94d">${rays}</g>
  <ellipse class="pk-shadow" cx="160" cy="278" rx="118" ry="12" fill="#000" opacity=".5"/>
  <g class="pk-body">
    <ellipse cx="104" cy="172" rx="84" ry="98" fill="url(#${k}a)" stroke="url(#${k}r)" stroke-width="2.5"/>
    <ellipse cx="216" cy="172" rx="84" ry="98" fill="url(#${k}b)" stroke="url(#${k}r)" stroke-width="2.5"/>
    <ellipse cx="160" cy="172" rx="70" ry="106" fill="url(#${k}c)" stroke="url(#${k}r)" stroke-width="3"/>
    <ellipse class="pk-sheen" cx="160" cy="150" rx="46" ry="70" fill="#fff4c4"/>
    <rect x="0" y="0" width="320" height="300" filter="url(#${k}n)" clip-path="url(#${k}p)" opacity=".5" style="mix-blend-mode:overlay"/>
    <path d="M144 76C136 48 154 26 188 24C184 44 176 58 178 80Z" fill="#c8ff3d"/>
    <path d="M178 80C176 58 184 44 188 24C196 38 196 62 190 82Z" fill="#8fd01a"/>
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
    const apply = (count) => {
      for (let i = 1; i <= 4; i++) el.querySelector(".pk-" + i).classList.toggle("is-lit", count >= i);
      el.classList.toggle("is-glow", count >= 5);
      el.classList.toggle("is-rays", count >= 6);
      root.style.setProperty("--lit", String(Math.min(1, count / 6)));
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

  const COLORS = ["#ffe94d", "#ff4d9a", "#ff7a18", "#b46cff", "#ffffff"];
  function burst(host, x, y, count) {
    const n = count || 18;
    for (let i = 0; i < n; i++) {
      const s = document.createElement("i");
      s.className = "pk-spark";
      const a = Math.random() * Math.PI * 2, d = 50 + Math.random() * 130;
      s.style.cssText = `left:${x}px;top:${y}px;--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(Math.sin(a) * d - 40).toFixed(0)}px;--r:${(Math.random() * 540 - 270).toFixed(0)}deg;--s:${(0.7 + Math.random() * 1.1).toFixed(2)};--c:${COLORS[i % COLORS.length]}`;
      host.appendChild(s);
      setTimeout(() => s.remove(), 1300);
    }
  }

  return { svg, lightTo, burst };
})();
