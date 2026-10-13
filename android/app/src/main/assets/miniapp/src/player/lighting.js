// ============================================================
// THE LIGHT — painted with the playing track's own palette.
// Up to three distinct colors are pulled from the artwork and
// spread over the orb's layers; a grey or b/w cover gives a
// silvery light, a neon one a neon light. The artwork itself also
// lies under the light, heavily blurred, so the whole screen
// carries the cover's mood.
// ============================================================
var paletteCache = new Map();
var lightArt = $("light-art");
var clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Larger artwork for big surfaces: YouTube Music thumbnails come as
// 120px ("=w120-h120-…"); the same URL serves any size.
function hiResArtwork(url) {
  if (!url) return url;
  if (/googleusercontent\.com|ggpht\.com/.test(url)) return proxyArtwork(url.replace(/=w\d+-h\d+/, "=w544-h544"));
  return proxyArtwork(url);
}

function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}
var hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
var hsl = (h, s, l) => `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;

function paletteFromPixels(data) {
  const BINS = 18;
  const bins = Array.from({ length: BINS }, () => ({ w: 0, x: 0, y: 0, s: 0, l: 0 }));
  const vbins = Array.from({ length: BINS }, () => ({ w: 0, x: 0, y: 0, s: 0, l: 0 }));
  // by area: what actually fills the cover (a small loud accent does not decide the mood)
  const abins = Array.from({ length: BINS }, () => ({ w: 0, x: 0, y: 0, s: 0, l: 0 }));
  let total = 0, chroma = 0, vivid = 0, gx = 0, gy = 0, sumL = 0;
  const lights = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const [h, s, l] = rgbToHsl(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255);
    total++;
    sumL += l;
    lights.push([h, s, l]);
    if (s < 0.2 || l < 0.1 || l > 0.92) continue;
    chroma++;
    {
      const wa = (s + 0.2) * Math.sqrt(1 - Math.abs(2 * l - 1));
      const ab = abins[Math.floor(h / (360 / BINS)) % BINS];
      const ra = (h * Math.PI) / 180;
      ab.w += wa; ab.x += Math.cos(ra) * wa; ab.y += Math.sin(ra) * wa; ab.s += s * wa; ab.l += l * wa;
    }
    // saturation squared: a small vivid accent beats a large muted area
    const w = s * s * Math.sqrt(1 - Math.abs(2 * l - 1));
    const bi = Math.floor(h / (360 / BINS)) % BINS;
    const b = bins[bi];
    const rad = (h * Math.PI) / 180;
    b.w += w; b.x += Math.cos(rad) * w; b.y += Math.sin(rad) * w; b.s += s * w; b.l += l * w;
    if (s > 0.45 && l > 0.18 && l < 0.82) {
      vivid++;
      const v = vbins[bi];
      v.w += w; v.x += Math.cos(rad) * w; v.y += Math.sin(rad) * w; v.s += s * w; v.l += l * w;
    }
    gx += Math.cos(rad) * w; gy += Math.sin(rad) * w;
  }
  if (!total) return null;
  const avgL = lights.reduce((a, p) => a + p[2], 0) / total;

  // Mostly black-and-white artwork with one strong accent: the accent
  // leads, the darks stay dark.
  if (chroma / total < 0.08 && vivid / total >= 0.015) {
    const v = vbins.filter((b) => b.w > 0).sort((a, b) => b.w - a.w)[0];
    const h = (Math.atan2(v.y, v.x) * 180 / Math.PI + 360) % 360;
    const s = v.s / v.w, l = v.l / v.w;
    // softened: a cover's loudest colour is calmed, not copied
    return {
      core: hsl(h, clamp(s * 0.6, 0.34, 0.55), 0.88),
      warm: hsl(h, clamp(s * 0.74, 0.4, 0.62), clamp(l, 0.54, 0.64)),
      mid: hsl(h, clamp(s * 0.68, 0.34, 0.56), 0.42),
      deep: hsl(h, 0.3, 0.22),
    };
  }

  // Mostly grey / black-and-white artwork: a silvery light in its tone.
  if (chroma / total < 0.08) {
    const h = gx || gy ? (Math.atan2(gy, gx) * 180 / Math.PI + 360) % 360 : 260;
    return {
      core: hsl(h, 0.22, 0.92),
      warm: hsl(h, 0.12, clamp(avgL + 0.2, 0.55, 0.72)),
      mid: hsl(h, 0.1, clamp(avgL, 0.4, 0.55)),
      deep: hsl(h, 0.16, 0.28),
    };
  }

  const colors = abins
    .filter((b) => b.w > 0)
    .map((b) => ({ w: b.w, h: (Math.atan2(b.y, b.x) * 180 / Math.PI + 360) % 360, s: b.s / b.w, l: b.l / b.w }))
    .sort((a, b) => b.w - a.w);
  const picks = [colors[0]];
  for (const c of colors) {
    if (picks.length >= 3) break;
    if (c.w < colors[0].w * 0.12) break;
    if (picks.every((p) => hueDist(p.h, c.h) >= 30)) picks.push(c);
  }
  const [a, b = { ...a, h: (a.h + 24) % 360, s: a.s * 0.9 }, c3] = picks;
  // the darkest chromatic tones of the cover become the deep layer
  const darks = lights.filter((p) => p[1] > 0.15 && p[2] < 0.45).sort((p, q) => p[2] - q[2]).slice(0, Math.max(6, Math.floor(total * 0.15)));
  let deepH = c3 ? c3.h : b.h, deepS = c3 ? c3.s : b.s;
  if (darks.length >= 6) {
    let dx = 0, dy = 0, ds = 0;
    darks.forEach((p) => { const r = (p[0] * Math.PI) / 180; dx += Math.cos(r); dy += Math.sin(r); ds += p[1]; });
    deepH = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
    deepS = ds / darks.length;
  }
  // the vibe: how light the cover is as a whole, and how colourful. A dark, moody cover gives
  // a deep, quiet light; a light, airy one a light and gentle light; a loud one is calmed.
  const tone = clamp(sumL / total, 0.16, 0.8);
  const vivid2 = clamp(a.s, 0.2, 1);
  const calm = vivid2 > 0.75 ? 0.72 : vivid2 > 0.5 ? 0.8 : 0.9; // the louder the cover, the more it is calmed
  const warmL = clamp(0.5 + (tone - 0.5) * 0.75, 0.45, 0.68);
  return {
    core: hsl(a.h, clamp(a.s * 0.55, 0.26, 0.5), clamp(0.77 + tone * 0.17, 0.8, 0.92)),
    warm: hsl(a.h, clamp(a.s * calm, 0.26, 0.62), warmL),
    mid: hsl(b.h, clamp(b.s * calm * 0.95, 0.24, 0.58), clamp(warmL - 0.1, 0.36, 0.56)),
    deep: hsl(deepH, clamp(deepS * 0.78, 0.24, 0.56), clamp(0.13 + tone * 0.28, 0.16, 0.34)),
  };
}

function paletteFromArtwork(url) {
  if (!url) return Promise.resolve(null);
  url = proxyArtwork(url);
  if (paletteCache.has(url)) return Promise.resolve(paletteCache.get(url));
  return new Promise((resolve) => {
    const img = new Image();
    let done = false;
    const finish = (val, remember) => { if (done) return; done = true; if (remember) paletteCache.set(url, val); resolve(val); };
    const timer = setTimeout(() => finish(null, false), 6000);
    img.crossOrigin = "anonymous";
    img.onload = () => {
      clearTimeout(timer);
      try {
        const size = 32;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, size, size);
        finish(paletteFromPixels(ctx.getImageData(0, 0, size, size).data), true);
      } catch (e) {
        finish(null, true); // cross-origin artwork without CORS headers — retrying won't help
      }
    };
    img.onerror = () => { clearTimeout(timer); finish(null, false); };
    img.src = url;
  });
}

function applyPalette(p) {
  // on :root so the dock's glass picks up the same colors as the light
  const s = document.documentElement.style;
  s.setProperty("--c-core", p.core);
  s.setProperty("--c-warm", p.warm);
  s.setProperty("--c-mid", p.mid);
  s.setProperty("--c-deep", p.deep);
  prismPalette = p;
  if (prism) prism.setGradient([p.deep, p.mid, p.warm, p.core]);
  paintGround(p.deep);
}
// the lowest layer: the light's deep colour darkened (the same mix as the style sheet's), also for
// the strips Telegram draws around the app and the browser's bar
var groundPainted = "";
var groundProbe = null;
function paintGround(deep) {
  let color;
  const root = document.documentElement;
  if (root.classList.contains("minimal")) color = "#121212";
  else if (document.body.dataset.atmo && document.body.dataset.atmo !== "none") color = getComputedStyle(document.body).getPropertyValue("--bg").trim() || BG_COLOR;
  else {
    // any CSS colour (the cover's palette is "hsl(...)"): the browser turns it into rgb()
    if (!groundProbe) { groundProbe = document.createElement("i"); groundProbe.style.display = "none"; document.body.appendChild(groundProbe); }
    groundProbe.style.color = "";
    groundProbe.style.color = String(deep);
    const m = getComputedStyle(groundProbe).color.match(/[\d.]+/g);
    if (!m || m.length < 3) return;
    const base = [10, 7, 9];
    color = "#" + [0, 1, 2].map((k) => Math.round(+m[k] * 0.3 + base[k] * 0.7).toString(16).padStart(2, "0")).join("");
  }
  if (color === groundPainted) return;
  groundPainted = color;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", color);
  if (!tg) return;
  try {
    if (tgAtLeast("6.1")) { tg.setHeaderColor(color); tg.setBackgroundColor(color); }
    if (tgAtLeast("7.10") && tg.setBottomBarColor) tg.setBottomBarColor(color);
  } catch (e) { /* the colours of Telegram's own strips are a nicety */ }
}

// ---- rays in the player (PrismaticBurst port) ----
var prism = null;
var prismUnavailable = false;
var prismPalette = null;
function ensurePrism() {
  if (prism || prismUnavailable || !window.Prism) return prism;
  prism = window.Prism.create($("player-prism"), { intensity: 0.75, speed: 0.3, animationType: "rotate3d", scale: 0.4 });
  if (!prism) { prismUnavailable = true; return null; }
  prism.onGiveUp = () => { prism = null; prismUnavailable = true; $("player-prism").classList.remove("is-on"); };
  const cs = getComputedStyle(document.documentElement);
  const p = prismPalette || { deep: cs.getPropertyValue("--c-deep").trim(), mid: cs.getPropertyValue("--c-mid").trim(), warm: cs.getPropertyValue("--c-warm").trim(), core: cs.getPropertyValue("--c-core").trim() };
  prism.setGradient([p.deep, p.mid, p.warm, p.core]);
  return prism;
}
function placePrism() {
  if (!prism) return;
  const canvas = $("player-prism").getBoundingClientRect();
  const art = $("player-art").getBoundingClientRect();
  const x = art.left + art.width / 2 - canvas.left;
  const y = art.top + art.height / 2 - canvas.top;
  prism.setOrigin(x, y);
  const el = $("player-prism");
  el.style.setProperty("--px", `${x}px`);
  el.style.setProperty("--py", `${y}px`);
  el.style.setProperty("--pr", `${Math.max(art.width, art.height) / 2 + 24}px`);
}
function syncPrism() {
  // the rays burst from behind the cover — with the lyrics open there is no cover
  // …and only the standard player has the square cover they are drawn around
  const on = currentScreen === "player" && document.body.classList.contains("is-playing") && !document.body.classList.contains("lyrics-open")
    && (document.body.dataset.playerTheme || "standard") === "standard" && !isMinimal();
  if (on) {
    if (!ensurePrism()) return;
    requestAnimationFrame(placePrism);
    prism.start();
    $("player-prism").classList.add("is-on");
  } else if (prism) {
    prism.stop();
    $("player-prism").classList.remove("is-on");
  }
}
window.addEventListener("resize", () => requestAnimationFrame(placePrism));

function brandPaletteFor(seed) {
  const h = BRAND_HUES[hashString(seed) % BRAND_HUES.length];
  return { core: hsl(h, 0.9, 0.9), warm: hsl(h, 0.76, 0.62), mid: hsl((h + 340) % 360, 0.5, 0.52), deep: "#44112F" };
}

// The cover under the light is only ever seen as a haze. A big picture blurred by 72px
// is what made weak phones freeze for seconds on every track change, so the cover is
// shrunk to a dozen pixels first and the browser stretches that — the same haze,
// for almost nothing. If the picture can't be read (no CORS), the old way is the fallback.
var tinyArtCache = new Map();
function tinyArt(url) {
  if (!url) return Promise.resolve(null);
  url = proxyArtwork(url);
  if (tinyArtCache.has(url)) return Promise.resolve(tinyArtCache.get(url));
  return new Promise((resolve) => {
    const img = new Image();
    let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      if (val) {
        if (tinyArtCache.size > 40) tinyArtCache.delete(tinyArtCache.keys().next().value);
        tinyArtCache.set(url, val);
      }
      resolve(val);
    };
    const timer = setTimeout(() => finish(null), 6000);
    img.crossOrigin = "anonymous";
    img.onload = () => {
      clearTimeout(timer);
      try {
        // two steps down (not one) so the small picture is an average, not a few sharp samples
        const step = document.createElement("canvas");
        step.width = step.height = 96;
        step.getContext("2d").drawImage(img, 0, 0, 96, 96);
        const tiny = document.createElement("canvas");
        tiny.width = tiny.height = 12;
        tiny.getContext("2d").drawImage(step, 0, 0, 12, 12);
        finish(tiny.toDataURL("image/jpeg", 0.72));
      } catch (e) {
        finish(null);
      }
    };
    img.onerror = () => { clearTimeout(timer); finish(null); };
    img.src = url;
  });
}

var artUrlShown = null;
function showArtUnderLight(url) {
  if (!lightArt || url === artUrlShown) return;
  artUrlShown = url;
  document.body.classList.toggle("has-art", !!url);
  lightArt.classList.remove("is-shown");
  setTimeout(async () => {
    if (artUrlShown !== url) return;
    if (!url) { lightArt.style.backgroundImage = ""; return; }
    const tiny = await tinyArt(url);
    if (artUrlShown !== url) return;
    lightArt.classList.toggle("is-raw", !tiny);
    lightArt.style.backgroundImage = `url("${(tiny || url).replace(/"/g, "%22")}")`;
    requestAnimationFrame(() => lightArt.classList.add("is-shown"));
  }, 450);
}

// What the playing track gives the light. «Оформление» can put a chosen
// palette or one pinned cover in its place (see paintLight).
var DEFAULT_PALETTE = { core: "#FFE9DF", warm: "#FFA6B8", mid: "#FF4FA0", deep: "#44112F" };
var trackLight = { palette: null, art: null };

async function lightForTrack(track) {
  trackLight = { palette: trackLight.palette, art: track.artwork ? hiResArtwork(track.artwork) : null };
  paintLight();
  let palette = await paletteFromArtwork(track.artwork);
  if (!palette && track.artwork && !paletteCache.has(track.artwork)) {
    await new Promise((r) => setTimeout(r, 1200));
    palette = await paletteFromArtwork(track.artwork); // one more try on a flaky network
  }
  if (!currentTrack || currentTrack.id !== track.id) return;
  trackLight.palette = palette || brandPaletteFor(track.id);
  paintLight();
}

