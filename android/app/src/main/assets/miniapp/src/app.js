// ============================================================
// ONBOARDING (first run only) → HOME
// ============================================================
function finishOnboarding() {
  Store.markOnboardingSeen();
  haptic("light");
  showScreen("home", { replace: true });
}
$("onb-start-btn").addEventListener("click", finishOnboarding);

// ---- glass answers touch with a specular bloom at the finger ----
document.addEventListener("pointerdown", (e) => {
  const g = e.target.closest && e.target.closest(".glass, .round-glass");
  if (!g) return;
  const r = g.getBoundingClientRect();
  g.style.setProperty("--gx", `${((e.clientX - r.left) / r.width) * 100}%`);
  g.style.setProperty("--gy", `${((e.clientY - r.top) / r.height) * 100}%`);
  g.classList.add("is-touched");
  const release = () => {
    g.classList.remove("is-touched");
    window.removeEventListener("pointerup", release);
    window.removeEventListener("pointercancel", release);
  };
  window.addEventListener("pointerup", release);
  window.addEventListener("pointercancel", release);
}, { passive: true });

// Splash: the light gathers and the mark appears while fonts load;
// never shorter than the entrance animation, never longer than 2.6s.
// links from the bot: ?t=<src>_<id> (a track) or ?p=<id> (a playlist);
// also Telegram's own start_param (t_… / p_…) when opened via a direct link
function deepLinkTarget() {
  const q = new URLSearchParams(location.search);
  const start = (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) || "";
  return {
    t: q.get("t") || (start.startsWith("t_") ? start.slice(2) : ""),
    p: q.get("p") || (start.startsWith("p_") ? start.slice(2) : ""),
    promo: q.get("promo") || (start.startsWith("promo_") ? start.slice(6) : ""),
  };
}
async function openDeepLink() {
  const { t, p, promo } = deepLinkTarget();
  if (promo) {
    // a link from an ad: the Плюс page opens and the code activates itself
    showScreen("plus");
    openPromo(promo);
    return;
  }
  if (t) {
    const m = t.match(/^([a-z]{2})_(.+)$/);
    const source = m && CODE_SOURCES[m[1]];
    if (!source) return;
    try {
      const res = await fetch(`${API_BASE_URL}/resolve?source=${encodeURIComponent(source)}&id=${encodeURIComponent(m[2])}`);
      if (!res.ok) throw new Error("resolve");
      const data = await res.json();
      const tr = data.track;
      if (!tr) throw new Error("no track");
      playTrack(tr, [tr], { context: "Поделились с тобой" });
      showScreen("player");
    } catch (e) { showToast("Не получилось открыть трек по ссылке"); }
  } else if (p) {
    if (state.sharedImports[p] && state.playlists.some((pl) => pl.id === state.sharedImports[p])) { openPlaylist(state.sharedImports[p]); return; }
    try {
      const res = await fetch(`${API_BASE_URL}/shared/${encodeURIComponent(p)}`);
      if (!res.ok) throw new Error("shared");
      const data = await res.json();
      const pl = Store.createPlaylist(data.name || "Плейлист");
      (data.tracks || []).forEach((tr) => Store.addTrackToPlaylist(pl.id, tr));
      state.sharedImports[p] = pl.id;
      persist();
      renderLibrary();
      openPlaylist(pl.id);
      showToast(`Плейлист «${pl.name}» добавлен в «Моё»`);
    } catch (e) { showToast("Не получилось открыть плейлист по ссылке"); }
  }
}

