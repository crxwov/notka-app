// ============================================================
// СОБЫТИЯ: tasks that count themselves, rewards that open themselves
// ============================================================
// The server has the events (see events_store.py) and keeps who has what;
// the app counts the tasks, because it is the one that sees the listening.
var EVENTS_CACHE = "notka_events_cfg";
var eventsCfg = [];
try { eventsCfg = JSON.parse(localStorage.getItem(EVENTS_CACHE)) || []; } catch (e) { eventsCfg = []; }
var currentEventId = null;
function eventById(id) { return eventsCfg.find((e) => e.id === id) || null; }
function activeEvents() { return eventsCfg.filter((e) => e.status === "active"); }
function taskValue(eventId, task) {
  const v = (state.events.progress[eventId] || {})[task.id];
  return Array.isArray(v) ? v.length : +v || 0;
}
function eventPoints(ev) { return ev.tasks.filter((t) => !t.locked && taskValue(ev.id, t) >= t.target).length; }

// something happened that a task may be waiting for
function eventNote(kind, value, quiet) {
  let changed = false;
  activeEvents().forEach((ev) => ev.tasks.forEach((t) => {
    if (t.kind !== kind || t.locked || t.day > (ev.dayNow || 0)) return;
    const p = state.events.progress[ev.id] || (state.events.progress[ev.id] = {});
    if (t.unique) {
      const set = Array.isArray(p[t.id]) ? p[t.id] : (p[t.id] = []);
      if (set.length < t.target && !set.includes(String(value))) { set.push(String(value)); changed = true; }
    } else if (taskValue(ev.id, t) < t.target) {
      p[t.id] = Math.min(t.target, (+p[t.id] || 0) + value);
      changed = true;
    }
  }));
  if (!changed) return;
  reconcileEvents(true);
  if (!quiet) persist();
  scheduleEventSync();
}
// the rewards that need no number open here, at once; the numbered one waits for the server
function reconcileEvents(announce) {
  activeEvents().forEach((ev) => {
    const points = eventPoints(ev);
    ev.tiers.forEach((tier) => {
      if (tier.plusDays || points < tier.points || ownsItem(tier.item)) return;
      state.events.items.push(tier.item);
      if (announce) announceReward(tier);
    });
  });
  renderEventUI();
}
// a reward is won: a moment of its own, one after another
var rewardQueue = [];
function announceReward(tier) {
  haptic("success");
  rewardQueue.push(tier);
  if ($("reward-pop").hidden) setTimeout(showNextReward, 350);
}
function showNextReward() {
  const tier = rewardQueue.shift();
  if (!tier) return;
  const pop = $("reward-pop");
  $("rp-img").src = eventIcon(tier.item);
  $("rp-title").textContent = tier.title;
  $("rp-text").textContent = tier.text;
  const isTheme = tier.item.startsWith("atmo_");
  $("rp-use").hidden = !isTheme;
  $("rp-use").dataset.atmo = isTheme ? tier.item.slice(5) : "";
  pop.hidden = false;
  const sparks = $("rp-sparks");
  const burstAt = (delay) => setTimeout(() => { if (!pop.hidden) PumpkinArt.burst(sparks, innerWidth / 2, innerHeight * 0.38, 26); }, delay);
  burstAt(250); burstAt(650); burstAt(1100);
}
function closeReward() {
  $("reward-pop").hidden = true;
  renderEventUI();
  if (rewardQueue.length) setTimeout(showNextReward, 300);
}
$("rp-ok").addEventListener("click", () => { haptic("light"); closeReward(); });
$("rp-use").addEventListener("click", () => {
  const id = $("rp-use").dataset.atmo;
  closeReward();
  if (id) { setLook("atmo", id); showToast("Тема включена, выключить её можно в «Оформлении»"); }
});
var eventSyncTimer = null;
function scheduleEventSync() {
  clearTimeout(eventSyncTimer);
  eventSyncTimer = setTimeout(syncEvents, 2500);
}
function mergeMine(ev, mine, quiet) {
  if (!mine) return;
  if (mine.plusUntil) rememberPlus(mine.plusUntil);
  const had = new Set(state.events.items);
  (mine.items || []).forEach((item) => {
    if (had.has(item)) return;
    state.events.items.push(item);
    const tier = ev.tiers.find((t) => t.item === item);
    if (tier && !quiet) announceReward(tier);
  });
  // what the server knows from another phone is not lost
  const p = state.events.progress[ev.id] || (state.events.progress[ev.id] = {});
  ev.tasks.forEach((t) => {
    if (t.locked) return;
    const server = Math.min(t.target, +((mine.progress || {})[t.id]) || 0);
    if (t.unique) {
      const set = Array.isArray(p[t.id]) ? p[t.id] : (p[t.id] = []);
      while (set.length < server) set.push("~" + set.length);
    } else if (server > (+p[t.id] || 0)) p[t.id] = server;
  });
  persist();
  renderEventUI();
  applyLook();
}
async function syncEvents() {
  const tok = localStorage.getItem("notka_auth_token");
  for (const ev of activeEvents()) {
    const progress = {};
    ev.tasks.forEach((t) => { if (!t.locked) progress[t.id] = taskValue(ev.id, t); });
    try {
      const headers = { "content-type": "application/json" };
      if (tgInitData) headers["X-Telegram-Init-Data"] = tgInitData;
      if (tok) headers["X-Auth-Token"] = tok;
      const res = await fetch(`${API_BASE_URL}/events/sync`, { method: "POST", headers, body: JSON.stringify({ event: ev.id, progress }) });
      if (res.ok) mergeMine(ev, await res.json(), false);
    } catch (e) { /* the next change tries again */ }
  }
}
async function refreshEvents() {
  try {
    const headers = {};
    if (tgInitData) headers["X-Telegram-Init-Data"] = tgInitData;
    const tok = localStorage.getItem("notka_auth_token");
    if (tok) headers["X-Auth-Token"] = tok;
    const res = await fetch(`${API_BASE_URL}/events`, { headers });
    if (!res.ok) return;
    eventsCfg = (await res.json()).events || [];
    try { localStorage.setItem(EVENTS_CACHE, JSON.stringify(eventsCfg)); } catch (e) { /* the list is fetched again */ }
    // today's visit first, so that a day the server already knows is not counted twice
    eventNote("visit", dayKey(Date.now()));
    eventsCfg.forEach((ev) => mergeMine(ev, ev.mine, true));
    reconcileEvents(true);
    syncEvents();
  } catch (e) { /* the cached list stays */ }
}
window.Atmosphere && (Atmosphere.onCatch = (what) => { if (what === "bat") eventNote("bat", 1); });

