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

  // Suppress legacy guest modals in web app: miniapp handles native #login-modal cleanly
  try {
    sessionStorage.setItem('notka_guest_skip', '1');
  } catch (e) {}

  // Clean up any rogue auth overlays if left over from cached scripts
  const cleanupRogueAuth = () => {
    try {
      const overlay = document.getElementById('notka-auth-overlay');
      if (overlay) overlay.remove();
      const style = document.getElementById('notka-auth-styles');
      if (style) style.remove();
    } catch (e) {}
  };
  cleanupRogueAuth();
  document.addEventListener('DOMContentLoaded', cleanupRogueAuth);

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
      // Keep cached avatar when network is unreachable
    }
  }
  document.addEventListener('DOMContentLoaded', refreshTelegramAvatar, { once: true });
  setInterval(refreshTelegramAvatar, 5 * 60 * 1000);

  // Expose global desktop interface
  window.NotkaDesktop = {
    isDesktop: true,
    platform: 'windows-webview2',
    get user() { return activeSession?.user || null; },
    version: '1.4.0',
    postMessage: postToHost,
    openExternal: (url) => postToHost({ type: 'open_external', url }),
    checkForUpdates: () => postToHost({ type: 'update_check' }),
    showLogin: () => {
      try {
        const row = document.getElementById('menu-login') || document.getElementById('account-login-row');
        if (row) {
          row.click();
        } else if (typeof window.openLogin === 'function') {
          window.openLogin(false);
        }
      } catch (e) {
        console.warn('[NotkaDesktop] showLogin failed:', e);
      }
    },
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
  // HIGH-PERFORMANCE PALETTE CACHE & SNAPPY TRANSITIONS
  // ============================================================
  const PALETTE_CACHE_KEY = 'notka_palette_cache_v2';
  let persistentPalettes = {};
  try {
    const raw = localStorage.getItem(PALETTE_CACHE_KEY);
    if (raw) persistentPalettes = JSON.parse(raw);
  } catch (e) {}

  const savePalette = (key, pal) => {
    if (!key || !pal || !pal.core || !pal.deep) return;
    try {
      persistentPalettes[key] = pal;
      const keys = Object.keys(persistentPalettes);
      if (keys.length > 300) {
        delete persistentPalettes[keys[0]];
      }
      localStorage.setItem(PALETTE_CACHE_KEY, JSON.stringify(persistentPalettes));
    } catch (e) {}
  };

  const applyInstantPalette = (pal) => {
    if (!pal || !pal.core || !pal.deep) return;
    try {
      const s = document.documentElement.style;
      s.setProperty('--c-core', pal.core);
      s.setProperty('--c-warm', pal.warm);
      s.setProperty('--c-mid', pal.mid);
      s.setProperty('--c-deep', pal.deep);
    } catch (e) {}
  };

  // Hook CSS variable changes to record any newly computed palette immediately
  try {
    const origSetProperty = document.documentElement.style.setProperty.bind(document.documentElement.style);
    const pendingPalette = {};
    document.documentElement.style.setProperty = function (prop, val, prio) {
      origSetProperty(prop, val, prio);
      if (prop === '--c-core') pendingPalette.core = val;
      else if (prop === '--c-warm') pendingPalette.warm = val;
      else if (prop === '--c-mid') pendingPalette.mid = val;
      else if (prop === '--c-deep') {
        pendingPalette.deep = val;
        if (pendingPalette.core && pendingPalette.warm && pendingPalette.mid && pendingPalette.deep) {
          const pal = { ...pendingPalette };
          if (state.artwork) savePalette(state.artwork, pal);
          if (state.title) savePalette(state.title, pal);
        }
      }
    };
  } catch (e) {}

  // Inject snappy transition styles: replace 1.4s drag with fluid 0.4s hardware-accelerated motion
  const injectPerformanceStyles = () => {
    if (document.getElementById('notka-perf-styles')) return;
    const style = document.createElement('style');
    style.id = 'notka-perf-styles';
    style.textContent = `
      .light-art {
        transition: opacity 0.18s ease-out !important;
      }
      .cover {
        transition-duration: 0.18s !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectPerformanceStyles, { once: true });
  } else {
    injectPerformanceStyles();
  }

  // Pre-warm and prefetch upcoming tracks in queue
  const scheduleQueuePrewarm = () => {
    try {
      // Find next tracks from DOM or queue
      const nextRows = document.querySelectorAll('.track-row, .sheet-row[data-id], .playlist-row, .queue-item');
      if (!nextRows || nextRows.length === 0) return;

      for (let i = 0; i < Math.min(nextRows.length, 3); i++) {
        const row = nextRows[i];
        const artEl = row.querySelector('.cover, img');
        if (artEl) {
          let artUrl = '';
          if (artEl.tagName === 'IMG') artUrl = artEl.src || artEl.dataset.src || '';
          else {
            const bg = artEl.style.backgroundImage || '';
            const m = bg.match(/url\(["']?([^"']+)["']?\)/);
            if (m) artUrl = m[1];
          }

          if (artUrl) {
            // Pre-decode in memory
            const img = new Image();
            img.src = artUrl;
          }
        }
      }
    } catch (e) {}
  };

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

        // Apply instant palette from persistent cache if available
        if (artUrl && persistentPalettes[artUrl]) {
          applyInstantPalette(persistentPalettes[artUrl]);
        } else if (state.title && persistentPalettes[state.title]) {
          applyInstantPalette(persistentPalettes[state.title]);
        }

        postToHost({
          type: 'metadata',
          title: state.title,
          artist: state.artist,
          album: state.album,
          artwork: state.artwork
        });

        setTimeout(scheduleQueuePrewarm, 1200);
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

            // Apply instant palette from persistent cache if available
            if (artUrl && persistentPalettes[artUrl]) {
              applyInstantPalette(persistentPalettes[artUrl]);
            } else if (state.title && persistentPalettes[state.title]) {
              applyInstantPalette(persistentPalettes[state.title]);
            }

            postToHost({
              type: 'metadata',
              title: state.title,
              artist: state.artist,
              album: state.album,
              artwork: state.artwork
            });

            setTimeout(scheduleQueuePrewarm, 1200);
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
  // Efficient mutation observer: observe body directly for audio additions
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
  if (document.body) {
    audioObserver.observe(document.body, { childList: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      audioObserver.observe(document.body, { childList: true });
    }, { once: true });
  }

  // Periodic metadata sync check
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

  // Back button handling: preserve miniapp's native notkaBack if present
  const originalNotkaBack = window.notkaBack;
  window.notkaBack = function () {
    if (typeof originalNotkaBack === 'function') {
      const res = originalNotkaBack();
      if (res === 'handled' || res === true) return res;
    }
    const closeBtn = document.querySelector('.sheet-close, .modal-close, .back-button, #player-back-btn');
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

  // ============================================================
  // IN-APP AUTO-UPDATE MODAL (Matches live Notka Living Light UI)
  // ============================================================
  window.__notkaShowToast = function (message) {
    try {
      const t = document.getElementById('toast');
      if (t) {
        t.textContent = String(message || '');
        t.classList.add('show');
        clearTimeout(window.__notkaToastTimer);
        window.__notkaToastTimer = setTimeout(() => t.classList.remove('show'), 2600);
      }
    } catch (e) {}
  };

  window.__notkaShowUpdateModal = function (info) {
    try {
      if (!document.body || !info) return;
      if (!document.getElementById('notka-upd-style')) {
        const st = document.createElement('style');
        st.id = 'notka-upd-style';
        st.textContent = `
          #notka-update-modal { z-index: 95; }
          #notka-update-modal .modal { text-align: center; padding: 22px 18px 18px; }
          #notka-update-modal .sheet-title { justify-content: center; text-align: center; padding: 0; margin: 0 0 2px; }
          .notka-upd-badge {
            display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 11px;
            margin-bottom: 10px; border-radius: 999px; font-size: 12px; font-weight: 600;
            background: color-mix(in srgb, var(--c-warm, #FFA6B8) 18%, var(--surface-2, rgba(255,233,223,0.09)));
            color: var(--c-core, #FFE9DF);
            box-shadow: inset 0 0 0 1px var(--line, rgba(255,233,223,0.12));
          }
          .notka-upd-badge i {
            width: 7px; height: 7px; border-radius: 50%;
            background: var(--c-warm, #FFA6B8);
            box-shadow: 0 0 8px var(--c-mid, #FF4FA0);
          }
          .notka-upd-log {
            text-align: left; margin: 12px 0 14px; padding: 12px 14px; border-radius: 18px;
            max-height: 240px; overflow-y: auto; font-size: 14px; line-height: 1.48;
            color: var(--text-2, rgba(255,241,234,0.72));
            background: var(--surface-1, rgba(255,233,223,0.055));
            box-shadow: inset 0 0 0 1px var(--line, rgba(255,233,223,0.09));
            white-space: pre-line;
          }
          .notka-upd-prog { margin: 4px 0 14px; text-align: left; }
          .notka-upd-prog-row {
            display: flex; align-items: center; justify-content: space-between; gap: 8px;
            margin-bottom: 8px; font-size: 13px; color: var(--text-2, rgba(255,241,234,0.72));
            font-variant-numeric: tabular-nums;
          }
          .notka-upd-bar {
            height: 6px; border-radius: 999px; overflow: hidden;
            background: var(--surface-2, rgba(255,233,223,0.1));
          }
          .notka-upd-fill {
            height: 100%; width: 0%; border-radius: 999px;
            background: var(--btn-light, #FFF1EA); transition: width 0.18s ease-out;
          }
          .notka-upd-err { margin: 0 0 12px; font-size: 13px; line-height: 1.4; color: #ff8e9e; }
          #notka-update-modal .pill-btn { cursor: pointer; }
          #notka-update-modal .pill-btn:disabled { opacity: 0.55; pointer-events: none; }
        `;
        (document.head || document.documentElement).appendChild(st);
      }

      const existing = document.getElementById('notka-update-modal');
      if (existing) existing.remove();

      const wrap = document.createElement('div');
      wrap.id = 'notka-update-modal';
      wrap.className = 'modal-anim';
      wrap.setAttribute('role', 'dialog');
      wrap.setAttribute('aria-modal', 'true');
      wrap.style.display = 'flex';

      const card = document.createElement('div');
      card.className = 'modal';

      const badge = document.createElement('span');
      badge.className = 'notka-upd-badge';
      badge.appendChild(document.createElement('i'));
      const verLabel = (info.currentVersion && info.version && info.currentVersion !== info.version)
        ? `v${info.currentVersion} → v${info.version}`
        : `Нотка ${info.version || ''}`;
      badge.appendChild(document.createTextNode(verLabel));
      card.appendChild(badge);

      const title = document.createElement('p');
      title.className = 'sheet-title';
      title.textContent = 'Доступно обновление';
      card.appendChild(title);

      const log = document.createElement('div');
      log.className = 'notka-upd-log';
      log.textContent = info.changelog || 'Улучшения стабильности и исправления ошибок.';
      card.appendChild(log);

      const prog = document.createElement('div');
      prog.className = 'notka-upd-prog';
      prog.hidden = true;
      const progRow = document.createElement('div');
      progRow.className = 'notka-upd-prog-row';
      const progTxt = document.createElement('span');
      const progMb = document.createElement('span');
      progRow.appendChild(progTxt);
      progRow.appendChild(progMb);
      const bar = document.createElement('div');
      bar.className = 'notka-upd-bar';
      const fill = document.createElement('div');
      fill.className = 'notka-upd-fill';
      bar.appendChild(fill);
      prog.appendChild(progRow);
      prog.appendChild(bar);
      card.appendChild(prog);

      const err = document.createElement('p');
      err.className = 'notka-upd-err';
      err.hidden = true;
      card.appendChild(err);

      const acts = document.createElement('div');
      acts.className = 'modal-actions';
      const laterBtn = document.createElement('button');
      laterBtn.type = 'button';
      laterBtn.className = 'pill-btn pill-quiet';
      laterBtn.setAttribute('data-close', '1');
      laterBtn.textContent = 'Позже';

      const goBtn = document.createElement('button');
      goBtn.type = 'button';
      goBtn.className = 'pill-btn pill-primary';
      goBtn.textContent = 'Обновить';

      acts.appendChild(laterBtn);
      acts.appendChild(goBtn);
      card.appendChild(acts);
      wrap.appendChild(card);
      document.body.appendChild(wrap);

      let busy = false;
      const onKeyDown = (e) => {
        if (e.key === 'Escape' && !busy) closeModal();
      };
      const closeModal = () => {
        document.removeEventListener('keydown', onKeyDown);
        wrap.classList.remove('open');
        setTimeout(() => { if (wrap.parentNode) wrap.remove(); }, 320);
        postToHost({ type: 'update_dismiss' });
      };

      document.addEventListener('keydown', onKeyDown);
      laterBtn.addEventListener('click', () => {
        if (busy) {
          postToHost({ type: 'update_cancel' });
        } else {
          closeModal();
        }
      });
      wrap.addEventListener('click', (e) => {
        if (e.target === wrap && !busy) closeModal();
      });
      goBtn.addEventListener('click', () => {
        if (busy) return;
        postToHost({ type: 'update_start' });
      });

      const fmtBytes = (b) => {
        if (!b || b <= 0) return '';
        if (b < 1048576) return Math.round(b / 1024) + ' КБ';
        return (b / 1048576).toFixed(1) + ' МБ';
      };

      window.__notkaUpdateState = function (s) {
        if (!s) return;
        if (s.phase === 'downloading' || s.phase === 'verifying' || s.phase === 'installing') {
          busy = true;
          prog.hidden = false;
          err.hidden = true;
          progTxt.textContent = s.text || '';
          progMb.textContent = s.total > 0 ? `${fmtBytes(s.loaded)} / ${fmtBytes(s.total)}` : fmtBytes(s.loaded);
          fill.style.width = `${s.percent >= 0 ? s.percent : 35}%`;
          goBtn.disabled = true;
          goBtn.textContent = s.phase === 'installing' ? 'Установка…' : 'Загрузка…';
          laterBtn.textContent = 'Отмена';
          laterBtn.disabled = s.phase === 'installing';
        } else if (s.phase === 'error') {
          busy = false;
          prog.hidden = true;
          err.hidden = false;
          err.textContent = s.error || 'Ошибка загрузки обновления';
          goBtn.disabled = false;
          goBtn.textContent = 'Повторить';
          laterBtn.disabled = false;
          laterBtn.textContent = 'Позже';
        } else {
          busy = false;
          prog.hidden = true;
          err.hidden = true;
          goBtn.disabled = false;
          goBtn.textContent = 'Обновить';
          laterBtn.disabled = false;
          laterBtn.textContent = 'Позже';
        }
      };

      requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
    } catch (e) {
      console.warn('[NotkaDesktop] Update modal error:', e);
    }
  };

  postToHost({ type: 'bridge_ready' });
})();
