// ============================================================
// Sheets / modals
// ============================================================
var openOverlays = [];
function openOverlay(id) {
  const el = $(id);
  if (!el) return;
  el.style.display = "flex";
  el.classList.remove("open");
  void el.offsetWidth;
  requestAnimationFrame(() => el.classList.add("open"));
  if (!openOverlays.includes(id)) openOverlays.push(id);
  syncBackButton();
}
function closeOverlay(id) {
  const el = $(id);
  if (!el) return;
  el.classList.remove("open");
  const idx = openOverlays.indexOf(id);
  if (idx >= 0) openOverlays.splice(idx, 1);
  setTimeout(() => { if (!el.classList.contains("open")) el.style.display = "none"; }, 380);
  syncBackButton();
}
document.querySelectorAll(".sheet-anim, .modal-anim").forEach((el) => {
  el.addEventListener("click", (e) => { if (e.target === el) closeOverlay(el.id); });
});

// A sheet is put away by pulling its handle (or its title) down, as in any phone app.
document.querySelectorAll(".sheet-anim > .sheet").forEach((sheet) => {
  const overlay = sheet.parentElement;
  let drag = null;
  sheet.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!e.target.closest(".sheet-handle, .sheet-head, .sheet-title")) return;
    drag = { id: e.pointerId, y: e.clientY, dy: 0, t: performance.now() };
    try { sheet.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
  });
  sheet.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.dy = Math.max(0, e.clientY - drag.y);
    sheet.style.transition = "none";
    sheet.style.transform = `translateY(${drag.dy}px)`;
  });
  const end = (e) => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const d = drag;
    drag = null;
    const speed = d.dy / Math.max(1, performance.now() - d.t); // px per ms
    if (d.dy > 110 || (d.dy > 36 && speed > 0.5)) {
      sheet.style.transition = "transform 0.22s ease-out";
      sheet.style.transform = "translateY(110%)";
      closeOverlay(overlay.id);
      setTimeout(() => { sheet.style.transition = ""; sheet.style.transform = ""; }, 420);
    } else {
      sheet.style.transition = "transform 0.25s var(--ease-out)";
      sheet.style.transform = "";
      setTimeout(() => { sheet.style.transition = ""; }, 280);
    }
  };
  sheet.addEventListener("pointerup", end);
  sheet.addEventListener("pointercancel", end);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && openOverlays.length) closeOverlay(openOverlays[openOverlays.length - 1]);
});

// A mouse has no sideways swipe: a shelf under the pointer gets arrows.
var shelfArrows = ["left", "right"].map((dir) => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `shelf-arrow shelf-arrow-${dir}`;
  b.setAttribute("aria-label", dir === "left" ? "Назад" : "Вперёд");
  b.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${dir === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"}"/></svg>`;
  document.body.appendChild(b);
  return b;
});
var arrowShelf = null;
var arrowHideTimer = 0;
function placeShelfArrows() {
  const s = arrowShelf;
  if (!s || !isDesktop() || !s.isConnected || s.offsetParent === null) { shelfArrows.forEach((b) => b.classList.remove("is-on")); return; }
  const r = s.getBoundingClientRect();
  const cardH = Math.min(r.height, 170);
  const top = r.top + Math.max(0, (cardH - 40) / 2);
  const canL = s.scrollLeft > 4, canR = s.scrollLeft + s.clientWidth < s.scrollWidth - 4;
  shelfArrows[0].style.cssText = `left:${Math.round(r.left + 6)}px;top:${Math.round(top)}px`;
  shelfArrows[1].style.cssText = `left:${Math.round(r.right - 46)}px;top:${Math.round(top)}px`;
  shelfArrows[0].classList.toggle("is-on", canL);
  shelfArrows[1].classList.toggle("is-on", canR);
}
shelfArrows.forEach((b, i) => b.addEventListener("click", () => {
  if (!arrowShelf) return;
  arrowShelf.scrollBy({ left: (i ? 1 : -1) * Math.round(arrowShelf.clientWidth * 0.85), behavior: "smooth" });
  setTimeout(placeShelfArrows, 450);
}));
document.addEventListener("mouseover", (e) => {
  if (!isDesktop() || !e.target.closest) return;
  const s = e.target.closest(".shelf");
  clearTimeout(arrowHideTimer);
  if (s) { arrowShelf = s; placeShelfArrows(); return; }
  if (e.target.closest(".shelf-arrow")) return;
  arrowHideTimer = setTimeout(() => { arrowShelf = null; placeShelfArrows(); }, 250);
});
document.addEventListener("scroll", () => { if (arrowShelf) placeShelfArrows(); }, true);

// Keys on a computer: space plays or pauses, ←/→ seek by 5 seconds
// (with Shift: previous / next track). Not while typing or on a control
// that uses these keys itself.
document.addEventListener("keydown", (e) => {
  if (!currentTrack || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  const typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  if (typing || openOverlays.length) return;
  if (e.code === "Space") {
    if (t && /^(BUTTON|A)$/.test(t.tagName)) return;
    e.preventDefault();
    togglePlayPause();
  } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
    if (t && t.getAttribute && t.getAttribute("role") === "slider") return;
    e.preventDefault();
    if (e.shiftKey) { playAdjacent(e.key === "ArrowRight" ? 1 : -1); return; }
    const dur = effectiveDuration();
    if (!dur) return;
    const to = audio.currentTime + (e.key === "ArrowRight" ? 5 : -5);
    audio.currentTime = Math.max(0, Math.min(dur - 1, to));
  }
});

// Telegram's own back button: closes the top sheet, otherwise steps back
// a screen. System back on Android goes through the same button.
function syncBackButton() {
  if (!hasTgBack) return;
  const needed = openOverlays.length > 0 || (!TAB_SCREENS.has(currentScreen) && currentScreen !== "onboarding" && currentScreen !== "splash");
  try { needed ? tg.BackButton.show() : tg.BackButton.hide(); } catch (e) { /* ignore */ }
}
if (hasTgBack) {
  tg.BackButton.onClick(() => {
    if (openOverlays.length) closeOverlay(openOverlays[openOverlays.length - 1]);
    else goBack();
  });
}