// ---- the banner on Home and the page of the event ----
var daysWord = (n) => `${n} ${plural(n, "день", "дня", "дней")}`;
// the face of the pumpkin lights at 2, 3, 5 and 7 finished tasks; the whole of it at the last
var PUMPKIN_STEPS = [2, 3, 5, 7];
var dateOfDay = (ev, day) => new Date(new Date(ev.start + "T12:00:00").getTime() + (day - 1) * 86400000).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
var bannerPumpkinFor = null;
function renderEventUI() {
  const banner = $("home-event");
  const ev = activeEvents()[0];
  banner.hidden = !ev;
  if (ev) {
    const points = eventPoints(ev), total = ev.tasks.length;
    const today = ev.tasks.find((t) => t.day === ev.dayNow && !t.locked);
    const todayDone = today && taskValue(ev.id, today) >= today.target;
    $("event-banner-title").textContent = ev.title;
    $("event-banner-word").textContent = ev.title;
    $("event-banner-kicker").textContent = points >= total ? "Всё горит" : ev.dayNow <= total ? `День ${ev.dayNow} из ${total}` : `Ещё ${daysWord(ev.days)}`;
    $("event-banner-sub").innerHTML = points >= total ? "Все задания выполнены" : todayDone ? `Сегодня готово · <b id="event-banner-count">${points}/${total}</b>` : `Зажги тыкву · <b id="event-banner-count">${points}/${total}</b>`;
    $("event-banner-bars").innerHTML = Array.from({ length: total }, (_, i) => `<i class="${points > i ? "is-on" : ""}"></i>`).join("");
    const holder = $("event-banner-pk");
    if (bannerPumpkinFor !== ev.id) { holder.innerHTML = PumpkinArt.svg(); bannerPumpkinFor = ev.id; }
    PumpkinArt.lightTo(holder, points, { total, steps: PUMPKIN_STEPS });
  }
  if (currentScreen === "event") renderEventScreen();
}

