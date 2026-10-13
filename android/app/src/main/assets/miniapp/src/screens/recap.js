// ============================================================
// ИТОГИ: карточки месяца и всего времени, которыми можно поделиться
// ============================================================
var recapPeriod = "30";
var recapCards = [];
function recapData() {
  const all = recapPeriod === "all";
  const S = statsFor(all ? "all" : 30);
  if (!S.tracks.length || S.seconds < 1) return [];
  const minutes = Math.max(1, Math.round(S.seconds / 60));
  const cards = [{ type: "minutes", kicker: all ? "Всё время в Нотке" : "Твой месяц в Нотке", minutes, word: `${plural(minutes, "минута", "минуты", "минут")} музыки`, note: minutesNote(minutes), tracks: S.tracks.length, artists: S.artists.length }];
  const top = S.artists[0];
  if (top) {
    const m = Math.max(1, Math.round(top.seconds / 60));
    cards.push({ type: "artist", kicker: "Исполнитель № 1", name: top.name, photo: artistFace(top.name), sub: `${m} ${plural(m, "минута", "минуты", "минут")} вместе` });
  }
  if (S.tracks.length >= 2) cards.push({ type: "tracks", kicker: "Чаще всего играло", rows: S.tracks.slice(0, 5).map((x) => ({ title: x.track.title, sub: x.track.artist || "", art: x.track.artwork, seed: x.track.id })) });
  if (S.artists.length >= 3) cards.push({ type: "artists", kicker: "Твоя пятёрка", rows: S.artists.slice(0, 5).map((a) => { const m = Math.max(1, Math.round(a.seconds / 60)); return { title: a.name, sub: `${m} ${plural(m, "минута", "минуты", "минут")}`, art: artistFace(a.name), seed: a.name }; }) });
  return cards;
}
function recapCardEl(card, i) {
  const el = document.createElement("article");
  el.className = "rcp-card";
  el.dataset.v = String(i % 4);
  const mk = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const top = mk("div", "rcp-top");
  const brand = mk("span", "rcp-brand");
  brand.innerHTML = '<svg aria-hidden="true"><use href="#logo-note"/></svg>';
  brand.appendChild(document.createTextNode("нотка"));
  top.append(brand, mk("span", "rcp-pill", card.kicker));
  el.appendChild(top);
  if (card.type === "minutes") {
    const num = mk("b", "rcp-num", card.minutes.toLocaleString("ru-RU"));
    if (String(card.minutes).length >= 4) num.classList.add("is-long");
    el.append(num, mk("span", "rcp-word", card.word), mk("p", "rcp-note", card.note));
    const plate = mk("div", "rcp-plate");
    [[card.tracks, plural(card.tracks, "трек", "трека", "треков")], [card.artists, plural(card.artists, "исполнитель", "исполнителя", "исполнителей")]].forEach(([n, w]) => {
      const st = mk("span", "rcp-stat");
      st.append(mk("b", "", String(n)), mk("span", "", w));
      plate.appendChild(st);
    });
    el.appendChild(plate);
  } else if (card.type === "artist") {
    el.classList.add("is-artist");
    const head = mk("div", "rcp-artist-head");
    head.append(mk("b", "rcp-name", card.name), mk("span", "rcp-word", card.sub));
    const disc = mk("div", "rcp-disc");
    const cv = mk("span");
    setCoverEl(cv, card.photo ? hiResArtwork(card.photo) : null, card.name);
    disc.appendChild(cv);
    el.append(head, disc);
  } else {
    const list = mk("div", "rcp-list");
    card.rows.forEach((r, n) => {
      const row = mk("div", "rcp-row" + (card.type === "artists" ? " is-round" : ""));
      const cv = mk("span", "cover");
      setCoverEl(cv, r.art ? hiResArtwork(r.art) : null, r.seed);
      const t = mk("span", "t");
      t.append(mk("b", "", r.title), mk("em", "", r.sub));
      row.append(mk("i", "", String(n + 1)), cv, t);
      list.appendChild(row);
    });
    el.appendChild(list);
  }
  return el;
}
function renderRecap() {
  recapCards = recapData();
  const empty = !recapCards.length;
  $("recap-body").hidden = empty;
  $("recap-empty").hidden = !empty;
  if (empty) return;
  const deck = $("recap-deck");
  deck.textContent = "";
  recapCards.forEach((c, i) => deck.appendChild(recapCardEl(c, i)));
  deck.scrollLeft = 0;
  const dots = $("recap-dots");
  dots.textContent = "";
  recapCards.forEach((_, i) => { const d = document.createElement("i"); if (i === 0) d.className = "is-on"; dots.appendChild(d); });
  revealIn("screen-recap", true);
}
function recapIndex() {
  const deck = $("recap-deck");
  const first = deck.firstElementChild;
  if (!first) return 0;
  const step = first.offsetWidth + 12;
  return Math.max(0, Math.min(recapCards.length - 1, Math.round(deck.scrollLeft / step)));
}
$("recap-deck").addEventListener("scroll", () => {
  const i = recapIndex();
  $("recap-dots").querySelectorAll("i").forEach((d, n) => d.classList.toggle("is-on", n === i));
}, { passive: true });
$("recap-periods").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  recapPeriod = chip.dataset.period;
  $("recap-periods").querySelectorAll(".chip").forEach((c) => {
    c.classList.toggle("active", c === chip);
    c.setAttribute("aria-selected", c === chip ? "true" : "false");
  });
  haptic("light");
  renderRecap();
});
$("recap-back-btn").addEventListener("click", goBack);
$("recap-modal-close").addEventListener("click", () => closeOverlay("recap-modal"));
function openRecap() {
  if (!hasPlus()) { showToast("Итоги входят в Нотку Плюс"); showScreen("plus"); return; }
  showScreen("recap");
}
$("stats-recap-btn").addEventListener("click", openRecap);
$("plus-recap-btn").addEventListener("click", openRecap);

