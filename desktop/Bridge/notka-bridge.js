// Notka Desktop WebView2 Bridge
(function () {
  'use strict';

  if (window.__notkaBridgeInitialized) return;
  window.__notkaBridgeInitialized = true;

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
    postMessage: postToHost
  };

  // Track state
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

  // Hook navigator.mediaSession
  if ('mediaSession' in navigator) {
    const origSetActionHandler = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
    navigator.mediaSession.setActionHandler = function (action, handler) {
      actionHandlers[action] = handler;
      return origSetActionHandler(action, handler);
    };

    // Proxy metadata descriptor
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
              // Pick highest resolution or last artwork
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

    // Proxy playbackState descriptor
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

  // Hook HTMLAudioElement to guarantee catching audio events
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

  // Search existing audio tags and observe new ones
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

  // Native SMTC / Media Key Action Dispatcher
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

  // Back button handling (closing sheets, menus, going back)
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

  // Initial check: send current UI state if already loaded
  const checkInitialState = () => {
    const titleEl = document.querySelector('#player-title, .track-title, .mp-title');
    const artistEl = document.querySelector('#player-artist, .track-artist, .mp-artist');
    const coverEl = document.querySelector('#player-cover img, .mp-cover img');

    if (titleEl && titleEl.textContent) {
      state.title = titleEl.textContent.trim();
      state.artist = artistEl ? artistEl.textContent.trim() : '';
      state.artwork = coverEl ? coverEl.src : '';
      postToHost({
        type: 'metadata',
        title: state.title,
        artist: state.artist,
        album: 'Notka',
        artwork: state.artwork
      });
    }
  };

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(checkInitialState, 500);
  } else {
    document.addEventListener('DOMContentLoaded', () => setTimeout(checkInitialState, 500));
  }

  // Notify host that bridge is active
  postToHost({ type: 'bridge_ready' });
})();