// what to do about each kind of task, and where it leads
var TASK_GO = {
  listen: { label: "Включить музыку", run: () => showScreen("home") },
  night: { label: "Включить музыку", run: () => showScreen("home") },
  mood: { label: "Выбрать настроение", run: () => showScreen("mood") },
  fav: { label: "Найти треки", run: () => showScreen("search") },
  playlist: { label: "Найти треки", run: () => showScreen("search") },
  share: { label: "Выбрать плейлист", run: () => showScreen("library") },
  bat: { label: "Лови мышей здесь", run: () => { haptic("light"); showToast("Нажми на летучую мышь, когда она пролетает"); } },
};
var isOpen = (ev, t) => !t.locked && t.day <= (ev.dayNow || 0);
var isDone = (ev, t) => isOpen(ev, t) && taskValue(ev.id, t) >= t.target;
// today's task first, then the ones that were missed (the oldest first)
function nextTask(ev) {
  const open = ev.tasks.filter((t) => isOpen(ev, t) && !isDone(ev, t));
  return open.find((t) => t.day === ev.dayNow) || open[0] || null;
}
var taskLine = (ev, t) => {
  const v = taskValue(ev.id, t);
  return v >= t.target ? "Готово" : `${Math.floor(v)} из ${t.target}${t.unit ? " " + t.unit : ""}`;
};
var eventLitShown = -1;
var eventScreenFresh = false;
function renderEventScreen() {
  const ev = eventById(currentEventId);
  if (!ev) return;
  const points = eventPoints(ev), total = ev.tasks.length;
  $("event-days").textContent = ev.status === "active" ? (ev.dayNow <= total ? `День ${ev.dayNow} из ${total}` : `Ещё ${daysWord(ev.days)}`) : "Завершено";
  const title = $("event-title");
  title.textContent = ev.title;
  title.style.setProperty("--len", String(ev.title.length));
  $("event-count").textContent = String(points);
  $("event-count-of").innerHTML = `из ${total}<br>заданий выполнено`;

  // the pumpkin: built once, lit up part by part each time the page is opened
  const stage = $("event-stage");
  if (!stage.firstElementChild) {
    stage.innerHTML = PumpkinArt.svg();
    stage.addEventListener("click", (e) => {
      const r = stage.getBoundingClientRect();
      stage.classList.remove("is-boop"); void stage.offsetWidth; stage.classList.add("is-boop");
      PumpkinArt.burst(stage, e.clientX - r.left, e.clientY - r.top, 14);
      haptic("light");
    });
    const look = (e) => {
      const r = stage.getBoundingClientRect();
      const nx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / 220));
      const ny = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / 260));
      stage.style.setProperty("--px", `${(nx * 6).toFixed(1)}px`);
      stage.style.setProperty("--py", `${(ny * 5).toFixed(1)}px`);
    };
    window.addEventListener("touchmove", (e) => { if (currentScreen === "event" && e.touches[0]) look(e.touches[0]); }, { passive: true });
    window.addEventListener("mousemove", (e) => { if (currentScreen === "event") look(e); });
  }
  const light = { total, steps: PUMPKIN_STEPS };
  if (eventScreenFresh || eventLitShown < 0) {
    eventScreenFresh = false;
    PumpkinArt.lightTo(stage, points, Object.assign({ animate: true, delay: 600, onStep: (c) => { haptic("light"); const r = stage.getBoundingClientRect(); PumpkinArt.burst(stage, r.width / 2, r.height * 0.55, 6); } }, light));
  } else if (points !== eventLitShown) {
    PumpkinArt.lightTo(stage, points, light);
  }
  eventLitShown = points;

  // the days, as a calendar of ten small lights: done, today, missed, still closed
  $("event-calendar").innerHTML = ev.tasks.map((t) => {
    const done = isDone(ev, t), open = isOpen(ev, t);
    const cls = done ? "is-done" : !open ? "is-closed" : t.day === ev.dayNow ? "is-today" : "is-missed";
    return `<span class="cal-day ${cls}" title="${open ? "" : `Откроется ${dateOfDay(ev, t.day)}`}">${done ? '<svg width="14" height="14" aria-hidden="true"><use href="#i-check"/></svg>' : t.day}</span>`;
  }).join("");

  // what to do next, in one card
  const next = $("event-next");
  const task = nextTask(ev);
  if (points >= total) {
    next.className = "event-next glass is-done";
    next.innerHTML = `<span class="event-next-k">Готово</span><b class="event-next-t">Тыква горит ярче всех</b><span class="event-next-s">Все задания выполнены. Награды уже у тебя.</span>`;
  } else if (!task) {
    const tomorrow = ev.tasks.find((t) => t.day === (ev.dayNow || 0) + 1);
    next.className = "event-next glass";
    next.innerHTML = `<span class="event-next-k">Сегодня готово</span><b class="event-next-t">Новое задание завтра</b><span class="event-next-s">${tomorrow ? `Откроется ${dateOfDay(ev, tomorrow.day)}` : "Заходи завтра"}</span>`;
  } else {
    const go = TASK_GO[task.kind];
    next.className = "event-next glass";
    next.innerHTML = `<span class="event-next-k">${task.day === ev.dayNow ? `Задание дня ${task.day}` : `Пропущено · день ${task.day}`}</span><b class="event-next-t">${task.title}</b><span class="event-next-s">${taskLine(ev, task)}</span>${go && go.run ? `<br><button class="event-next-btn" type="button" id="event-next-btn">${go.label}<svg width="18" height="18" aria-hidden="true"><use href="#i-chevron"/></svg></button>` : ""}`;
    const btn = $("event-next-btn");
    if (btn) btn.addEventListener("click", () => { haptic("light"); go.run(); });
  }

  $("event-rewards").innerHTML = ev.tiers.map((tier) => {
    const open = ownsItem(tier.item) || (tier.plusDays && points >= tier.points && hasRealPlus());
    const left = tier.points - points;
    const sub = open ? "Получено" : left > 0 ? `Ещё ${left} ${plural(left, "задание", "задания", "заданий")}` : "Скоро";
    return `<li class="event-reward glass ${open ? "is-open" : "is-locked"}" data-item="${tier.item}"><span class="er-medal"><img alt="" src="${eventIcon(tier.item)}"></span><span class="er-text"><b>${tier.title}</b><em>${sub}</em></span><span class="er-pts">${tier.points}</span></li>`;
  }).join("");
  $("event-debug").hidden = !plusPreview();
  // the tasks that have opened, and the days that have not (only their date shows)
  $("event-tasks").innerHTML = ev.tasks.map((t) => {
    if (!isOpen(ev, t)) return `<li class="event-task glass is-closed"><span class="et-n">${t.day}</span><span class="et-body"><b>Задание дня ${t.day}</b><em>Откроется ${dateOfDay(ev, t.day)}</em></span></li>`;
    const v = taskValue(ev.id, t), done = v >= t.target, go = TASK_GO[t.kind];
    const canGo = !done && go && go.run;
    return `<li class="event-task glass${done ? " is-done" : ""}"${canGo ? ` data-go="${t.kind}"` : ""}><span class="et-n">${done ? '<svg width="18" height="18" aria-hidden="true"><use href="#i-check"/></svg>' : t.day}</span><span class="et-body"><b>${t.title}</b><span class="et-bar"><i style="--w:${Math.min(1, v / t.target).toFixed(3)}"></i></span><em>${taskLine(ev, t)}</em></span>${canGo ? '<span class="et-go"><svg width="18" height="18" aria-hidden="true"><use href="#i-chevron"/></svg></span>' : ""}</li>`;
  }).join("");
}
$("event-tasks").addEventListener("click", (e) => {
  const li = e.target.closest(".event-task[data-go]");
  if (li && TASK_GO[li.dataset.go].run) { haptic("light"); TASK_GO[li.dataset.go].run(); }
});
// ---- checking an event without doing its tasks (preview mode) ----
function completeTask(ev, t) {
  const p = state.events.progress[ev.id] || (state.events.progress[ev.id] = {});
  if (t.unique) p[t.id] = Array.from({ length: t.target }, (_, i) => (p[t.id] && p[t.id][i]) || `test${i}`);
  else p[t.id] = t.target;
}
function finishChecking(ev) {
  reconcileEvents(true);
  persist();
  syncEvents();
  renderEventScreen();
}
$("evd-day").addEventListener("click", async () => {
  haptic("light");
  try { await fetch(`${API_BASE_URL}/events/advance`, { method: "POST" }); } catch (e) { /* nothing then */ }
  await refreshEvents();
  showToast("Открыт следующий день");
});
$("evd-next").addEventListener("click", () => {
  const ev = eventById(currentEventId);
  const t = ev && nextTask(ev);
  if (!t) { showToast("Все задания уже выполнены"); return; }
  haptic("light");
  completeTask(ev, t);
  finishChecking(ev);
});
$("evd-all").addEventListener("click", () => {
  const ev = eventById(currentEventId);
  if (!ev) return;
  haptic("light");
  ev.tasks.forEach((t) => { if (isOpen(ev, t)) completeTask(ev, t); });
  finishChecking(ev);
});
$("evd-reset").addEventListener("click", async () => {
  const ev = eventById(currentEventId);
  if (!ev) return;
  haptic("light");
  try { await fetch(`${API_BASE_URL}/events/reset`, { method: "POST", headers: { "content-type": "application/json", "X-Telegram-Init-Data": tgInitData }, body: JSON.stringify({ event: ev.id }) }); } catch (e) { /* only the phone is reset then */ }
  delete state.events.progress[ev.id];
  const mine = new Set(ev.tiers.map((t) => t.item));
  state.events.items = state.events.items.filter((it) => !mine.has(it));
  ev.dayNow = 0;
  persist();
  eventLitShown = -1;
  eventScreenFresh = true;
  eventNote("visit", dayKey(Date.now()));
  renderEventUI();
  applyLook();
  refreshEvents();
  showToast("Событие сброшено");
});
function openEvent(id) {
  currentEventId = id;
  haptic("light");
  eventScreenFresh = true;
  showScreen("event");
  refreshEvents();
}
$("home-event").addEventListener("click", () => { const ev = activeEvents()[0]; if (ev) openEvent(ev.id); });
$("event-back-btn").addEventListener("click", goBack);
// a reward is tapped: shown again if it is won, or what is still needed
$("event-rewards").addEventListener("click", (e) => {
  const li = e.target.closest(".event-reward");
  const ev = eventById(currentEventId);
  if (!li || !ev) return;
  const tier = ev.tiers.find((t) => t.item === li.dataset.item);
  haptic("light");
  if (ownsItem(tier.item)) { rewardQueue.push(tier); showNextReward(); return; }
  const left = tier.points - eventPoints(ev);
  showToast(left > 0 ? `${tier.title}: ещё ${left} ${plural(left, "задание", "задания", "заданий")}` : "Тираж уже разобран");
});
renderEventUI();
refreshEvents();