// карточка как картинка
var loadShareImgOnce = (url) => new Promise((resolve) => {
  if (!url) { resolve(null); return; }
  url = proxyArtwork(url);
  const img = new Image();
  const timer = setTimeout(() => resolve(null), 8000);
  img.crossOrigin = "anonymous";
  img.onload = () => { clearTimeout(timer); resolve(img); };
  img.onerror = () => { clearTimeout(timer); resolve(null); };
  img.src = url;
});
// обложка иногда не успевает с первого раза: одна повторная попытка
var loadShareImg = async (url) => (await loadShareImgOnce(url)) || (await loadShareImgOnce(url));
function coverFit(ctx, img, x, y, w, h) {
  const k = Math.max(w / img.width, h / img.height);
  const iw = w / k, ih = h / k;
  ctx.drawImage(img, (img.width - iw) / 2, (img.height - ih) / 2, iw, ih, x, y, w, h);
}
function roundPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function wrapLines(ctx, text, maxW, maxLines) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  words.forEach((w) => {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  });
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}
var clamp01 = (x) => Math.max(0, Math.min(1, x));
function lumOf(color) {
  try {
    const c = document.createElement("canvas"); c.width = c.height = 1;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.fillStyle = color; x.fillRect(0, 0, 1, 1);
    const d = x.getImageData(0, 0, 1, 1).data;
    return (0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2]) / 255;
  } catch (e) { return 0.5; }
}
function themeColors() {
  const css = getComputedStyle(document.documentElement);
  const col = (n, d) => (css.getPropertyValue(n) || d).trim() || d;
  return { core: col("--c-core", "#FFE9DF"), warm: col("--c-warm", "#FFA6B8"), mid: col("--c-mid", "#FF4FA0"), deep: col("--c-deep", "#44112F") };
}
// логотип Нотки для картинок: знак из двух модулей (прямоугольник и четверть круга)
var LOGO_PATHS = [new Path2D("M120 120C86.8629 120 60 93.1371 60 60V0H120V120Z"), new Path2D("M0 120H60V60C60 26.8629 33.1371 0 0 0V120Z")];
function drawLogo(ctx, x, y, size, color) {
  ctx.save();
  ctx.translate(x, y);
  const k = size / 120;
  ctx.scale(k, k);
  ctx.fillStyle = color;
  LOGO_PATHS.forEach((p) => ctx.fill(p));
  ctx.restore();
}
var SHARE_FONT = "Onest, system-ui, -apple-system, sans-serif";
var BRAND_FONT = "Unbounded, Onest, system-ui, sans-serif";
// вертикальная плашка из стекла, как в карточках с цитатами
function glassPlate(ctx, x, y, w, h, r, strong) {
  roundPath(ctx, x, y, w, h, r);
  ctx.fillStyle = strong ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.13)"; ctx.fill();
  ctx.strokeStyle = strong ? "rgba(255,255,255,0.32)" : "rgba(255,255,255,0.24)"; ctx.lineWidth = 2.5; ctx.stroke();
}
async function renderRecapImage(card, index) {
  try { await document.fonts.load("800 100px Onest"); await document.fonts.load("700 46px Unbounded"); } catch (e) { /* the system font is fine */ }
  const W = 1080, H = 1350, F = SHARE_FONT;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.textBaseline = "alphabetic";
  const th = themeColors();
  const deep = rgbOf(th.deep), warm = rgbOf(th.warm), mid = rgbOf(th.mid);
  ctx.fillStyle = rgba(mixRgb(deep, [12, 10, 18], 0.6), 1); ctx.fillRect(0, 0, W, H);
  const v = index % 4;
  const lights = [[[120, 80, 780, warm, 0.8], [1080, 800, 740, mid, 0.66]], [[1060, 80, 760, warm, 0.8], [0, 900, 740, mid, 0.66]], [[540, 1350, 860, warm, 0.76], [0, 120, 700, mid, 0.66]], [[0, 1350, 780, warm, 0.78], [1080, 150, 740, mid, 0.66]]][v];
  lights.forEach(([x, y, r, col, al]) => glowAt(ctx, x, y, r, col, al));
  const pad = 84;
  // метка и подпись периода
  drawLogo(ctx, pad, 76, 60, "rgba(255,255,255,0.92)");
  ctx.fillStyle = "rgba(255,255,255,0.92)"; ctx.font = `800 44px ${F}`;
  ctx.font = `700 46px ${BRAND_FONT}`; try { ctx.letterSpacing = "-2px"; } catch (e) { /* the plain spacing is fine */ }
  ctx.fillText("нотка", pad + 76, 126);
  try { ctx.letterSpacing = "0px"; } catch (e) { /* ok */ }
  ctx.font = `700 40px ${F}`;
  const kick = cutText(ctx, card.kicker, 520);
  const kw = ctx.measureText(kick).width + 64;
  glassPlate(ctx, W - 60 - kw, 64, kw, 90, 45, false);
  ctx.fillStyle = "#fff";
  ctx.fillText(kick, W - 60 - kw + 32, 124);
  ctx.fillStyle = "#fff";
  if (card.type === "minutes") {
    const num = card.minutes.toLocaleString("ru-RU");
    const size = num.length >= 6 ? 290 : num.length >= 4 ? 350 : 420;
    ctx.font = `800 ${size}px ${F}`;
    ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = 36;
    ctx.fillText(num, pad - 10, 640);
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
    ctx.font = `800 82px ${F}`;
    ctx.fillText(card.word, pad, 750);
    ctx.fillStyle = "rgba(255,255,255,0.78)"; ctx.font = `500 46px ${F}`;
    wrapLines(ctx, card.note, W - pad * 2, 3).forEach((l, i) => ctx.fillText(l, pad, 835 + i * 60));
    const px = 60, ph = 190, py = H - 60 - ph, pw = W - 120;
    glassPlate(ctx, px, py, pw, ph, 56, false);
    const stats = [[card.tracks, plural(card.tracks, "трек", "трека", "треков")], [card.artists, plural(card.artists, "исполнитель", "исполнителя", "исполнителей")]];
    stats.forEach(([n, w], i) => {
      const cx = px + pw * (i * 2 + 1) / 4;
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff"; ctx.font = `800 84px ${F}`; ctx.fillText(String(n), cx, py + 98);
      ctx.fillStyle = "rgba(255,255,255,0.75)"; ctx.font = `500 40px ${F}`; ctx.fillText(w, cx, py + 154);
      ctx.textAlign = "left";
    });
    ctx.fillStyle = "rgba(255,255,255,0.22)"; ctx.fillRect(px + pw / 2 - 1, py + 40, 2, ph - 80);
  } else if (card.type === "artist") {
    ctx.font = `800 132px ${F}`;
    const lines = wrapLines(ctx, card.name, W - pad * 2, 3);
    ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = 30;
    ctx.fillStyle = "#fff";
    lines.forEach((l, i) => ctx.fillText(l, pad, 300 + i * 126));
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
    ctx.font = `800 62px ${F}`; ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillText(card.sub, pad, 300 + lines.length * 126 + 22);
    const img = await loadShareImg(card.photo ? hiResArtwork(card.photo) : null);
    const dx = 690, dy = 1400, dr = 640;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = 70; ctx.shadowOffsetY = 24;
    ctx.fillStyle = "#1a0b16"; ctx.beginPath(); ctx.arc(dx, dy, dr + 12, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath(); ctx.arc(dx, dy, dr, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = rgba(mid, 1); ctx.fillRect(dx - dr, dy - dr, dr * 2, dr * 2);
    if (img) { ctx.translate(dx, dy); ctx.rotate(-0.22); coverFit(ctx, img, -dr, -dr, dr * 2, dr * 2); ctx.rotate(0.22); ctx.translate(-dx, -dy); }
    ctx.strokeStyle = "rgba(0,0,0,0.2)"; ctx.lineWidth = 2;
    for (let rr = 140; rr < dr; rr += 14) { ctx.beginPath(); ctx.arc(dx, dy, rr, 0, Math.PI * 2); ctx.stroke(); }
    const sheen = ctx.createLinearGradient(dx - dr, dy - dr, dx + dr * 0.6, dy + dr * 0.6);
    sheen.addColorStop(0, "rgba(255,255,255,0.24)"); sheen.addColorStop(0.5, "rgba(255,255,255,0)"); sheen.addColorStop(1, "rgba(255,255,255,0.08)");
    ctx.fillStyle = sheen; ctx.fillRect(dx - dr, dy - dr, dr * 2, dr * 2);
    ctx.restore();
  } else {
    const round = card.type === "artists";
    const imgs = await Promise.all(card.rows.map((r) => loadShareImg(r.art ? hiResArtwork(r.art) : null)));
    const rh = 168, gap = 20, x0 = 60, w0 = W - 120, y0 = 250;
    card.rows.forEach((r, i) => {
      const y = y0 + i * (rh + gap);
      glassPlate(ctx, x0, y, w0, rh, 48, i === 0);
      ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.font = `800 52px ${F}`; ctx.textAlign = "center";
      ctx.fillText(String(i + 1), x0 + 54, y + rh / 2 + 18);
      ctx.textAlign = "left";
      const s = 120, cx = x0 + 100, cy = y + (rh - s) / 2;
      ctx.save();
      if (round) { ctx.beginPath(); ctx.arc(cx + s / 2, cy + s / 2, s / 2, 0, Math.PI * 2); ctx.closePath(); } else roundPath(ctx, cx, cy, s, s, 30);
      ctx.clip();
      if (imgs[i]) coverFit(ctx, imgs[i], cx, cy, s, s); else { ctx.fillStyle = "rgba(255,255,255,0.2)"; ctx.fillRect(cx, cy, s, s); }
      ctx.restore();
      const tx = cx + s + 30, tmax = x0 + w0 - tx - 36;
      ctx.fillStyle = "#fff"; ctx.font = `800 52px ${F}`;
      ctx.fillText(cutText(ctx, r.title, tmax), tx, y + 76);
      ctx.fillStyle = "rgba(255,255,255,0.74)"; ctx.font = `500 40px ${F}`;
      ctx.fillText(cutText(ctx, r.sub, tmax), tx, y + 128);
    });
  }
  return canvasToBlob(canvas);
}

// PNG of a big canvas can come back empty on a phone short of memory: then a JPEG, which is lighter
function canvasToBlob(canvas) {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => {
        if (b) return resolve(b);
        try { canvas.toBlob((b2) => resolve(b2), "image/jpeg", 0.92); } catch (e) { resolve(null); }
      }, "image/png");
    } catch (e) { resolve(null); }
  });
}

