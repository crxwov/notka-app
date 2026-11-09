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

  // Expose global desktop interface
  window.NotkaDesktop = {
    isDesktop: true,
    platform: 'windows-webview2',
    version: '1.0.0',
    postMessage: postToHost,
    openExternal: (url) => postToHost({ type: 'open_external', url }),
    showLogin: () => {
      const row = document.getElementById('menu-login');
      if (row) row.click();
    },
    logout: () => {
      try { localStorage.removeItem('notka_session_v1'); } catch (e) {}
      postToHost({ type: 'session_clear' });
      window.location.reload();
    }
  };

  // Restore saved session from native host into localStorage if present
  try {
    if (window.__NOTKA_SAVED_SESSION__ && !localStorage.getItem('notka_session_v1')) {
      localStorage.setItem('notka_session_v1', JSON.stringify(window.__NOTKA_SAVED_SESSION__));
    }
  } catch (e) {
    console.warn('[NotkaDesktop] Error restoring saved session:', e);
  }

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
    if (key === 'notka_session_v1') {
      postToHost({ type: 'session_clear' });
    }
  };

  // Intercept fetch to add auth headers to API calls
  const origFetch = window.fetch;
  window.fetch = async function (resource, init) {
    init = init || {};
    let session = null;
    try {
      session = JSON.parse(localStorage.getItem('notka_session_v1') || 'null');
    } catch (e) {}

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

  // Add guest skip button inside login-modal if it is in forced gate mode
  function ensureGuestOption() {
    const modal = document.getElementById('login-modal');
    if (!modal || document.getElementById('login-skip-guest')) return;
    const actions = modal.querySelector('.modal-actions');
    if (actions) {
      const skipBtn = document.createElement('button');
      skipBtn.id = 'login-skip-guest';
      skipBtn.type = 'button';
      skipBtn.className = 'pill-btn pill-quiet';
      skipBtn.style.marginTop = '6px';
      skipBtn.textContent = 'Продолжить без входа';
      skipBtn.addEventListener('click', () => {
        modal.classList.remove('gate');
        modal.classList.remove('open');
        setTimeout(() => { modal.style.display = 'none'; }, 380);
        try { sessionStorage.setItem('notka_guest_skip', '1'); } catch (e) {}
      });
      actions.appendChild(skipBtn);
    }
  }

  // Hook clicks on guest profile pill in sidebar to open login modal if not logged in
  document.addEventListener('click', (e) => {
    const target = e.target;
    const guestNode = target.closest('#home-avatar-btn, #side-profile-btn');
    if (guestNode) {
      let session = null;
      try { session = JSON.parse(localStorage.getItem('notka_session_v1') || 'null'); } catch (e) {}
      if (!session || !session.token) {
        const row = document.getElementById('menu-login');
        if (row) {
          row.click();
        }
      }
    }
  });

  // Observe DOM to ensure login modal has guest option whenever it appears
  const modalObserver = new MutationObserver(() => {
    ensureGuestOption();
  });
  modalObserver.observe(document.documentElement, { childList: true, subtree: true });

  // Fallback opener if first-run modal was delayed
  const onReady = () => {
    ensureGuestOption();

    setTimeout(() => {
      ensureGuestOption();
      let session = null;
      try { session = JSON.parse(localStorage.getItem('notka_session_v1') || 'null'); } catch (e) {}
      let guestDismissed = false;
      try { guestDismissed = sessionStorage.getItem('notka_guest_skip') === '1'; } catch (e) {}

      if (!session && !guestDismissed) {
        const loginModal = document.getElementById('login-modal');
        if (loginModal && !loginModal.classList.contains('open')) {
          const row = document.getElementById('menu-login');
          if (row) row.click();
        }
      }
    }, 1000);
  };

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    onReady();
  } else {
    document.addEventListener('DOMContentLoaded', onReady);
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
  audioObserver.observe(document.documentElement, { childList: true, subtree: true });

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