function initAuthScreen() {
  const userStep = $("auth-step-user");
  const codeStep = $("auth-step-code");
  const userInput = $("auth-username-input");
  const codeInput = $("auth-code-input");
  const userErr = $("auth-user-error");
  const codeErr = $("auth-code-error");
  const reqBtn = $("auth-request-code-btn");
  const verifyBtn = $("auth-verify-code-btn");
  const changeBtn = $("auth-change-user-btn");
  const targetUserLabel = $("auth-code-target-user");

  let currentReqUser = "";

  function showUserError(msg) {
    if (userErr) {
      userErr.textContent = msg;
      userErr.hidden = false;
    }
  }
  function hideUserError() {
    if (userErr) userErr.hidden = true;
  }
  function showCodeError(msg) {
    if (codeErr) {
      codeErr.textContent = msg;
      codeErr.hidden = false;
    }
  }
  function hideCodeError() {
    if (codeErr) codeErr.hidden = true;
  }

  if (userInput) {
    userInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (reqBtn) reqBtn.click();
      }
    });
    userInput.addEventListener("input", hideUserError);
  }

  if (codeInput) {
    codeInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (verifyBtn) verifyBtn.click();
      }
    });
    codeInput.addEventListener("input", (e) => {
      hideCodeError();
      const val = codeInput.value.replace(/\D/g, "");
      codeInput.value = val;
      if (val.length === 6 && verifyBtn) {
        verifyBtn.click();
      }
    });
  }

  if (reqBtn) {
    reqBtn.addEventListener("click", async () => {
      const u = (userInput ? userInput.value : "").trim().replace(/^@/, "");
      if (!u) {
        showUserError("Введи юзернейм в Telegram");
        haptic("notification", "warning");
        return;
      }
      hideUserError();
      reqBtn.disabled = true;
      const origText = reqBtn.textContent;
      reqBtn.textContent = "Отправка кода...";
      try {
        const res = await fetch(`${API_BASE_URL}/auth/request-code`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ username: u }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          showUserError(data.message || "Пользователь не найден");
          haptic("notification", "error");
          return;
        }
        currentReqUser = u;
        haptic("notification", "success");
        if (targetUserLabel) targetUserLabel.textContent = `@${data.username || u}`;
        if (userStep) userStep.hidden = true;
        if (codeStep) codeStep.hidden = false;
        if (codeInput) {
          codeInput.value = "";
          setTimeout(() => codeInput.focus(), 100);
        }
      } catch (err) {
        showUserError("Ошибка подключения к серверу");
        haptic("notification", "error");
      } finally {
        reqBtn.disabled = false;
        reqBtn.textContent = origText;
      }
    });
  }

  if (verifyBtn) {
    verifyBtn.addEventListener("click", async () => {
      const c = (codeInput ? codeInput.value : "").trim();
      if (!c || c.length < 6) {
        showCodeError("Введи 6-значный код подтверждения");
        haptic("notification", "warning");
        return;
      }
      hideCodeError();
      verifyBtn.disabled = true;
      const origText = verifyBtn.textContent;
      verifyBtn.textContent = "Проверка...";
      try {
        const res = await fetch(`${API_BASE_URL}/auth/verify-code`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ username: currentReqUser, code: c }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          showCodeError(data.message || "Неверный код");
          haptic("notification", "error");
          return;
        }
        haptic("notification", "success");
        localStorage.setItem("notka_auth_token", data.token);
        if (data.user) {
          localStorage.setItem("notka_auth_user", JSON.stringify(data.user));
          tgUser = data.user;
          if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe) {
            window.Telegram.WebApp.initDataUnsafe.user = data.user;
          }
        }
        if (data.sync) {
          unionIntoLocal(data.sync);
          persist();
        }
        Store.markOnboardingSeen();
        showToast(`Добро пожаловать, ${data.user ? (data.user.name || data.user.username) : "!"}`);
        showScreen("home", { replace: true });
        renderProfile();
        if (syncOn()) scheduleSync(1000);
      } catch (err) {
        showCodeError("Ошибка подтверждения кода");
        haptic("notification", "error");
      } finally {
        verifyBtn.disabled = false;
        verifyBtn.textContent = origText;
      }
    });
  }

  const haveCodeBtn = $("auth-have-code-btn");
  const openBotBtn = $("auth-open-bot-btn");
  const codeOpenBotBtn = $("auth-code-open-bot-btn");

  function openTelegramBot(startParam) {
    const param = startParam || "login";
    const tgUrl = `https://t.me/notka_app_bot?start=${param}`;
    if (window.Android && window.Android.openExternal) {
      window.Android.openExternal(tgUrl);
    } else {
      window.open(tgUrl, "_blank");
    }
  }

  if (openBotBtn) {
    openBotBtn.addEventListener("click", () => {
      haptic("impact", "light");
      openTelegramBot("login");
    });
  }

  if (codeOpenBotBtn) {
    codeOpenBotBtn.addEventListener("click", () => {
      haptic("impact", "light");
      openTelegramBot("code");
    });
  }

  if (haveCodeBtn) {
    haveCodeBtn.addEventListener("click", () => {
      haptic("impact", "light");
      hideUserError();
      hideCodeError();
      currentReqUser = (userInput ? userInput.value : "").trim().replace(/^@/, "");
      if (targetUserLabel) targetUserLabel.textContent = currentReqUser ? `@${currentReqUser}` : "из бота @notka_app_bot";
      if (userStep) userStep.hidden = true;
      if (codeStep) codeStep.hidden = false;
      if (codeInput) {
        codeInput.value = "";
        setTimeout(() => codeInput.focus(), 100);
      }
    });
  }

  if (changeBtn) {
    changeBtn.addEventListener("click", () => {
      hideCodeError();
      if (codeStep) codeStep.hidden = true;
      if (userStep) userStep.hidden = false;
      if (userInput) userInput.focus();
    });
  }
}

function boot() {
  showScreen("splash", { replace: true });
  const link = deepLinkTarget();
  const viaLink = !!(link.t || link.p);
  const minDelay = new Promise((r) => setTimeout(r, viaLink ? 500 : 1700));
  const fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  const cap = new Promise((r) => setTimeout(r, 2800));
  Promise.race([Promise.all([minDelay, fonts]), cap]).then(() => {
    const splash = screens.splash;
    splash.classList.add("is-leaving");
    setTimeout(() => {
      splash.classList.remove("is-leaving");
      initAuthScreen();
      const authToken = localStorage.getItem("notka_auth_token");
      if (!tgInitRaw && !authToken) {
        showScreen("auth", { replace: true });
      } else {
        Store.markOnboardingSeen();
        showScreen("home", { replace: true });
        openDeepLink();
        if (syncOn()) scheduleSync(1000);
      }
    }, 450);
  });
}
boot();