// Inside Telegram (Android above all) a plain «download» link in the web view saves nothing and
// says nothing. Telegram's own «save file» does the job, but takes a link: the picture is put on
// the server for a quarter of an hour and the link is handed over.
async function saveImageViaTelegram(blob, name) {
  if (!(tg && typeof tg.downloadFile === "function" && tgAtLeast("8.0") && tgInitRaw)) return false;
  try {
    const res = await fetch(`${API_BASE_URL}/card`, {
      method: "POST",
      headers: { "content-type": blob.type || "image/png", "X-Telegram-Init-Data": tgInitRaw },
      body: blob,
    });
    if (!res.ok) return false;
    const { url } = await res.json();
    const base = (API_BASE_URL || window.location.origin).replace(/\/$/, "");
    const ext = blob.type === "image/jpeg" ? ".jpg" : ".png";
    const fileName = name.replace(/\.[a-z]+$/i, "") + ext;
    return await new Promise((resolve) => {
      try { tg.downloadFile({ url: base + url, file_name: fileName }, (ok) => resolve(!!ok)); }
      catch (e) { resolve(false); }
    });
  } catch (e) {
    return false;
  }
}

// отправка картинки: только сама картинка, без подписи.
// На телефоне открывается системное «Поделиться»; там, где его нет (компьютер, Telegram Desktop),
// показываем картинку с кнопками «Скачать» и «Скопировать».
var lastShareBlob = null, lastShareName = "notka.png";
async function shareImageBlob(blob, name) {
  const file = new File([blob], name, { type: blob.type || "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); haptic("success"); return; }
    catch (e) { if (e && e.name === "AbortError") return; /* else the next way */ }
  }
  if (await saveImageViaTelegram(blob, name)) { haptic("success"); showToast("Картинка сохранена"); return; }
  lastShareBlob = blob; lastShareName = name;
  $("recap-preview").src = URL.createObjectURL(blob);
  openOverlay("recap-modal");
}
$("recap-modal-download").addEventListener("click", async () => {
  if (!lastShareBlob) return;
  if (await saveImageViaTelegram(lastShareBlob, lastShareName)) { showToast("Картинка сохранена"); return; }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(lastShareBlob);
  a.download = lastShareName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  showToast("Если картинка не сохранилась, нажми на неё и удерживай");
});
$("recap-modal-copy").addEventListener("click", async () => {
  if (!lastShareBlob) return;
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": lastShareBlob })]);
    showToast("Скопировано. Вставь в чат");
  } catch (e) {
    showToast("Не получилось скопировать, нажми «Скачать»");
  }
});
$("recap-share-btn").addEventListener("click", async () => {
  const btn = $("recap-share-btn");
  if (btn.disabled) return;
  const index = recapIndex();
  const card = recapCards[index];
  if (!card) return;
  btn.disabled = true;
  haptic("light");
  try {
    const blob = await renderRecapImage(card, index);
    if (!blob) throw new Error("no image");
    await shareImageBlob(blob, "notka-itogi.png");
  } catch (e) {
    showToast("Не получилось собрать картинку. Попробуй ещё раз");
  } finally {
    btn.disabled = false;
  }
});

