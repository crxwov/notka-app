// Notka Desktop WebView2 Bridge with Telegram Auth & Sync
(function () {
  'use strict';

  if (window.__notkaBridgeInitialized) return;
  window.__notkaBridgeInitialized = true;

  const API_BASE = 'https://notka.duckdns.org';
  const NOTKA_LOGO_B64 = 'data:image/png;base64,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';

  const postToHost = (data) => {
    try {
      if (window.chrome && window.chrome.webview && typeof window.chrome.webview.postMessage === 'function') {
        window.chrome.webview.postMessage(data);
      }
    } catch (e) {
      console.warn('[NotkaDesktop] postMessage failed:', e);
    }
  };

  // Expose global desktop interface
  window.NotkaDesktop = {
    isDesktop: true,
    platform: 'windows-webview2',
    version: '1.0.0',
    postMessage: postToHost,
    openExternal: (url) => postToHost({ type: 'open_external', url }),
    showLogin: () => showLoginModal(),
    showAccount: () => {
      const a = getStoredAuth();
      if (a && a.user) showAccountModal(a.user);
      else showLoginModal();
    },
    logout: () => handleLogout()
  };

  // ============================================================
  // AUTHENTICATION & TELEGRAM USER SHIM
  // ============================================================
  function getStoredAuth() {
    if (window.__NOTKA_SAVED_AUTH__ && window.__NOTKA_SAVED_AUTH__.token && window.__NOTKA_SAVED_AUTH__.user) {
      return window.__NOTKA_SAVED_AUTH__;
    }
    try {
      const token = localStorage.getItem('notka_auth_token');
      const userRaw = localStorage.getItem('notka_auth_user');
      if (token && userRaw) {
        return { token, user: JSON.parse(userRaw) };
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  function saveAuth(token, user) {
    try {
      localStorage.setItem('notka_auth_token', token);
      localStorage.setItem('notka_auth_user', JSON.stringify(user));
      window.__NOTKA_SAVED_AUTH__ = { token, user };
    } catch (e) { /* ignore */ }
    postToHost({ type: 'auth_save', token, user });
  }

  function clearAuth() {
    try {
      localStorage.removeItem('notka_auth_token');
      localStorage.removeItem('notka_auth_user');
      sessionStorage.removeItem('initParams');
      window.__NOTKA_SAVED_AUTH__ = null;
    } catch (e) { /* ignore */ }
    postToHost({ type: 'auth_logout' });
  }

  const initialAuth = getStoredAuth();

  // Inject Telegram.WebApp shim before any script initializes
  if (initialAuth && initialAuth.user) {
    const u = initialAuth.user;
    const nameParts = (u.name || u.username || '').trim().split(' ');
    const tgUserObj = {
      id: u.id,
      username: u.username || '',
      first_name: nameParts[0] || u.username || 'Пользователь',
      last_name: nameParts.slice(1).join(' '),
      name: u.name || u.username || 'Пользователь'
    };

    const tgInitDataStr =
      'user=' + encodeURIComponent(JSON.stringify(tgUserObj)) +
      '&auth_date=' + Math.floor(Date.now() / 1000) +
      '&hash=' + (initialAuth.token || 'desktop_token');

    // 1. Prepare sessionStorage for telegram-web-app.js
    try {
      sessionStorage.setItem('initParams', JSON.stringify({
        tgWebAppData: tgInitDataStr,
        tgWebAppVersion: '7.0',
        tgWebAppPlatform: 'tdesktop',
        tgWebAppThemeParams: JSON.stringify({
          bg_color: '#0d0d0f',
          text_color: '#ffffff',
          hint_color: '#8b8b93',
          link_color: '#f72f7b',
          button_color: '#f72f7b',
          button_text_color: '#ffffff',
          secondary_bg_color: '#16101a'
        })
      }));
    } catch (e) {}

    // 2. Set hash parameter if not present (using history.replaceState to avoid scroll/nav jump)
    try {
      if (!window.location.hash || !window.location.hash.includes('tgWebAppData')) {
        const hashParams = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
        hashParams.set('tgWebAppData', tgInitDataStr);
        hashParams.set('tgWebAppVersion', '7.0');
        hashParams.set('tgWebAppPlatform', 'tdesktop');
        history.replaceState(null, '', '#' + hashParams.toString());
      }
    } catch (e) {}

    // 3. Define window.Telegram shim and protect against telegram-web-app.js replacing it
    window.Telegram = window.Telegram || {};
    let _tgWebApp = window.Telegram.WebApp || {};
    _tgWebApp.initData = tgInitDataStr;
    _tgWebApp.initDataUnsafe = {
      user: tgUserObj,
      auth_date: Math.floor(Date.now() / 1000)
    };
    _tgWebApp.version = '7.0';
    _tgWebApp.platform = 'tdesktop';
    _tgWebApp.colorScheme = 'dark';
    _tgWebApp.themeParams = {
      bg_color: '#0d0d0f',
      text_color: '#ffffff',
      hint_color: '#8b8b93',
      link_color: '#f72f7b',
      button_color: '#f72f7b',
      button_text_color: '#ffffff',
      secondary_bg_color: '#16101a'
    };

    try {
      Object.defineProperty(window.Telegram, 'WebApp', {
        get() { return _tgWebApp; },
        set(val) {
          if (val) {
            val.initData = tgInitDataStr;
            val.initDataUnsafe = {
              user: tgUserObj,
              auth_date: Math.floor(Date.now() / 1000)
            };
            val.version = '7.0';
            val.platform = 'tdesktop';
            val.colorScheme = 'dark';
            _tgWebApp = val;
          }
        },
        configurable: true,
        enumerable: true
      });
    } catch (e) {
      window.Telegram.WebApp = _tgWebApp;
    }
  }

  // Intercept fetch to add auth headers and X-Telegram-Init-Data to all API calls
  const origFetch = window.fetch;
  window.fetch = async function (resource, init) {
    init = init || {};
    const auth = getStoredAuth();

    if (auth && auth.token) {
      const headers = new Headers(init.headers || {});
      if (!headers.has('X-Auth-Token')) headers.set('X-Auth-Token', auth.token);
      if (!headers.has('Authorization')) headers.set('Authorization', 'Bearer ' + auth.token);
      if (!headers.has('X-Telegram-Init-Data') && window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) {
        headers.set('X-Telegram-Init-Data', window.Telegram.WebApp.initData);
      }
      init.headers = headers;
    }

    return origFetch.call(this, resource, init);
  };

  // Merge server sync data (favorites, playlists) into notka_state_v2
  function mergeSyncData(shared) {
    if (!shared) return;
    try {
      const stateRaw = localStorage.getItem('notka_state_v2');
      let state = stateRaw ? JSON.parse(stateRaw) : { favorites: [], playlists: [] };
      state.favorites = state.favorites || [];
      state.playlists = state.playlists || [];

      if (Array.isArray(shared.favorites)) {
        const byId = new Map(state.favorites.map((t) => [t.id, t]));
        for (const t of shared.favorites) {
          if (t && t.id && !byId.has(t.id)) {
            state.favorites.push(t);
          }
        }
      }

      if (Array.isArray(shared.playlists)) {
        const byId = new Map(state.playlists.map((p) => [p.id, p]));
        for (const p of shared.playlists) {
          if (p && p.id && !byId.has(p.id)) {
            state.playlists.push(p);
          }
        }
      }

      if (Array.isArray(shared.followedArtists)) {
        const set = new Set(state.followedArtists || []);
        for (const f of shared.followedArtists) set.add(f);
        state.followedArtists = Array.from(set);
      }

      localStorage.setItem('notka_state_v2', JSON.stringify(state));
    } catch (e) {
      console.warn('[NotkaDesktop] mergeSyncData error:', e);
    }
  }

  // Sync profile and favorites from server
  async function syncProfileWithServer() {
    const auth = getStoredAuth();
    if (!auth || !auth.token) return;

    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: {
          'X-Auth-Token': auth.token,
          'Authorization': `Bearer ${auth.token}`
        }
      });

      if (res.status === 401) {
        console.warn('[NotkaDesktop] Session token expired or invalid');
        clearAuth();
        updateUI();
        return;
      }

      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.user) {
          saveAuth(auth.token, data.user);
          if (data.sync && data.sync.shared) {
            mergeSyncData(data.sync.shared);
          }
          updateUI();
        }
      }
    } catch (e) {
      console.warn('[NotkaDesktop] syncProfileWithServer failed:', e);
    }
  }

  // Update DOM elements showing user profile
  function updateUI() {
    const auth = getStoredAuth();
    const user = auth ? auth.user : null;

    // Greeting on Home screen
    const greetingEl = document.getElementById('home-greeting');
    if (greetingEl) {
      if (user && (user.name || user.username)) {
        const firstName = (user.name || user.username).split(' ')[0];
        greetingEl.textContent = `Привет, ${firstName}!`;
      } else {
        greetingEl.textContent = 'Привет!';
      }
    }

    // Side Profile Pill
    const sideName = document.getElementById('side-name');
    const sideInitial = document.getElementById('side-initial');
    if (user) {
      const displayName = user.name || (user.username ? `@${user.username}` : `ID ${user.id}`);
      if (sideName) sideName.textContent = displayName;
      if (sideInitial) sideInitial.textContent = (displayName[0] || 'Н').toUpperCase();
    } else {
      if (sideName) sideName.textContent = 'Гость';
      if (sideInitial) sideInitial.textContent = 'Г';
    }

    // Home top avatar button
    const homeInitial = document.getElementById('home-initial');
    if (homeInitial) {
      if (user) {
        const initial = (user.name || user.username || 'Н')[0].toUpperCase();
        homeInitial.textContent = initial;
      } else {
        homeInitial.textContent = 'Г';
      }
    }

    // Replace any remaining 'Гость' text nodes in profile headers if user logged in
    if (user) {
      const allTextNodes = [];
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
      let n;
      while ((n = walk.nextNode())) {
        if (n.nodeValue && n.nodeValue.trim() === 'Гость') {
          allTextNodes.push(n);
        }
      }
      const displayName = user.name || (user.username ? `@${user.username}` : `ID ${user.id}`);
      for (const node of allTextNodes) {
        node.nodeValue = displayName;
      }
    }
  }

  // ============================================================
  // LOGIN MODAL (LIVING LIGHT DARK GLASS UI)
  // ============================================================
  function showLoginModal() {
    if (document.getElementById('notka-desktop-login-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'notka-desktop-login-modal';
    modal.innerHTML = `
      <style>
        #notka-desktop-login-modal {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          z-index: 999999;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(10, 8, 14, 0.82);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          animation: notkaFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes notkaFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes notkaCardIn { from { opacity: 0; transform: scale(0.94) translateY(12px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        .nd-card {
          width: 90%;
          max-width: 440px;
          background: rgba(22, 16, 26, 0.96);
          border: 1px solid rgba(247, 47, 123, 0.28);
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.7), 0 0 36px rgba(247, 47, 123, 0.18);
          border-radius: 28px;
          padding: 32px 28px 28px;
          color: #fff;
          text-align: center;
          box-sizing: border-box;
          animation: notkaCardIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .nd-logo {
          width: 72px;
          height: 72px;
          margin: 0 auto 16px;
          border-radius: 50%;
          display: block;
          box-shadow: 0 8px 28px rgba(247, 47, 123, 0.45);
        }
        .nd-title {
          font-size: 24px;
          font-weight: 700;
          margin: 0 0 8px;
          letter-spacing: -0.02em;
        }
        .nd-sub {
          font-size: 14px;
          line-height: 1.45;
          color: rgba(255, 255, 255, 0.68);
          margin: 0 0 24px;
        }
        .nd-field-wrap {
          position: relative;
          margin-bottom: 16px;
        }
        .nd-input {
          width: 100%;
          box-sizing: border-box;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 16px;
          padding: 14px 18px;
          font-size: 16px;
          color: #fff;
          outline: none;
          transition: border-color 0.2s, background 0.2s;
        }
        .nd-input:focus {
          border-color: #f72f7b;
          background: rgba(255, 255, 255, 0.12);
        }
        .nd-code-input {
          letter-spacing: 0.35em;
          font-size: 24px;
          text-align: center;
          font-weight: 700;
          font-family: monospace;
        }
        .nd-btn-primary {
          width: 100%;
          background: linear-gradient(135deg, #f72f7b, #c4185d);
          border: none;
          border-radius: 16px;
          padding: 14px;
          font-size: 15px;
          font-weight: 600;
          color: #fff;
          cursor: pointer;
          transition: transform 0.15s, opacity 0.15s, filter 0.2s;
          box-shadow: 0 8px 20px rgba(247, 47, 123, 0.35);
          margin-bottom: 12px;
        }
        .nd-btn-primary:hover { filter: brightness(1.08); }
        .nd-btn-primary:active { transform: scale(0.98); }
        .nd-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .nd-btn-secondary {
          width: 100%;
          background: rgba(255, 255, 255, 0.08);
          border: none;
          border-radius: 16px;
          padding: 12px;
          font-size: 14px;
          color: rgba(255, 255, 255, 0.85);
          cursor: pointer;
          margin-bottom: 8px;
          transition: background 0.2s;
        }
        .nd-btn-secondary:hover { background: rgba(255, 255, 255, 0.14); }
        .nd-btn-link {
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.5);
          font-size: 13px;
          cursor: pointer;
          padding: 8px;
          text-decoration: underline;
        }
        .nd-btn-link:hover { color: #fff; }
        .nd-error {
          background: rgba(255, 59, 48, 0.18);
          border: 1px solid rgba(255, 59, 48, 0.4);
          color: #ff6b6b;
          font-size: 13px;
          padding: 10px 14px;
          border-radius: 12px;
          margin-bottom: 16px;
          text-align: left;
          display: none;
        }
      </style>
      <div class="nd-card">
        <img class="nd-logo" src="${NOTKA_LOGO_B64}" alt="Notka" />
        <h2 class="nd-title">Вход в Нотку</h2>
        <p class="nd-sub" id="nd-sub-text">Войди по Telegram, чтобы подтянуть свои любимые треки, плейлисты и персональный микс</p>

        <div class="nd-error" id="nd-error"></div>

        <!-- Step 1: Username -->
        <div id="nd-step-username">
          <div class="nd-field-wrap">
            <input type="text" id="nd-username-input" class="nd-input" placeholder="@username или Telegram ID" autocomplete="off" />
          </div>
          <button type="button" id="nd-req-btn" class="nd-btn-primary">Получить код в Telegram</button>
          <button type="button" id="nd-have-code-btn" class="nd-btn-secondary">У меня уже есть код из бота</button>
          <button type="button" id="nd-bot-btn" class="nd-btn-secondary">💬 Открыть бота @notka_app_bot</button>
          <button type="button" id="nd-guest-btn" class="nd-btn-link">Продолжить без входа (как гость)</button>
        </div>

        <!-- Step 2: Code -->
        <div id="nd-step-code" style="display:none;">
          <div class="nd-field-wrap">
            <input type="text" id="nd-code-input" class="nd-input nd-code-input" maxlength="6" placeholder="000000" inputmode="numeric" />
          </div>
          <button type="button" id="nd-verify-btn" class="nd-btn-primary">Подтвердить и войти</button>
          <button type="button" id="nd-back-btn" class="nd-btn-secondary">← Изменить юзернейм</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const stepUsername = modal.querySelector('#nd-step-username');
    const stepCode = modal.querySelector('#nd-step-code');
    const usernameInput = modal.querySelector('#nd-username-input');
    const codeInput = modal.querySelector('#nd-code-input');
    const reqBtn = modal.querySelector('#nd-req-btn');
    const haveCodeBtn = modal.querySelector('#nd-have-code-btn');
    const verifyBtn = modal.querySelector('#nd-verify-btn');
    const botBtn = modal.querySelector('#nd-bot-btn');
    const guestBtn = modal.querySelector('#nd-guest-btn');
    const backBtn = modal.querySelector('#nd-back-btn');
    const errorEl = modal.querySelector('#nd-error');
    const subText = modal.querySelector('#nd-sub-text');

    let currentUsername = '';

    const showError = (msg) => {
      errorEl.textContent = msg;
      errorEl.style.display = 'block';
    };
    const hideError = () => {
      errorEl.style.display = 'none';
    };

    usernameInput.focus();

    // Step 1: Request Code
    reqBtn.addEventListener('click', async () => {
      const u = (usernameInput.value || '').trim().replace(/^@/, '');
      if (!u) {
        showError('Введите юзернейм или ID в Telegram');
        return;
      }
      hideError();
      reqBtn.disabled = true;
      reqBtn.textContent = 'Отправка кода...';

      try {
        const res = await fetch(`${API_BASE}/auth/request-code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: u })
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          showError(data.message || 'Ошибка отправки кода');
          return;
        }

        currentUsername = u;
        subText.textContent = `Код подтверждения отправлен в Telegram ботом @notka_app_bot для @${data.username || u}`;
        stepUsername.style.display = 'none';
        stepCode.style.display = 'block';
        codeInput.value = '';
        setTimeout(() => codeInput.focus(), 100);
      } catch (err) {
        showError('Ошибка сети при запросе кода. Проверьте интернет.');
      } finally {
        reqBtn.disabled = false;
        reqBtn.textContent = 'Получить код в Telegram';
      }
    });

    // Flip to code input if user already got /code from bot
    haveCodeBtn.addEventListener('click', () => {
      hideError();
      currentUsername = (usernameInput.value || '').trim().replace(/^@/, '');
      subText.textContent = 'Введите 6-значный код из сообщения бота @notka_app_bot';
      stepUsername.style.display = 'none';
      stepCode.style.display = 'block';
      codeInput.value = '';
      setTimeout(() => codeInput.focus(), 100);
    });

    // Step 2: Verify Code
    verifyBtn.addEventListener('click', async () => {
      const code = (codeInput.value || '').trim();
      if (!code || code.length < 6) {
        showError('Введите 6-значный код из сообщения бота');
        return;
      }
      hideError();
      verifyBtn.disabled = true;
      verifyBtn.textContent = 'Проверка...';

      try {
        const res = await fetch(`${API_BASE}/auth/verify-code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: currentUsername, code: code })
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          showError(data.message || 'Неверный код или срок действия истёк');
          return;
        }

        // Save session
        saveAuth(data.token, data.user);
        if (data.sync && data.sync.shared) {
          mergeSyncData(data.sync.shared);
        }

        modal.remove();

        // Reload page to refresh all lists, mix, and user profile cleanly
        window.location.reload();
      } catch (err) {
        showError('Ошибка сети при проверке кода.');
      } finally {
        verifyBtn.disabled = false;
        verifyBtn.textContent = 'Подтвердить и войти';
      }
    });

    backBtn.addEventListener('click', () => {
      hideError();
      subText.textContent = 'Войди по Telegram, чтобы подтянуть свои любимые треки, плейлисты и персональный микс';
      stepCode.style.display = 'none';
      stepUsername.style.display = 'block';
      usernameInput.focus();
    });

    botBtn.addEventListener('click', () => {
      window.NotkaDesktop.openExternal('https://t.me/notka_app_bot?start=login');
    });

    guestBtn.addEventListener('click', () => {
      modal.remove();
    });
  }

  // ============================================================
  // ACCOUNT SHEET / POPOVER FOR LOGGED-IN USERS
  // ============================================================
  function showAccountModal(user) {
    if (document.getElementById('notka-desktop-account-modal')) return;

    const displayName = user.name || (user.username ? `@${user.username}` : `ID ${user.id}`);
    const initial = (displayName[0] || 'Н').toUpperCase();

    const modal = document.createElement('div');
    modal.id = 'notka-desktop-account-modal';
    modal.innerHTML = `
      <style>
        #notka-desktop-account-modal {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          z-index: 999999;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(10, 8, 14, 0.78);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          animation: notkaFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .nd-acc-card {
          width: 90%;
          max-width: 400px;
          background: rgba(22, 16, 26, 0.96);
          border: 1px solid rgba(247, 47, 123, 0.25);
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.7), 0 0 32px rgba(247, 47, 123, 0.15);
          border-radius: 28px;
          padding: 28px 24px 24px;
          color: #fff;
          text-align: center;
          box-sizing: border-box;
          animation: notkaCardIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .nd-acc-avatar {
          width: 68px;
          height: 68px;
          margin: 0 auto 14px;
          border-radius: 50%;
          background: linear-gradient(135deg, #f72f7b, #c4185d);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 28px;
          font-weight: 700;
          color: #fff;
          box-shadow: 0 8px 24px rgba(247, 47, 123, 0.4);
        }
        .nd-acc-name {
          font-size: 22px;
          font-weight: 700;
          margin: 0 0 4px;
        }
        .nd-acc-sub {
          font-size: 14px;
          color: rgba(255, 255, 255, 0.6);
          margin: 0 0 20px;
        }
        .nd-acc-status {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          background: rgba(74, 222, 128, 0.12);
          border: 1px solid rgba(74, 222, 128, 0.25);
          color: #4ade80;
          font-size: 13px;
          font-weight: 500;
          border-radius: 20px;
          margin-bottom: 24px;
        }
        .nd-acc-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #4ade80;
          box-shadow: 0 0 8px #4ade80;
        }
        .nd-btn-danger {
          width: 100%;
          background: rgba(255, 59, 48, 0.15);
          border: 1px solid rgba(255, 59, 48, 0.3);
          color: #ff6b6b;
          border-radius: 16px;
          padding: 12px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          margin-bottom: 8px;
          transition: background 0.2s;
        }
        .nd-btn-danger:hover { background: rgba(255, 59, 48, 0.25); }
      </style>
      <div class="nd-acc-card">
        <div class="nd-acc-avatar">${initial}</div>
        <h2 class="nd-acc-name">${displayName}</h2>
        <p class="nd-acc-sub">${user.username ? `@${user.username} · ` : ''}Telegram ID ${user.id}</p>
        <div class="nd-acc-status"><span class="nd-acc-dot"></span>Синхронизировано с сервером</div>

        <button type="button" id="nd-acc-sync-btn" class="nd-btn-primary">Обновить данные с сервера</button>
        <button type="button" id="nd-acc-logout-btn" class="nd-btn-danger">Выйти из аккаунта</button>
        <button type="button" id="nd-acc-close-btn" class="nd-btn-secondary">Закрыть</button>
      </div>
    `;

    document.body.appendChild(modal);

    const syncBtn = modal.querySelector('#nd-acc-sync-btn');
    const logoutBtn = modal.querySelector('#nd-acc-logout-btn');
    const closeBtn = modal.querySelector('#nd-acc-close-btn');

    syncBtn.addEventListener('click', async () => {
      syncBtn.disabled = true;
      syncBtn.textContent = 'Синхронизация...';
      await syncProfileWithServer();
      syncBtn.textContent = 'Синхронизировано!';
      setTimeout(() => { modal.remove(); window.location.reload(); }, 600);
    });

    logoutBtn.addEventListener('click', () => {
      modal.remove();
      handleLogout();
    });

    closeBtn.addEventListener('click', () => {
      modal.remove();
    });
  }

  // Handle Logout
  function handleLogout() {
    clearAuth();
    window.location.reload();
  }

  // Open account sheet or login on clicking sidebar user element
  function attachSidebarListener() {
    document.addEventListener('click', (e) => {
      const target = e.target;
      const guestNode = target.closest('#home-avatar-btn, [class*="avatar"], .hero-profile, #account-avatar');
      const isSidebarPill = target.closest('#side-profile-btn, .dock-item, [class*="dock"], .sidebar, [class*="pill"]') ||
                            (target.textContent && target.textContent.includes('Гость'));

      if (isSidebarPill || guestNode) {
        const auth = getStoredAuth();
        if (!auth || !auth.user) {
          showLoginModal();
        } else {
          showAccountModal(auth.user);
        }
      }
    });
  }

  // ============================================================
  // SYSTEM MEDIA TRANSPORT CONTROLS (SMTC) BRIDGE
  // ============================================================
  const state = {
    title: '',
    artist: '',
    album: '',
    artwork: '',
    isPlaying: false,
    duration: 0,
    position: 0
  };

  const actionHandlers = {};

  if ('mediaSession' in navigator) {
    const origSetActionHandler = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
    navigator.mediaSession.setActionHandler = function (action, handler) {
      actionHandlers[action] = handler;
      return origSetActionHandler(action, handler);
    };

    try {
      let currentMetadata = navigator.mediaSession.metadata;
      Object.defineProperty(navigator.mediaSession, 'metadata', {
        get() {
          return currentMetadata;
        },
        set(meta) {
          currentMetadata = meta;
          if (meta) {
            let artUrl = '';
            if (meta.artwork && meta.artwork.length > 0) {
              const bestArt = meta.artwork[meta.artwork.length - 1];
              artUrl = bestArt.src || '';
            }

            state.title = meta.title || '';
            state.artist = meta.artist || '';
            state.album = meta.album || '';
            state.artwork = artUrl;

            postToHost({
              type: 'metadata',
              title: state.title,
              artist: state.artist,
              album: state.album,
              artwork: state.artwork
            });
          }
        },
        configurable: true,
        enumerable: true
      });
    } catch (e) {
      console.warn('[NotkaDesktop] Unable to redefine navigator.mediaSession.metadata:', e);
    }

    try {
      let currentPlaybackState = navigator.mediaSession.playbackState || 'none';
      Object.defineProperty(navigator.mediaSession, 'playbackState', {
        get() {
          return currentPlaybackState;
        },
        set(val) {
          currentPlaybackState = val;
          state.isPlaying = (val === 'playing');
          postToHost({
            type: 'playback_state',
            isPlaying: state.isPlaying,
            state: val
          });
        },
        configurable: true,
        enumerable: true
      });
    } catch (e) {
      console.warn('[NotkaDesktop] Unable to redefine navigator.mediaSession.playbackState:', e);
    }
  }

  const hookAudioElement = (audio) => {
    if (!audio || audio.__notkaHooked) return;
    audio.__notkaHooked = true;

    audio.addEventListener('play', () => {
      state.isPlaying = true;
      postToHost({
        type: 'playback_state',
        isPlaying: true,
        state: 'playing',
        duration: audio.duration || 0,
        position: audio.currentTime || 0
      });
    });

    audio.addEventListener('pause', () => {
      state.isPlaying = false;
      postToHost({
        type: 'playback_state',
        isPlaying: false,
        state: 'paused',
        duration: audio.duration || 0,
        position: audio.currentTime || 0
      });
    });

    audio.addEventListener('ended', () => {
      state.isPlaying = false;
      postToHost({
        type: 'playback_state',
        isPlaying: false,
        state: 'stopped',
        duration: audio.duration || 0,
        position: audio.currentTime || 0
      });
    });

    audio.addEventListener('durationchange', () => {
      state.duration = audio.duration || 0;
      postToHost({
        type: 'timeline',
        duration: state.duration,
        position: audio.currentTime || 0
      });
    });
  };

  document.querySelectorAll('audio').forEach(hookAudioElement);
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeName === 'AUDIO') {
          hookAudioElement(node);
        } else if (node.querySelectorAll) {
          node.querySelectorAll('audio').forEach(hookAudioElement);
        }
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Native media controls handler
  window.notkaMedia = function (action) {
    const act = (action || '').toLowerCase();
    const findAudio = () => document.querySelector('audio');

    if (act === 'play') {
      if (actionHandlers['play']) {
        actionHandlers['play']();
      } else {
        const audio = findAudio();
        if (audio) audio.play().catch(() => {});
        const playBtn = document.getElementById('player-play-btn') || document.getElementById('mp-play-btn');
        if (playBtn && !document.body.classList.contains('is-playing')) playBtn.click();
      }
    } else if (act === 'pause') {
      if (actionHandlers['pause']) {
        actionHandlers['pause']();
      } else {
        const audio = findAudio();
        if (audio) audio.pause();
        const playBtn = document.getElementById('player-play-btn') || document.getElementById('mp-play-btn');
        if (playBtn && document.body.classList.contains('is-playing')) playBtn.click();
      }
    } else if (act === 'toggle') {
      const audio = findAudio();
      const isPlaying = audio ? !audio.paused : document.body.classList.contains('is-playing');
      window.notkaMedia(isPlaying ? 'pause' : 'play');
    } else if (act === 'next' || act === 'nexttrack') {
      if (actionHandlers['nexttrack']) {
        actionHandlers['nexttrack']();
      } else {
        const nextBtn = document.getElementById('player-next-btn') || document.querySelector('.player-btn-next');
        if (nextBtn) nextBtn.click();
      }
    } else if (act === 'prev' || act === 'previous' || act === 'previoustrack') {
      if (actionHandlers['previoustrack']) {
        actionHandlers['previoustrack']();
      } else {
        const prevBtn = document.getElementById('player-prev-btn') || document.querySelector('.player-btn-prev');
        if (prevBtn) prevBtn.click();
      }
    } else if (act === 'stop') {
      if (actionHandlers['stop']) {
        actionHandlers['stop']();
      } else {
        window.notkaMedia('pause');
      }
    }
  };

  // Back button handling
  window.notkaBack = function () {
    const closeBtn = document.querySelector('.sheet-close, .modal-close, .back-button');
    if (closeBtn) {
      closeBtn.click();
      return true;
    }
    if (window.history.length > 1) {
      window.history.back();
      return true;
    }
    return false;
  };

  // Initialize startup listeners and check authentication
  const onReady = () => {
    attachSidebarListener();
    updateUI();

    const auth = getStoredAuth();
    if (!auth || !auth.user) {
      // First run without auth: show login modal after slight delay for smooth reveal
      setTimeout(() => {
        showLoginModal();
      }, 600);
    } else {
      // Refresh profile & favorites from server in the background
      syncProfileWithServer();
    }
  };

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    onReady();
  } else {
    document.addEventListener('DOMContentLoaded', onReady);
  }

  postToHost({ type: 'bridge_ready' });
})();
