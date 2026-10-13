// ============================================================
// Track rows — one strict grid everywhere:
// cover · title/artist · time · one action
// ============================================================
function buildTrackRow(track, opts) {
  opts = opts || {};
  const li = document.createElement("li");
  li.className = "track-row";
  li.dataset.trackId = track.id;

  const main = document.createElement("button");
  main.type = "button";
  main.className = "row-main";

  if (opts.index != null) {
    const idx = document.createElement("span");
    idx.className = "row-index";
    idx.textContent = String(opts.index);
    main.appendChild(idx);
  }

  const art = document.createElement("span");
  art.className = "cover cover-sm";
  setCoverEl(art, track.artwork, track.id);
  const eq = document.createElement("span");
  eq.className = "eq";
  eq.setAttribute("aria-hidden", "true");
  eq.innerHTML = "<i></i><i></i><i></i>";
  const spin = document.createElement("span");
  spin.className = "row-spinner";
  spin.setAttribute("aria-hidden", "true");
  art.appendChild(eq);
  art.appendChild(spin);

  const meta = document.createElement("span");
  meta.className = "row-meta";
  const title = document.createElement("span");
  title.className = "row-title";
  title.textContent = track.title || "Без названия";
  const artist = document.createElement("span");
  artist.className = "row-sub";
  artist.textContent = track.artist || "Неизвестный исполнитель";
  meta.appendChild(title);
  meta.appendChild(artist);

  const dur = document.createElement("span");
  dur.className = "row-time";
  dur.textContent = opts.hideDuration ? "" : formatDuration(track.duration);

  main.appendChild(art);
  main.appendChild(meta);
  main.appendChild(dur);
  li.appendChild(main);

  const action = opts.action || "more";
  if (action !== "none") {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "icon-btn row-action" + (action === "more" ? " row-more" : "");
    if (action === "more") {
      btn.setAttribute("aria-label", `Действия: ${track.title || "трек"}`);
      btn.innerHTML = icon("i-more", 24);
      btn.addEventListener("click", (e) => { e.stopPropagation(); openTrackMenu(track); });
    } else if (action === "add") {
      const added = !!opts.added;
      btn.classList.toggle("is-added", added);
      btn.setAttribute("aria-label", added ? "Уже в плейлисте" : "Добавить в плейлист");
      btn.innerHTML = icon(added ? "i-check" : "i-plus", 22);
      btn.addEventListener("click", (e) => { e.stopPropagation(); if (opts.onAction) opts.onAction(btn); });
    } else if (action === "remove") {
      btn.setAttribute("aria-label", `Убрать «${track.title || "трек"}» из плейлиста`);
      btn.innerHTML = icon("i-close", 22);
      btn.addEventListener("click", (e) => { e.stopPropagation(); if (opts.onAction) opts.onAction(btn); });
    }
    li.appendChild(btn);
  }

  // tap plays (or runs the row's own action); long-press opens the menu
  let lpTimer = null;
  let lpFired = false;
  let startX = 0, startY = 0;
  const cancelLp = () => clearTimeout(lpTimer);
  main.addEventListener("pointerdown", (e) => {
    lpFired = false;
    startX = e.clientX; startY = e.clientY;
    if (action !== "more" || e.pointerType === "mouse") return;
    lpTimer = setTimeout(() => { lpFired = true; haptic("medium"); openTrackMenu(track); }, 480);
  });
  main.addEventListener("pointermove", (e) => {
    if (Math.abs(e.clientX - startX) > 8 || Math.abs(e.clientY - startY) > 8) cancelLp();
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach((ev) => main.addEventListener(ev, cancelLp));
  main.addEventListener("contextmenu", (e) => { e.preventDefault(); if (action === "more") openTrackMenu(track); });
  main.addEventListener("click", (e) => {
    if (lpFired) { e.preventDefault(); lpFired = false; return; }
    if (opts.onMain) { opts.onMain(btnOf(li)); return; }
    playTrack(track, opts.queue || [track], { context: opts.context });
  });

  applyRowState(li);
  return li;
}
function btnOf(li) { return li.querySelector(".row-action"); }

function applyRowState(li) {
  const isCurrent = !!currentTrackId && li.dataset.trackId === currentTrackId;
  li.classList.toggle("playing", isCurrent);
  li.classList.toggle("loading", isCurrent && isLoading);
}
function refreshRowStates() {
  document.querySelectorAll(".track-row[data-track-id]").forEach(applyRowState);
}

function refreshCurrentScreen() {
  const name = currentScreen;
  if (name === "home") renderHome();
  if (name === "library") renderLibrary();
  if (name === "favorites") renderFavoritesScreen();
  if (name === "search" && lastSearchResults) renderFilteredResults();
  if (name === "playlist" && currentPlaylistId) openPlaylist(currentPlaylistId, true);
}

