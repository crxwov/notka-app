// ============================================================
// PROFILE
// ============================================================
function displayName() {
  if (Store.getAccountName()) return Store.getAccountName();
  if (tgUser) return [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") || tgUser.username || "Гость";
  return "Гость";
}
function renderAvatarInto(elId, initialId) {
  const el = $(elId);
  if (!el) return;
  const name = displayName();
  const photo = Store.getAccountAvatar() || (tgUser && tgUser.photo_url) || null;
  el.innerHTML = "";
  if (photo) {
    const img = document.createElement("img");
    img.src = proxyArtwork(photo);
    img.alt = "";
    el.appendChild(img);
  } else {
    const span = document.createElement("span");
    span.id = initialId;
    span.textContent = name.trim().charAt(0).toUpperCase() || "Н";
    el.appendChild(span);
  }
}
async function changeAccountAvatar() {
  const dataUrl = await pickAvatarImage();
  if (!dataUrl) return;
  Store.setAccountAvatar(dataUrl);
  renderProfile();
  renderAccountScreen();
}
$("account-avatar-edit-btn").addEventListener("click", changeAccountAvatar);

function renderProfile() {
  $("profile-name").textContent = displayName();
  $("profile-sub").textContent = tgUser && tgUser.username ? `@${tgUser.username}` : (tgUser ? "Telegram" : "Открой Нотку из Telegram, чтобы войти");
  renderAvatarInto("profile-avatar-btn", "profile-initial");

  // цифры слушателя прямо на профиле; тап открывает статистику
  const S = statsFor("all");
  const heard = S.tracks.length > 0 && S.seconds >= 1;
  const minutes = Math.max(1, Math.round(S.seconds / 60));
  $("profile-stats").classList.toggle("is-empty", !heard);
  if (heard) {
    countUp($("pf-minutes"), minutes);
    countUp($("pf-tracks"), S.tracks.length);
    countUp($("pf-artists"), S.artists.length);
    $("pf-minutes-l").textContent = plural(minutes, "минута", "минуты", "минут");
    $("pf-tracks-l").textContent = plural(S.tracks.length, "трек", "трека", "треков");
    $("pf-artists-l").textContent = plural(S.artists.length, "исполнитель", "исполнителя", "исполнителей");
  }

  // под каждым пунктом то, что в нём сейчас выбрано
  const crossfade = Store.getSetting("crossfade") || 0;
  const atmo = lookValue("atmo");
  const theme = PLAYER_THEMES[lookValue("playerTheme")];
  $("pf-sub-account").textContent = `${displayName()}${tgUser && tgUser.username ? ` · @${tgUser.username}` : ""}`;
  $("pf-sub-stats").textContent = heard ? `${minutes.toLocaleString("ru-RU")} ${plural(minutes, "минута", "минуты", "минут")} за всё время` : "Пока тихо";
  $("pf-sub-look").textContent = `${atmo === "none" ? "Без атмосферы" : (ATMOS[atmo] && ATMOS[atmo].name) || "Атмосфера"} · плеер «${theme ? theme.name : "Стандарт"}»`;
  $("pf-sub-sound").textContent = crossfade ? `Плавный переход ${crossfade} с` : "Плавный переход выключен";
  $("pf-sub-about").textContent = ($("about-version").textContent || "").trim() || "Версия 1.1";
  $("pf-version").textContent = `Нотка · ${($("about-version").textContent || "Версия 1.1").trim().toLowerCase()}`;
}
function openSupport() {
  const url = "https://t.me/notka_support";
  if (tg && tg.openTelegramLink) tg.openTelegramLink(url);
  else window.open(url, "_blank");
}
$("profile-stats").addEventListener("click", () => showScreen("stats"));
$("pf-invite").addEventListener("click", () => shareInvite());
$("pf-support").addEventListener("click", openSupport);
$("profile-back-btn").addEventListener("click", goBack);
$("menu-stats").addEventListener("click", () => showScreen("stats"));
$("menu-account").addEventListener("click", () => showScreen("account"));
$("menu-sound").addEventListener("click", () => showScreen("sound"));
$("menu-about").addEventListener("click", () => showScreen("about"));
$("about-support-btn").addEventListener("click", openSupport);

// ============================================================
// ACCOUNT (name/avatar from Telegram, local listening stats)
// ============================================================
function renderAccountScreen() {
  $("account-name").textContent = displayName();
  renderAvatarInto("account-avatar", "account-initial");
  const platforms = { ios: "iPhone", android: "Android", android_x: "Android", tdesktop: "Telegram Desktop", macos: "Mac", weba: "Telegram Web", webk: "Telegram Web" };
  const where = (tg && platforms[tg.platform]) || "";
  const hhmm = (t) => new Date(t).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  let syncValue = "Включена", syncNote = "Любимое и плейлисты общие на всех устройствах";
  if (!syncOn()) {
    syncValue = "Выключена";
    syncNote = "Нотка открыта не из Telegram. Открой её через бота @notka_app_bot, и всё объединится";
  } else if (syncStatus.code === "auth") {
    syncValue = "Не работает";
    syncNote = "Сессия устарела. Закрой Нотку и открой её заново из Telegram. Нажми, чтобы попробовать ещё раз";
  } else if (syncStatus.code === "big") {
    syncValue = "Не работает";
    syncNote = "Слишком много данных в аккаунте. Удали ненужные плейлисты, или напиши в поддержку";
  } else if (syncStatus.code === "net") {
    syncValue = "Нет связи";
    syncNote = "Попробуем ещё раз сами. Нажми, чтобы проверить сейчас";
  } else if (syncStatus.code === "ok") {
    syncNote = `Последний раз в ${hhmm(syncStatus.at)}${where ? " · это " + where : ""}. Нажми, чтобы обновить сейчас`;
  } else {
    syncNote = "Проверяем…";
  }
  $("account-analytics-val").textContent = state.settings.analyticsOff ? "Выключено" : "Включено";
  $("account-sessions-count").textContent = syncValue;
  $("account-sync-sub").textContent = syncNote;
  const tgName = tgUser ? [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") : "";
  const customName = !!Store.getAccountName(), customPhoto = !!Store.getAccountAvatar();
  $("account-sub").textContent = tgUser && tgUser.username ? `@${tgUser.username}` : "";
  $("acc-name-val").textContent = displayName();
  $("acc-photo-val").textContent = customPhoto ? "Своё" : (tgUser && tgUser.photo_url ? "Из Telegram" : "Не выбрано");
  $("acc-tg-val").textContent = tgUser ? (tgUser.username ? `@${tgUser.username}` : (tgName || "Подключён")) : "Не подключён";
  $("account-restore-tg").hidden = !(tgUser && (customName || customPhoto));
  $("acc-favs").textContent = String(state.favorites.length);
  $("acc-lists").textContent = String(state.playlists.length);
  $("acc-follows").textContent = String(state.followedArtists.length);
  const logoutBtn = $("account-logout");
  if (logoutBtn) logoutBtn.hidden = !localStorage.getItem("notka_auth_token");
}
$("account-analytics-row").addEventListener("click", () => {
  Store.setSetting("analyticsOff", !state.settings.analyticsOff);
  if (state.settings.analyticsOff) eventQueue.length = 0;
  haptic("light");
  showToast(state.settings.analyticsOff ? "Выключено" : "Включено, спасибо");
  renderAccountScreen();
});
$("account-sessions-row").addEventListener("click", () => {
  if (!syncOn()) { showToast("Открой Нотку из Telegram, чтобы включить синхронизацию"); return; }
  syncDeadAt = 0;
  haptic("light");
  setSyncStatus("idle");
  syncNow();
});
$("account-row-name").addEventListener("click", () => $("account-name-row").click());
$("account-row-photo").addEventListener("click", () => changeAccountAvatar());
$("account-restore-tg").addEventListener("click", () => {
  Store.setAccountName(null);
  Store.setAccountAvatar(null);
  renderAccountScreen();
  renderProfile();
  haptic("success");
  showToast("Имя и фото из Telegram");
});
var accLogoutBtn = $("account-logout");
if (accLogoutBtn) {
  accLogoutBtn.addEventListener("click", () => {
    localStorage.removeItem("notka_auth_token");
    localStorage.removeItem("notka_auth_user");
    location.reload();
  });
}

// копия данных одним текстом: на устройстве хранится всё, и так оно переезжает на новый телефон
var BACKUP_PREFIX = "NOTKA1:";
function buildBackup() {
  const keepCover = (p) => (p.cover && p.cover.length > 30000 ? Object.assign({}, p, { cover: null }) : p);
  const data = {
    v: 1, at: Date.now(),
    accountName: state.accountName, favorites: state.favorites, playlists: state.playlists.map(keepCover),
    followedArtists: state.followedArtists, followedMeta: state.followedMeta, playlistFlags: state.playlistFlags,
    settings: state.settings, listens: listensView(), events: state.events,
  };
  return BACKUP_PREFIX + btoa(unescape(encodeURIComponent(JSON.stringify(data))));
}
function readBackup(text) {
  const raw = String(text || "").replace(/\s+/g, "");
  if (!raw.startsWith(BACKUP_PREFIX)) throw new Error("not a backup");
  const data = JSON.parse(decodeURIComponent(escape(atob(raw.slice(BACKUP_PREFIX.length)))));
  if (!data || data.v !== 1 || !Array.isArray(data.favorites) || !Array.isArray(data.playlists)) throw new Error("bad backup");
  return data;
}
async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch (e) { /* the fallback below */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch (e) { return false; }
}
$("account-backup").addEventListener("click", async () => {
  const text = buildBackup();
  if (await copyText(text)) { haptic("success"); showToast("Копия скопирована. Сохрани её, например, в «Избранное»"); return; }
  // буфер недоступен: показываем текст, его можно скопировать руками
  $("restore-title").textContent = "Копия данных";
  $("restore-text").textContent = "Не получилось скопировать само. Выдели весь текст и скопируй его.";
  $("restore-input").value = text;
  $("restore-confirm").hidden = true;
  openOverlay("restore-modal");
  setTimeout(() => { $("restore-input").focus(); $("restore-input").select(); }, 80);
});
$("account-restore").addEventListener("click", () => {
  $("restore-title").textContent = "Восстановить из копии";
  $("restore-text").textContent = "Вставь текст копии. Любимое, плейлисты, подписки и статистика на этом устройстве будут заменены.";
  $("restore-input").value = "";
  $("restore-confirm").hidden = false;
  openOverlay("restore-modal");
  setTimeout(() => $("restore-input").focus(), 80);
});
$("restore-cancel").addEventListener("click", () => closeOverlay("restore-modal"));
$("restore-confirm").addEventListener("click", () => {
  let data;
  try { data = readBackup($("restore-input").value); } catch (e) { haptic("error"); showToast("Это не похоже на копию Нотки"); return; }
  state.accountName = data.accountName || null;
  state.favorites = data.favorites;
  state.playlists = data.playlists;
  state.followedArtists = data.followedArtists || [];
  state.followedMeta = data.followedMeta || {};
  state.playlistFlags = data.playlistFlags || {};
  state.settings = Object.assign(state.settings, data.settings || {});
  state.listens = data.listens || { seconds: 0, plays: 0, tracks: {}, artists: {} };
  // the restored file holds the whole sum: this device carries it, the others' counters start over
  state.remoteListens = null;
  state.listensResetPending = true;
  listensRev++;
  if (data.events) state.events = data.events;
  persist();
  closeOverlay("restore-modal");
  haptic("success");
  showToast("Данные восстановлены");
  setTimeout(() => location.reload(), 700);
});
$("account-reset-stats").addEventListener("click", () => openOverlay("reset-stats-modal"));
$("reset-stats-cancel").addEventListener("click", () => closeOverlay("reset-stats-modal"));
$("reset-stats-confirm").addEventListener("click", () => {
  state.listens = { seconds: 0, plays: 0, tracks: {}, artists: {}, days: {} };
  state.remoteListens = null; // and the other devices' counters too: it is one account
  state.listensResetPending = true;
  listensRev++;
  persist();
  closeOverlay("reset-stats-modal");
  haptic("success");
  showToast("Статистика сброшена");
});
function setSwitch(id, on) {
  const el = $(id);
  if (el) el.setAttribute("aria-checked", on ? "true" : "false");
}
// in Telegram the data is kept under the account, so the screens say so
if (syncOn()) {
  const swap = (el) => {
    if (/хранятся на этом устройстве/.test(el.textContent)) {
      el.textContent = el.textContent
        .replace("Любимое и плейлисты хранятся на этом устройстве", "Любимое, плейлисты и статистика хранятся в аккаунте и совпадают на всех устройствах")
        .replace("Любимое, плейлисты и статистика хранятся на этом устройстве", "Любимое, плейлисты и статистика хранятся в твоём аккаунте Telegram и совпадают на всех устройствах");
    }
  };
  document.querySelectorAll("p, span, div, li").forEach((el) => { if (!el.children.length) swap(el); });
  document.querySelectorAll(".fineprint").forEach((el) => { if (/на этом устройстве/.test(el.textContent)) el.textContent = "Считается по всем твоим устройствам"; });
}
$("account-back-btn").addEventListener("click", goBack);
$("account-invite-btn").addEventListener("click", shareInvite);
$("account-name-row").addEventListener("click", () => {
  $("account-name-input").value = displayName();
  openOverlay("account-name-modal");
  setTimeout(() => $("account-name-input").focus(), 60);
});
$("account-name-cancel").addEventListener("click", () => closeOverlay("account-name-modal"));
$("account-name-save").addEventListener("click", () => {
  const val = $("account-name-input").value.trim();
  if (!val) return;
  Store.setAccountName(val);
  closeOverlay("account-name-modal");
  renderAccountScreen();
  renderProfile();
  showToast("Имя изменено");
});