// ---- promo code: typed in by hand, or brought by a link from an ad ----
var promoInput = $("promo-input");
var PROMO_PROBLEMS = {
  NOT_FOUND: "Такого промокода нет. Проверь, нет ли опечатки.",
  BAD_CODE: "Такого промокода нет. Проверь, нет ли опечатки.",
  EXPIRED: "Этот промокод уже не действует.",
  EXHAUSTED: "Этот промокод уже разобрали — активации закончились.",
  ALREADY_USED: "Этот промокод уже был активирован на твоём аккаунте.",
  TOO_MANY_TRIES: "Слишком много попыток. Попробуй через час.",
  NOT_IN_TELEGRAM: "Промокод можно активировать только из Telegram.",
};
function promoError(text) {
  $("promo-error").textContent = text || "";
  $("promo-error").hidden = !text;
}
function openPromo(code) {
  promoInput.value = code || "";
  promoError("");
  $("promo-confirm").classList.remove("is-busy");
  $("promo-step-enter").hidden = false;
  $("promo-step-done").hidden = true;
  openOverlay("promo-modal");
  if (code) redeemPromo();
  else setTimeout(() => promoInput.focus(), 60);
}
async function redeemPromo() {
  const code = promoInput.value.trim();
  if (!code) { promoInput.focus(); return; }
  if ($("promo-confirm").classList.contains("is-busy")) return;
  promoError("");
  $("promo-confirm").classList.add("is-busy");
  let data = null, problem = null;
  try {
    const headers = { "content-type": "application/json" };
    if (tgInitData) headers["X-Telegram-Init-Data"] = tgInitData;
    const tok = localStorage.getItem("notka_auth_token");
    if (tok) headers["X-Auth-Token"] = tok;
    const res = await fetch(`${API_BASE_URL}/plus/redeem`, {
      method: "POST",
      headers,
      body: JSON.stringify({ code }),
    });
    const body = await res.json();
    if (res.ok) data = body;
    else problem = PROMO_PROBLEMS[body && body.error && body.error.code] || "Не получилось активировать промокод. Попробуй ещё раз.";
  } catch (e) {
    problem = "Нет связи с Ноткой. Попробуй ещё раз.";
  }
  $("promo-confirm").classList.remove("is-busy");
  if (!data) { promoError(problem); haptic("error"); return; }
  rememberPlus(data.until);
  keepTriedLook();
  haptic("success");
  $("promo-done-until").textContent = `${data.days} ${plural(data.days, "день", "дня", "дней")} Плюса — до ${longDate(data.until)}`;
  // a limited run is felt when the number is seen
  $("promo-done-left").textContent = data.limit > 1 ? `Ты в числе первых ${data.limit}. Осталось активаций: ${data.left}` : "";
  $("promo-step-enter").hidden = true;
  $("promo-step-done").hidden = false;
}
$("plus-promo-btn").addEventListener("click", () => openPromo(""));
$("promo-cancel").addEventListener("click", () => closeOverlay("promo-modal"));
$("promo-done-btn").addEventListener("click", () => closeOverlay("promo-modal"));
$("promo-confirm").addEventListener("click", redeemPromo);
promoInput.addEventListener("keydown", (e) => { if (e.key === "Enter") redeemPromo(); });
promoInput.addEventListener("input", () => promoError(""));

