// ============================================================
// ЦИТАТА ИЗ ПЕСНИ: выбираешь строки в тексте и получаешь карточку
// ============================================================
var quotePicking = false;
var quotePicked = new Set();
var quoteStyle = "light";
var quoteCtx = { before: [], after: [], frac: null };
var quoteLines = [];
var quoteTrack = null;
var quoteToken = 0;
var quoteUrl = "";
var QUOTE_MAX = 2;
function quoteBarText() {
  const n = quotePicked.size;
  $("quote-bar-text").textContent = n ? `${n} ${plural(n, "строка", "строки", "строк")} выбрано` : "Выбери 1–2 строки";
  $("quote-bar-make").disabled = !n;
}
function startQuotePick() {
  if (!lyricsOpen || !lyricsData || !lyricsData.lines.length) return;
  quotePicking = true;
  quotePicked.clear();
  lyricsList.classList.add("is-picking");
  document.body.classList.add("quote-picking");
  $("player-quote-btn").setAttribute("aria-pressed", "true");
  $("quote-bar").hidden = false;
  quoteBarText();
  haptic("light");
}
function endQuotePick() {
  quotePicking = false;
  quotePicked.clear();
  lyricsList.classList.remove("is-picking");
  document.body.classList.remove("quote-picking");
  lyricsList.querySelectorAll(".is-picked").forEach((li) => li.classList.remove("is-picked"));
  $("player-quote-btn").setAttribute("aria-pressed", "false");
  $("quote-bar").hidden = true;
}
function toggleQuoteLine(li) {
  const i = +li.dataset.i;
  if (quotePicked.has(i)) { quotePicked.delete(i); li.classList.remove("is-picked"); }
  else {
    if (quotePicked.size >= QUOTE_MAX) { showToast(`Можно выбрать до ${QUOTE_MAX} строк`); return; }
    quotePicked.add(i); li.classList.add("is-picked");
  }
  haptic("select");
  quoteBarText();
}
$("player-quote-btn").addEventListener("click", () => { if (quotePicking) endQuotePick(); else startQuotePick(); });
$("quote-bar-cancel").addEventListener("click", endQuotePick);

