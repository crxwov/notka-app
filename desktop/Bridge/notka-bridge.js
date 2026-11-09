// Notka Desktop WebView2 Bridge
(function () {
  'use strict';

  if (window.__notkaBridgeInitialized) return;
  window.__notkaBridgeInitialized = true;

  // Signal desktop application environment to Notka web app
  window.notkaDesktop = true;
  window.androidApp = false;

  const postToHost = (data) => {
    try {
      if (window.chrome && window.chrome.webview && typeof window.chrome.webview.postMessage === 'function') {
        window.chrome.webview.postMessage(data);
      }
    } catch (e) {
      console.warn('[NotkaDesktop] postMessage failed:', e);
    }
  };

  postToHost({ type: 'bridge_init', url: window.location.href });

  // Restore saved session from native host or localStorage
  let activeSession = null;
  try {
    const rawSaved = window.__NOTKA_SAVED_SESSION__;
    if (rawSaved && rawSaved.token) {
      activeSession = rawSaved;
    } else {
      const localSess = localStorage.getItem('notka_session_v1');
      if (localSess) activeSession = JSON.parse(localSess);
      else {
        const localTok = localStorage.getItem('notka_auth_token');
        const localUsr = localStorage.getItem('notka_auth_user');
        if (localTok) {
          activeSession = { token: localTok, user: localUsr ? JSON.parse(localUsr) : null };
        }
      }
    }

    if (activeSession && activeSession.token) {
      // The web login saves the account fields alongside the token.
      if (!activeSession.user && activeSession.userId) {
        activeSession.user = {
          id: activeSession.userId,
          username: activeSession.username,
          first_name: activeSession.name
        };
      }
      localStorage.setItem('notka_auth_token', activeSession.token);
      if (activeSession.user) {
        localStorage.setItem('notka_auth_user', JSON.stringify(activeSession.user));
      }
      localStorage.setItem('notka_session_v1', JSON.stringify(activeSession));

      // Pre-populate Telegram WebApp mock so miniapp recognises the user natively
      window.Telegram = window.Telegram || {};
      window.Telegram.WebApp = window.Telegram.WebApp || {};
      window.Telegram.WebApp.initData = 'notka-session:' + activeSession.token;
      window.Telegram.WebApp.initDataUnsafe = { user: activeSession.user || activeSession };
    }
  } catch (e) {
    console.warn('[NotkaDesktop] Error initializing session:', e);
  }

  async function refreshTelegramAvatar() {
    const session = activeSession;
    if (!session?.token || !session.user) return;
    try {
      const response = await fetch('https://notka.duckdns.org/auth/avatar', {
        headers: { Authorization: 'Bearer ' + session.token },
        cache: 'no-store'
      });
      let photo = '';
      if (response.status === 200 && response.headers.get('Content-Type') === 'image/jpeg') {
        const blob = await response.blob();
        if (blob.size > 128 * 1024) return;
        photo = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } else if (response.status !== 204) {
        return;
      }
      if (localStorage.getItem('notka_auth_token') !== session.token ||
          (session.user.photo_url || '') === photo) return;
      session.user.photo_url = photo;
      const telegramUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
      if (telegramUser && telegramUser.id === session.user.id) telegramUser.photo_url = photo;
      localStorage.setItem('notka_auth_user', JSON.stringify(session.user));
      localStorage.setItem('notka_session_v1', JSON.stringify(session));
      window.dispatchEvent(new Event('notka:telegram-avatar'));
    } catch (e) {
      // Keep the cached photo when the network is unavailable.
    }
  }
  document.addEventListener('DOMContentLoaded', refreshTelegramAvatar, { once: true });
  setInterval(refreshTelegramAvatar, 5 * 60 * 1000);

  // Expose global desktop interface
  window.NotkaDesktop = {
    isDesktop: true,
    platform: 'windows-webview2',
    get user() { return activeSession?.user || null; },
    version: '1.0.0',
    postMessage: postToHost,
    openExternal: (url) => postToHost({ type: 'open_external', url }),
    showLogin: () => showAuthModal(),
    logout: () => {
      try {
        localStorage.removeItem('notka_session_v1');
        localStorage.removeItem('notka_auth_token');
        localStorage.removeItem('notka_auth_user');
      } catch (e) {}
      postToHost({ type: 'session_clear' });
      window.location.reload();
    }
  };

  // Hook localStorage to mirror session changes to native host
  const origSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function (key, value) {
    origSetItem(key, value);
    if (key === 'notka_session_v1') {
      try {
        const sess = JSON.parse(value);
        postToHost({ type: 'session_save', session: sess });
      } catch (e) {}
    }
  };

  const origRemoveItem = localStorage.removeItem.bind(localStorage);
  localStorage.removeItem = function (key) {
    origRemoveItem(key);
    if (key === 'notka_session_v1' || key === 'notka_auth_token') {
      postToHost({ type: 'session_clear' });
    }
  };

  // Intercept fetch to add auth headers to API calls
  const origFetch = window.fetch;
  window.fetch = async function (resource, init) {
    init = init || {};
    let session = activeSession;
    if (!session || !session.token) {
      try {
        session = JSON.parse(localStorage.getItem('notka_session_v1') || 'null');
      } catch (e) {}
    }

    if (session && session.token) {
      const headers = new Headers(init.headers || {});
      if (!headers.has('X-Auth-Token')) headers.set('X-Auth-Token', session.token);
      if (!headers.has('Authorization')) headers.set('Authorization', 'Bearer ' + session.token);
      if (!headers.has('X-Telegram-Init-Data')) {
        headers.set('X-Telegram-Init-Data', 'notka-session:' + session.token);
      }
      init.headers = headers;
    }

    return origFetch.call(this, resource, init);
  };

  // ============================================================
  // TELEGRAM AUTHENTICATION MODAL (как на телефоне)
  // ============================================================
  function ensureAuthStyles() {
    if (document.getElementById('notka-auth-styles')) return;
    const style = document.createElement('style');
    style.id = 'notka-auth-styles';
    style.textContent = `
      #notka-auth-overlay {
        position: fixed;
        inset: 0;
        z-index: 999999;
        display: grid;
        place-items: center;
        overflow: auto;
        padding: 20px;
        background: rgba(12, 10, 18, 0.84);
      }
      .notka-auth-card {
        --auth-text: #f4efff;
        --auth-muted: rgba(244, 239, 255, 0.72);
        --auth-line: rgba(236, 228, 255, 0.14);
        position: relative;
        box-sizing: border-box;
        width: min(100%, 400px);
        padding: 28px;
        border: 1px solid var(--auth-line);
        border-radius: 24px;
        background: #17131f;
        color: var(--auth-text);
        text-align: left;
        font-family: Onest, system-ui, sans-serif;
      }
      .notka-auth-mark {
        display: block;
        width: 52px;
        height: 52px;
        border-radius: 14px;
        margin-bottom: 16px;
      }
      .notka-auth-title {
        margin: 0 0 8px;
        font-size: 26px;
        line-height: 1.15;
        letter-spacing: -0.025em;
      }
      .notka-auth-sub {
        margin: 0 0 20px;
        color: var(--auth-muted);
        font-size: 14px;
        line-height: 1.5;
      }
      .notka-auth-step {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .notka-auth-step .notka-auth-sub { margin: 0; }
      .notka-auth-field-wrap, .notka-auth-code-input {
        display: flex;
        align-items: center;
        gap: 8px;
        box-sizing: border-box;
        width: 100%;
        min-height: 46px;
        padding: 0 14px;
        border: 1px solid var(--auth-line);
        border-radius: 12px;
        background: rgba(236, 228, 255, 0.055);
        color: var(--auth-text);
        font: inherit;
      }
      .notka-auth-at { color: var(--auth-muted); }
      .notka-auth-input {
        min-width: 0;
        flex: 1;
        height: 44px;
        padding: 0;
        border: 0;
        outline: none;
        background: transparent;
        color: inherit;
        font: inherit;
      }
      .notka-auth-card input::placeholder { color: var(--auth-muted); }
      .notka-auth-card button:focus-visible,
      .notka-auth-code-input:focus-visible,
      .notka-auth-field-wrap:focus-within {
        outline: 2px solid var(--auth-text);
        outline-offset: 2px;
      }
      .notka-auth-card button {
        min-height: 40px;
        padding: 8px 14px;
        border: 0;
        border-radius: 12px;
        background: transparent;
        color: var(--auth-muted);
        font: 600 14px/1.3 Onest, system-ui, sans-serif;
        cursor: pointer;
      }
      .notka-auth-card button:hover { background: rgba(236, 228, 255, 0.09); }
      .notka-auth-card .notka-auth-primary-btn {
        min-height: 46px;
        margin-top: 4px;
        border-radius: 999px;
        background: var(--auth-text);
        color: #17131f;
      }
      .notka-auth-card .notka-auth-primary-btn:hover { background: #fff; }
      .notka-auth-card button:disabled { opacity: 0.65; cursor: wait; }
      .notka-auth-card .notka-auth-text-btn { border: 1px solid var(--auth-line); }
      .notka-auth-card .notka-auth-close-btn {
        position: absolute;
        top: 14px;
        right: 14px;
        width: 40px;
        padding: 0;
        font-size: 22px;
      }
      .notka-auth-error {
        color: #ff7a7a;
        font-size: 13px;
        line-height: 1.4;
      }
    `;
    document.head.appendChild(style);
  }

  function showAuthModal() {
    ensureAuthStyles();
    let overlay = document.getElementById('notka-auth-overlay');
    if (overlay) {
      overlay.remove();
    }

    overlay = document.createElement('div');
    overlay.id = 'notka-auth-overlay';
    overlay.innerHTML = `
      <div class="notka-auth-card" role="dialog" aria-modal="true" aria-labelledby="notka-auth-title" aria-describedby="notka-auth-description">
        <button id="notka-auth-close-x" class="notka-auth-close-btn" type="button" aria-label="Закрыть">×</button>
        <img class="notka-auth-mark" src="https://notka.duckdns.org/app/icons/icon-512.png" alt="" width="52" height="52">
        <h1 id="notka-auth-title" class="notka-auth-title">Вход в Нотку</h1>
        <p id="notka-auth-description" class="notka-auth-sub">Войди через Telegram, чтобы открыть свои треки, плейлисты и настройки.</p>

        <!-- Step 1: Username / ID -->
        <div class="notka-auth-step" id="notka-step-user">
          <label class="notka-auth-field-wrap">
            <span class="notka-auth-at">@</span>
            <input id="notka-username-input" class="notka-auth-input" type="text" aria-label="Имя пользователя в Telegram" placeholder="Имя пользователя в Telegram" autocomplete="off" autocapitalize="none" spellcheck="false">
          </label>
          <div id="notka-user-error" class="notka-auth-error" role="alert" style="display:none;"></div>
          <button id="notka-request-code-btn" class="notka-auth-primary-btn" type="button">Получить код в Telegram</button>
          <button id="notka-open-bot-btn" class="notka-auth-text-btn" type="button">Открыть бота в Telegram</button>
          <button id="notka-have-code-btn" class="notka-auth-secondary-btn" type="button">У меня уже есть код</button>
          <button id="notka-skip-guest-btn" class="notka-auth-secondary-btn" type="button">Продолжить без входа</button>
        </div>

        <!-- Step 2: Confirmation code -->
        <div class="notka-auth-step" id="notka-step-code" style="display:none;">
          <p class="notka-auth-sub">Введи 6-значный код из сообщения бота <b id="notka-target-user-label"></b></p>
          <input id="notka-code-input" class="notka-auth-code-input" type="text" inputmode="numeric" maxlength="6" aria-label="Код из Telegram" placeholder="000000" autocomplete="one-time-code">
          <div id="notka-code-error" class="notka-auth-error" role="alert" style="display:none;"></div>
          <button id="notka-verify-code-btn" class="notka-auth-primary-btn" type="button">Подтвердить и войти</button>
          <button id="notka-change-user-btn" class="notka-auth-secondary-btn" type="button">Назад к вводу юзернейма</button>
          <button id="notka-code-open-bot-btn" class="notka-auth-text-btn" type="button">Открыть бота в Telegram</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const userStep = document.getElementById('notka-step-user');
    const codeStep = document.getElementById('notka-step-code');
    const userInput = document.getElementById('notka-username-input');
    const codeInput = document.getElementById('notka-code-input');
    const userErr = document.getElementById('notka-user-error');
    const codeErr = document.getElementById('notka-code-error');
    const reqBtn = document.getElementById('notka-request-code-btn');
    const verifyBtn = document.getElementById('notka-verify-code-btn');
    const haveBtn = document.getElementById('notka-have-code-btn');
    const skipBtn = document.getElementById('notka-skip-guest-btn');
    const backBtn = document.getElementById('notka-change-user-btn');
    const closeX = document.getElementById('notka-auth-close-x');
    const targetLabel = document.getElementById('notka-target-user-label');
    const openBotBtn = document.getElementById('notka-open-bot-btn');
    const codeOpenBotBtn = document.getElementById('notka-code-open-bot-btn');

    let currentUsername = '';

    const closeModal = () => {
      overlay.remove();
    };

    closeX.addEventListener('click', closeModal);
    skipBtn.addEventListener('click', () => {
      try { sessionStorage.setItem('notka_guest_skip', '1'); } catch (e) {}
      closeModal();
    });

    const openBot = (param) => {
      const url = `https://t.me/notka_app_bot?start=${param || 'login'}`;
      postToHost({ type: 'open_external', url });
    };
    if (openBotBtn) openBotBtn.addEventListener('click', () => openBot('login'));
    if (codeOpenBotBtn) codeOpenBotBtn.addEventListener('click', () => openBot('code'));

    const showUserErr = (msg) => {
      userErr.textContent = msg;
      userErr.style.display = 'block';
    };
    const hideUserErr = () => { userErr.style.display = 'none'; };

    const showCodeErr = (msg) => {
      codeErr.textContent = msg;
      codeErr.style.display = 'block';
    };
    const hideCodeErr = () => { codeErr.style.display = 'none'; };

    userInput.addEventListener('input', hideUserErr);
    codeInput.addEventListener('input', () => {
      hideCodeErr();
      const val = codeInput.value.replace(/\D/g, '');
      codeInput.value = val;
      if (val.length === 6) {
        verifyBtn.click();
      }
    });

    userInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        reqBtn.click();
      }
    });
    codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        verifyBtn.click();
      }
    });

    reqBtn.addEventListener('click', async () => {
      const u = (userInput.value || '').trim().replace(/^@/, '');
      if (!u) {
        showUserErr('Введи юзернейм в Telegram');
        userInput.focus();
        return;
      }
      hideUserErr();
      reqBtn.disabled = true;
      const origText = reqBtn.textContent;
      reqBtn.textContent = 'Отправка кода...';

      try {
        const res = await fetch('https://notka.duckdns.org/auth/request-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: u })
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          showUserErr(data.message || 'Пользователь не найден. Запустите бота @notka_app_bot в Telegram');
          return;
        }

        currentUsername = data.username || u;
        targetLabel.textContent = `@${currentUsername}`;
        userStep.style.display = 'none';
        codeStep.style.display = 'flex';
        codeInput.value = '';
        setTimeout(() => codeInput.focus(), 100);
      } catch (err) {
        showUserErr('Ошибка подключения к серверу');
      } finally {
        reqBtn.disabled = false;
        reqBtn.textContent = origText;
      }
    });

    haveBtn.addEventListener('click', () => {
      currentUsername = (userInput.value || '').trim().replace(/^@/, '');
      targetLabel.textContent = currentUsername ? `@${currentUsername}` : 'из бота @notka_app_bot';
      userStep.style.display = 'none';
      codeStep.style.display = 'flex';
      codeInput.value = '';
      setTimeout(() => codeInput.focus(), 100);
    });

    backBtn.addEventListener('click', () => {
      hideCodeErr();
      codeStep.style.display = 'none';
      userStep.style.display = 'flex';
      userInput.focus();
    });

    verifyBtn.addEventListener('click', async () => {
      const c = (codeInput.value || '').trim();
      if (!c || c.length < 6) {
        showCodeErr('Введи 6-значный код подтверждения');
        codeInput.focus();
        return;
      }
      hideCodeErr();
      verifyBtn.disabled = true;
      const origText = verifyBtn.textContent;
      verifyBtn.textContent = 'Проверка...';

      try {
        const res = await fetch('https://notka.duckdns.org/auth/verify-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: currentUsername, code: c })
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          showCodeErr(data.message || 'Неверный код подтверждения');
          return;
        }

        // Save session locally and native host
        const sessionPayload = { token: data.token, user: data.user };
        localStorage.setItem('notka_auth_token', data.token);
        if (data.user) {
          localStorage.setItem('notka_auth_user', JSON.stringify(data.user));
        }
        localStorage.setItem('notka_session_v1', JSON.stringify(sessionPayload));

        postToHost({ type: 'session_save', session: sessionPayload });
        postToHost({ type: 'auth_save', token: data.token, user: data.user });

        // Merge server sync data into local state if provided
        if (data.sync) {
          try {
            const rawState = localStorage.getItem('notka_state_v2');
            const state = rawState ? JSON.parse(rawState) : {};
            const keys = ['favorites', 'playlists', 'settings', 'followedArtists', 'followedMeta', 'playlistFlags', 'accountName', 'accountAvatar', 'recent', 'sharedImports', 'onboardingSeenV2', 'searchHistory'];
            keys.forEach((k) => {
              if (data.sync[k] !== undefined) state[k] = data.sync[k];
            });
            localStorage.setItem('notka_state_v2', JSON.stringify(state));
          } catch (e) {}
        }

        closeModal();
        window.location.reload();
      } catch (err) {
        showCodeErr('Ошибка подтверждения кода');
      } finally {
        verifyBtn.disabled = false;
        verifyBtn.textContent = origText;
      }
    });

    setTimeout(() => userInput.focus(), 150);
  }

  // Hook clicks on guest / login triggers in the interface
  document.addEventListener('click', (e) => {
    const target = e.target;
    if (!target) return;

    // Check if user clicked profile buttons or login triggers
    const profileTrigger = target.closest('#side-profile-btn, #home-avatar-btn, [data-screen="account"], #menu-login');
    const loginTextTrigger = target.closest('button, .row, .menu-item');
    const isLoginText = loginTextTrigger && /войти через telegram|войти в аккаунт/i.test(loginTextTrigger.textContent || '');

    if (profileTrigger || isLoginText) {
      let session = null;
      try {
        session = JSON.parse(localStorage.getItem('notka_session_v1') || 'null');
        if (!session || !session.token) {
          const tok = localStorage.getItem('notka_auth_token');
          if (tok) session = { token: tok };
        }
      } catch (e) {}

      // If user is guest and clicked login trigger or profile, open auth modal
      if (!session || !session.token) {
        e.preventDefault();
        e.stopPropagation();
        showAuthModal();
      }
    }
  }, true);

  // Auto-show login modal on first launch if not logged in
  const checkInitialLogin = () => {
    let session = null;
    try {
      session = JSON.parse(localStorage.getItem('notka_session_v1') || 'null');
      if (!session || !session.token) {
        const tok = localStorage.getItem('notka_auth_token');
        if (tok) session = { token: tok };
      }
    } catch (e) {}

    let guestDismissed = false;
    try {
      guestDismissed = sessionStorage.getItem('notka_guest_skip') === '1';
    } catch (e) {}

    if (!session && !guestDismissed) {
      showAuthModal();
    }
  };

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(checkInitialLogin, 600);
  } else {
    document.addEventListener('DOMContentLoaded', () => setTimeout(checkInitialLogin, 600));
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

  // Intercept MediaMetadata constructor
  const OrigMediaMetadata = window.MediaMetadata;
  if (OrigMediaMetadata) {
    window.MediaMetadata = function (init) {
      const inst = new OrigMediaMetadata(init);
      if (init) {
        state.title = init.title || '';
        state.artist = init.artist || '';
        state.album = init.album || '';
        let artUrl = '';
        if (init.artwork && init.artwork.length > 0) {
          const bestArt = init.artwork[init.artwork.length - 1];
          artUrl = (bestArt && (bestArt.src || bestArt)) || '';
        }
        state.artwork = artUrl;
        postToHost({
          type: 'metadata',
          title: state.title,
          artist: state.artist,
          album: state.album,
          artwork: state.artwork
        });
      }
      return inst;
    };
    window.MediaMetadata.prototype = OrigMediaMetadata.prototype;
  }

  if ('mediaSession' in navigator) {
    const origSetActionHandler = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
    navigator.mediaSession.setActionHandler = function (action, handler) {
      actionHandlers[action] = handler;
      return origSetActionHandler(action, handler);
    };

    try {
      const proto = Object.getPrototypeOf(navigator.mediaSession);
      const origPlaybackDesc = Object.getOwnPropertyDescriptor(proto, 'playbackState');
      if (origPlaybackDesc && origPlaybackDesc.set) {
        const origSet = origPlaybackDesc.set;
        Object.defineProperty(navigator.mediaSession, 'playbackState', {
          get() {
            return origPlaybackDesc.get ? origPlaybackDesc.get.call(navigator.mediaSession) : (state.isPlaying ? 'playing' : 'paused');
          },
          set(val) {
            state.isPlaying = (val === 'playing');
            postToHost({
              type: 'playback_state',
              isPlaying: state.isPlaying,
              state: val
            });
            return origSet.call(navigator.mediaSession, val);
          },
          configurable: true,
          enumerable: true
        });
      }
    } catch (e) {}

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
  }

  const hookAudioElement = (audio) => {
    if (!audio || audio.__notkaHooked) return;
    audio.__notkaHooked = true;

    audio.addEventListener('play', () => {
      state.isPlaying = true;

      // Extract current DOM track info if available
      const titleEl = document.getElementById('player-title') || document.getElementById('mp-title');
      const artistEl = document.getElementById('player-artist') || document.getElementById('mp-artist');
      let domTitle = (titleEl && (titleEl.textContent || '').trim()) || '';
      let domArtist = (artistEl && (artistEl.textContent || '').trim()) || '';
      if (domTitle && domTitle !== 'Без названия' && domTitle !== 'Notka') {
        state.title = domTitle;
      }
      if (domArtist && domArtist !== 'Неизвестный исполнитель') {
        state.artist = domArtist;
      }

      postToHost({
        type: 'playback_state',
        isPlaying: true,
        state: 'playing',
        title: state.title,
        artist: state.artist,
        album: state.album,
        artwork: state.artwork,
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
  const audioObserver = new MutationObserver((mutations) => {
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
  audioObserver.observe(document, { childList: true, subtree: true });

  // Fallback poll to ensure playback state and track metadata never get out of sync
  setInterval(() => {
    const audio = document.querySelector('audio');
    const titleEl = document.getElementById('player-title') || document.getElementById('mp-title');
    const artistEl = document.getElementById('player-artist') || document.getElementById('mp-artist');
    const artEl = document.getElementById('player-art') || document.getElementById('mp-art');

    let domTitle = (titleEl && (titleEl.textContent || '').trim()) || '';
    let domArtist = (artistEl && (artistEl.textContent || '').trim()) || '';
    if (domTitle === 'Без названия' || domTitle === 'Notka') domTitle = '';
    if (domArtist === 'Неизвестный исполнитель') domArtist = '';

    if (domTitle && (domTitle !== state.title || (domArtist && domArtist !== state.artist))) {
      state.title = domTitle;
      if (domArtist) state.artist = domArtist;
      let artwork = state.artwork;
      if (!artwork && artEl) {
        const bg = artEl.style.backgroundImage || '';
        const m = bg.match(/url\(["']?([^"']+)["']?\)/);
        if (m) artwork = m[1];
      }
      postToHost({
        type: 'metadata',
        title: state.title,
        artist: state.artist,
        album: state.album || 'Нотка',
        artwork: artwork || state.artwork || ''
      });
    }

    if (audio) {
      const isPlaying = !audio.paused && !audio.ended && audio.currentTime > 0;
      if (isPlaying !== state.isPlaying) {
        state.isPlaying = isPlaying;
        postToHost({
          type: 'playback_state',
          isPlaying: isPlaying,
          state: isPlaying ? 'playing' : 'paused',
          title: state.title,
          artist: state.artist,
          album: state.album,
          artwork: state.artwork,
          duration: audio.duration || 0,
          position: audio.currentTime || 0
        });
      }
    }
  }, 1000);

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

  postToHost({ type: 'bridge_ready' });
})();