function rgbOf(color) {
  try {
    const c = document.createElement("canvas"); c.width = c.height = 1;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.fillStyle = color; x.fillRect(0, 0, 1, 1);
    const d = x.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  } catch (e) { return [120, 80, 120]; }
}
var rgba = (rgb, a) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
var mixRgb = (a, b, k) => a.map((v, i) => Math.round(v * (1 - k) + b[i] * k));
function glowAt(ctx, x, y, r, rgb, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(rgb, alpha)); g.addColorStop(1, rgba(rgb, 0));
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1080, 1350);
}
function fitText(ctx, lines, maxW, sizes, maxH, lhK) {
  for (const size of sizes) {
    ctx.font = `800 ${size}px ${SHARE_FONT}`;
    let wrapped = [];
    lines.forEach((ln) => { wrapped = wrapped.concat(wrapLines(ctx, ln, maxW, 9)); });
    if (wrapped.length * size * lhK <= maxH) return { size, wrapped };
  }
  const size = sizes[sizes.length - 1];
  ctx.font = `800 ${size}px ${SHARE_FONT}`;
  let wrapped = [];
  lines.forEach((ln) => { wrapped = wrapped.concat(wrapLines(ctx, ln, maxW, 9)); });
  return { size, wrapped: wrapped.slice(0, Math.floor(maxH / (size * lhK))) };
}
function cutText(ctx, str, maxW) {
  let t = String(str);
  while (ctx.measureText(t).width > maxW && t.length > 3) t = t.slice(0, -2);
  return t === String(str) ? t : t.trimEnd() + "…";
}
async function renderQuoteImage(track, lines, style) {
  try { await document.fonts.load("800 100px Onest"); await document.fonts.load("700 46px Unbounded"); } catch (e) { /* the system font is fine */ }
  const W = 1080, H = 1350, F = SHARE_FONT;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.textBaseline = "alphabetic";
  const th = themeColors();
  const art = track.artwork ? hiResArtwork(track.artwork) : null;
  const img = await loadShareImg(art);
  let pal = null;
  try { pal = art ? await paletteFromArtwork(track.artwork) : null; } catch (e) { pal = null; }
  pal = pal || th;
  const deep = rgbOf(pal.deep), warm = rgbOf(pal.warm), mid = rgbOf(pal.mid), core = rgbOf(pal.core);
  const night = [26, 11, 22];
  // фон: тёмный и живой свет, как в самой Нотке
  ctx.fillStyle = rgba(mixRgb(deep, night, 0.6), 1); ctx.fillRect(0, 0, W, H);
  if (style === "light") { glowAt(ctx, 160, 260, 760, warm, 0.8); glowAt(ctx, 960, 700, 720, mid, 0.65); glowAt(ctx, 560, 90, 420, core, 0.35); }
  else { glowAt(ctx, 900, 1150, 980, warm, 0.75); glowAt(ctx, 120, 220, 760, mid, 0.6); glowAt(ctx, 540, 640, 420, core, 0.2); }
  const pad = 84;
  // метка Нотки
  drawLogo(ctx, pad, 76, 60, "rgba(255,255,255,0.92)");
  ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.font = `800 44px ${F}`;
  ctx.font = `700 46px ${BRAND_FONT}`; try { ctx.letterSpacing = "-2px"; } catch (e) { /* the plain spacing is fine */ }
  ctx.fillText("нотка", pad + 76, 126);
  try { ctx.letterSpacing = "0px"; } catch (e) { /* ok */ }

  if (style === "light") {
    // как текст в плеере Нотки: слева, поющаяся строка горит и чуть крупнее, соседние приглушены
    const cw = W - pad * 2;
    const prev = quoteCtx.before.length ? quoteCtx.before[quoteCtx.before.length - 1] : "";
    const next = quoteCtx.after.length ? quoteCtx.after[0] : "";
    const regionTop = 190, regionBottom = H - 60 - 250 - 36, regionH = regionBottom - regionTop;
    let layout = null;
    for (const size of [82, 76, 70, 64, 58, 52, 48]) {
      const big = Math.round(size * 1.3);
      const wrapGroup = (arr, cap, fs) => { ctx.font = `700 ${fs}px ${F}`; return arr.reduce((acc, ln) => acc.concat(wrapLines(ctx, ln, cw, 9)), []).slice(0, cap); };
      const g = [wrapGroup(prev ? [prev] : [], 2, size), wrapGroup(lines, 9, big), wrapGroup(next ? [next] : [], 2, size)];
      const gaps = (g[0].length ? 1 : 0) + (g[2].length ? 1 : 0);
      const h = (g[0].length + g[2].length) * size * 1.2 + g[1].length * big * 1.14 + gaps * size * 0.5;
      layout = { size, big, g, h };
      if (h <= regionH) break;
    }
    const { size: S, big: BIG, g: groups, h: blockH } = layout;
    let y = regionTop + (regionH - Math.min(blockH, regionH)) / 2;
    groups.forEach((grp, gi) => {
      if (!grp.length) return;
      const fs = gi === 1 ? BIG : S;
      ctx.font = `${gi === 1 ? 800 : 700} ${fs}px ${F}`;
      ctx.fillStyle = gi === 1 ? "#fff" : gi === 0 ? "rgba(255,255,255,0.36)" : "rgba(255,255,255,0.5)";
      if (gi === 1) { ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 2; }
      const lhh = gi === 1 ? fs * 1.14 : fs * 1.2;
      grp.forEach((ln) => { ctx.fillText(ln, pad, y + fs * 0.88); y += lhh; });
      ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      y += S * 0.5;
    });
    // плеер
    const sx = 60, sh = 250, sy = H - 60 - sh, sw = W - 120;
    roundPath(ctx, sx, sy, sw, sh, 64);
    ctx.fillStyle = "rgba(255,255,255,0.14)"; ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.26)"; ctx.lineWidth = 2.5; ctx.stroke();
    const cs = 154, cx0 = sx + 34, cy0 = sy + 30;
    ctx.save(); roundPath(ctx, cx0, cy0, cs, cs, 36); ctx.clip();
    if (img) coverFit(ctx, img, cx0, cy0, cs, cs); else { ctx.fillStyle = rgba(warm, 1); ctx.fillRect(cx0, cy0, cs, cs); }
    ctx.restore();
    const tx = cx0 + cs + 34, tmax = sw - (tx - sx) - 34 - 130 - 24;
    ctx.fillStyle = "#fff"; ctx.font = `800 58px ${F}`;
    ctx.fillText(cutText(ctx, track.title || "", tmax), tx, cy0 + 70);
    ctx.fillStyle = "rgba(255,255,255,0.74)"; ctx.font = `500 46px ${F}`;
    ctx.fillText(cutText(ctx, track.artist || "", tmax), tx, cy0 + 130);
    const bx = sx + sw - 34 - 65, by = cy0 + cs / 2;
    ctx.fillStyle = "#F4EFFF"; ctx.beginPath(); ctx.arc(bx, by, 65, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#16101f";
    roundPath(ctx, bx - 23, by - 27, 15, 54, 5); ctx.fill();
    roundPath(ctx, bx + 8, by - 27, 15, 54, 5); ctx.fill();
    const frac = quoteCtx.frac == null ? 0.38 : Math.max(0.03, Math.min(0.97, quoteCtx.frac));
    const px0 = sx + 38, pw = sw - 76, py = sy + sh - 44;
    roundPath(ctx, px0, py, pw, 11, 6); ctx.fillStyle = "rgba(255,255,255,0.24)"; ctx.fill();
    roundPath(ctx, px0, py, Math.max(11, pw * frac), 11, 6); ctx.fillStyle = "#fff"; ctx.fill();
  } else {
    // цитата и большая пластинка с тонармом, как в темах плеера
    const fit = fitText(ctx, lines, W - pad * 2, [118, 108, 98, 90, 82, 74, 66, 58, 50], 440, 1.1);
    const lh = fit.size * 1.1;
    const textH = fit.wrapped.length * lh;
    const top = 230 + Math.max(0, (440 - textH) / 2);
    ctx.fillStyle = "#fff"; ctx.font = `800 ${fit.size}px ${F}`;
    ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = 24;
    fit.wrapped.forEach((ln, i) => ctx.fillText(ln, pad, top + fit.size * 0.88 + i * lh));
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
    // пластинка
    const dx = 690, dy = 1390, dr = 630;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = 70; ctx.shadowOffsetY = 24;
    ctx.fillStyle = "#1a0b16"; ctx.beginPath(); ctx.arc(dx, dy, dr + 12, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath(); ctx.arc(dx, dy, dr, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = rgba(mid, 1); ctx.fillRect(dx - dr, dy - dr, dr * 2, dr * 2);
    if (img) { ctx.translate(dx, dy); ctx.rotate(-0.22); coverFit(ctx, img, -dr, -dr, dr * 2, dr * 2); ctx.rotate(0.22); ctx.translate(-dx, -dy); }
    ctx.strokeStyle = "rgba(0,0,0,0.22)"; ctx.lineWidth = 2;
    for (let rr = 140; rr < dr; rr += 14) { ctx.beginPath(); ctx.arc(dx, dy, rr, 0, Math.PI * 2); ctx.stroke(); }
    const sheen = ctx.createLinearGradient(dx - dr, dy - dr, dx + dr * 0.6, dy + dr * 0.6);
    sheen.addColorStop(0, "rgba(255,255,255,0.24)"); sheen.addColorStop(0.5, "rgba(255,255,255,0)"); sheen.addColorStop(1, "rgba(255,255,255,0.08)");
    ctx.fillStyle = sheen; ctx.fillRect(dx - dr, dy - dr, dr * 2, dr * 2);
    ctx.restore();
    ctx.fillStyle = rgba(warm, 1); ctx.beginPath(); ctx.arc(dx, dy, 92, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(dx, dy, 92, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#1a0b16"; ctx.beginPath(); ctx.arc(dx, dy, 16, 0, Math.PI * 2); ctx.fill();
    // тонарм
    const ax = 985, ay = 850, hx = 790, hy = 1215;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10;
    ctx.strokeStyle = "#F4EFFF"; ctx.lineCap = "round"; ctx.lineWidth = 18;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.fillStyle = "#16101f"; ctx.beginPath(); ctx.arc(ax, ay, 46, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#F4EFFF"; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(ax, ay, 46, 0, Math.PI * 2); ctx.stroke();
    ctx.translate(hx, hy); ctx.rotate(Math.atan2(hy - ay, hx - ax) - Math.PI / 2);
    ctx.fillStyle = "#F4EFFF"; roundPath(ctx, -26, -6, 52, 96, 14); ctx.fill();
    ctx.restore();
    // название и исполнитель на стеклянной плашке
    const pw = 560, ph = 150, px = W - 60 - pw, py = 56;
    roundPath(ctx, px, py, pw, ph, 52);
    ctx.fillStyle = "rgba(255,255,255,0.14)"; ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.26)"; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.font = `800 52px ${F}`;
    ctx.fillText(cutText(ctx, track.title || "", pw - 72), px + 36, py + 68);
    ctx.fillStyle = "rgba(255,255,255,0.75)"; ctx.font = `500 42px ${F}`;
    ctx.fillText(cutText(ctx, track.artist || "", pw - 72), px + 36, py + 118);
  }
  return canvasToBlob(canvas);
}
async function paintQuotePreview() {
  const token = ++quoteToken;
  $("quote-preview").style.opacity = "0.4";
  let blob = null;
  try { blob = await renderQuoteImage(quoteTrack, quoteLines, quoteStyle); } catch (e) { blob = null; }
  if (token !== quoteToken) return;
  if (!blob) {
    $("quote-preview").style.opacity = "";
    showToast("Не получилось собрать картинку. Нажми стиль ещё раз");
    return;
  }
  if (quoteUrl) URL.revokeObjectURL(quoteUrl);
  quoteUrl = URL.createObjectURL(blob);
  $("quote-preview").src = quoteUrl;
  $("quote-preview").style.opacity = "";
  $("quote-preview").dataset.ready = "1";
}
new MutationObserver(() => document.body.classList.toggle("quote-sheet-open", $("quote-sheet").classList.contains("open")))
  .observe($("quote-sheet"), { attributes: true, attributeFilter: ["class"] });
$("quote-bar-make").addEventListener("click", () => {
  if (!quotePicked.size || !currentTrack || !lyricsData) return;
  quoteTrack = currentTrack;
  const idx = [...quotePicked].sort((a, b) => a - b);
  quoteLines = idx.map((i) => lyricsData.lines[i].text);
  const all = lyricsData.lines;
  quoteCtx = {
    before: all.slice(Math.max(0, idx[0] - 2), idx[0]).map((l) => l.text).filter(Boolean),
    after: all.slice(idx[idx.length - 1] + 1, idx[idx.length - 1] + 3).map((l) => l.text).filter(Boolean),
    frac: lyricsData.synced && (quoteTrack.duration || audio.duration) ? all[idx[0]].t / (quoteTrack.duration || audio.duration) : null,
  };
  $("quote-preview").dataset.ready = "";
  openOverlay("quote-sheet");
  paintQuotePreview();
});
$("quote-styles").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  quoteStyle = chip.dataset.style;
  $("quote-styles").querySelectorAll(".chip").forEach((c) => { c.classList.toggle("active", c === chip); c.setAttribute("aria-selected", c === chip ? "true" : "false"); });
  haptic("light");
  paintQuotePreview();
});
$("quote-share-btn").addEventListener("click", async () => {
  const btn = $("quote-share-btn");
  if (btn.disabled || !quoteTrack) return;
  btn.disabled = true;
  try {
    const blob = await renderQuoteImage(quoteTrack, quoteLines, quoteStyle);
    if (!blob) throw new Error("no image");
    closeOverlay("quote-sheet");
    await shareImageBlob(blob, "notka-citata.png");
    endQuotePick();
  } catch (e) {
    showToast("Не получилось собрать картинку. Попробуй ещё раз");
  } finally {
    btn.disabled = false;
  }
});


