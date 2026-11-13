package space.notka.app;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.ValueAnimator;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Rect;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewTreeObserver;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.view.animation.DecelerateInterpolator;
import android.widget.FrameLayout;
import android.webkit.ConsoleMessage;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.File;

public class MainActivity extends Activity {
    private static final String TAG = "NotkaMainActivity";
    private static final String CHROME_USER_AGENT = 
        "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36 NotkaApp/2.5";

    private static MainActivity sInstance;

    private WebView webView;
    private WebAppInterface webAppInterface;
    private boolean isBackButtonVisible = false;

    public static MainActivity getInstance() {
        return sInstance;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        sInstance = this;

        // Initialize high-performance native cover image cache
        CoverCache.init(this);

        // Configure edge-to-edge full bleed window
        setupEdgeToEdge();

        FrameLayout rootLayout = new FrameLayout(this);
        rootLayout.setLayoutParams(new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        webView = new WebView(this);
        rootLayout.addView(webView, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ));
        setContentView(rootLayout);

        configureWebView();
        loadAppUrl();

        // Ensure soft keyboard never covers input fields
        setupKeyboardListener();

        // Check for app updates in the background
        AppUpdater.checkForUpdatesAsync(this);
    }

    public void loadAppUrl() {
        if (webView == null || webAppInterface == null) return;
        String appUrl = webAppInterface.getAppUrl();
        Log.i(TAG, "Loading Notka Web App from: " + appUrl);
        webView.loadUrl(appUrl);
    }

    private void setupEdgeToEdge() {
        Window window = getWindow();
        try {
            window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS | WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION);
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.setStatusBarColor(Color.TRANSPARENT);
            window.setNavigationBarColor(Color.TRANSPARENT);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                window.setDecorFitsSystemWindows(false);
            } else {
                View decor = window.getDecorView();
                int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE |
                            View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
                            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
                decor.setSystemUiVisibility(flags);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error applying edge-to-edge window", e);
        }
    }

    private ValueAnimator marginAnimator = null;
    private int currentBottomMargin = 0;

    private void animateBottomMargin(int targetMargin) {
        if (webView == null || currentBottomMargin == targetMargin) return;
        if (marginAnimator != null && marginAnimator.isRunning()) {
            marginAnimator.cancel();
        }

        final boolean isOpen = targetMargin > 0;
        if (isOpen) {
            webView.evaluateJavascript("document.body.classList.add('keyboard-open');", null);
        }

        int startMargin = currentBottomMargin;
        marginAnimator = ValueAnimator.ofInt(startMargin, targetMargin);
        marginAnimator.setDuration(300);
        marginAnimator.setInterpolator(new DecelerateInterpolator(1.8f));
        marginAnimator.addUpdateListener(animation -> {
            int val = (int) animation.getAnimatedValue();
            currentBottomMargin = val;
            ViewGroup.LayoutParams rawLp = webView.getLayoutParams();
            if (rawLp instanceof FrameLayout.LayoutParams) {
                FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) rawLp;
                lp.bottomMargin = val;
                webView.setLayoutParams(lp);
            }
        });
        marginAnimator.addListener(new AnimatorListenerAdapter() {
            @Override
            public void onAnimationEnd(Animator animation) {
                currentBottomMargin = targetMargin;
                if (isOpen) {
                    webView.evaluateJavascript(
                        "(function(){ " +
                        "  var el = document.activeElement; " +
                        "  if (el && typeof el.scrollIntoView === 'function') { " +
                        "    el.scrollIntoView({ block: 'center', behavior: 'smooth' }); " +
                        "  } " +
                        "})();",
                        null
                    );
                } else {
                    webView.evaluateJavascript("document.body.classList.remove('keyboard-open');", null);
                }
            }
        });
        marginAnimator.start();
    }

    private void setupKeyboardListener() {
        final View decorView = getWindow().getDecorView();
        decorView.getViewTreeObserver().addOnGlobalLayoutListener(new ViewTreeObserver.OnGlobalLayoutListener() {
            private int previousTargetMargin = -1;

            @Override
            public void onGlobalLayout() {
                Rect r = new Rect();
                decorView.getWindowVisibleDisplayFrame(r);
                int screenHeight = decorView.getRootView().getHeight();
                int keypadHeight = screenHeight - r.bottom;

                // Detect if keyboard is open (> 15% of screen height)
                boolean isOpen = keypadHeight > screenHeight * 0.15;
                int targetMargin = isOpen ? keypadHeight : 0;

                if (targetMargin != previousTargetMargin) {
                    previousTargetMargin = targetMargin;
                    animateBottomMargin(targetMargin);
                }
            }
        });
    }

    public void setHeaderColor(String hexColor) {
        // Transparent edge-to-edge keeps living-light flow intact
    }

    public void setBackgroundColor(String hexColor) {
        // Transparent edge-to-edge keeps living-light flow intact
    }

    public void setBackButtonState(boolean visible) {
        this.isBackButtonVisible = visible;
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);

        // Security: restrict local file access to bundled assets only
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);

        // Smooth media playback
        settings.setMediaPlaybackRequiresUserGesture(false);

        // High performance image loading & caching
        settings.setLoadsImagesAutomatically(true);
        settings.setBlockNetworkImage(false);
        settings.setBlockNetworkLoads(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUserAgentString(CHROME_USER_AGENT);

        // Cookie management for cross-origin assets
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cookieManager.setAcceptThirdPartyCookies(webView, true);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }

        // Hardware acceleration and styling
        webView.setBackgroundColor(Color.parseColor("#0C0A12"));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        webAppInterface = new WebAppInterface(this, webView);
        webView.addJavascriptInterface(webAppInterface, "NotkaAndroid");

        webView.setDownloadListener((url, userAgent, contentDisposition, mimetype, contentLength) -> {
            handleDownload(url, contentDisposition, mimetype, null);
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (request != null && request.getUrl() != null) {
                    String url = request.getUrl().toString();
                    CoverCache cache = CoverCache.getInstance();
                    if (cache != null && cache.isCoverUrl(url)) {
                        WebResourceResponse resp = cache.getInterceptedResponse(url);
                        if (resp != null) {
                            return resp;
                        }
                    }
                }
                return super.shouldInterceptRequest(view, request);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (request == null || request.getUrl() == null) return false;
                return handleUrlNavigation(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String urlStr) {
                if (urlStr == null) return false;
                return handleUrlNavigation(Uri.parse(urlStr));
            }

            private boolean handleUrlNavigation(Uri uri) {
                String scheme = uri.getScheme();
                if (scheme == null) return false;

                // Handle intent:, tg:, mailto:, tel: safely
                if ("tg".equalsIgnoreCase(scheme) || "mailto".equalsIgnoreCase(scheme) ||
                    "tel".equalsIgnoreCase(scheme)) {
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                        intent.addCategory(Intent.CATEGORY_BROWSABLE);
                        startActivity(intent);
                        return true;
                    } catch (Exception e) {
                        Log.w(TAG, "Cannot launch app for scheme: " + scheme, e);
                        return true;
                    }
                }

                if ("intent".equalsIgnoreCase(scheme)) {
                    try {
                        Intent intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
                        intent.addCategory(Intent.CATEGORY_BROWSABLE);
                        intent.setComponent(null);
                        intent.setSelector(null);
                        startActivity(intent);
                        return true;
                    } catch (Exception e) {
                        Log.w(TAG, "Cannot launch intent URI", e);
                        return true;
                    }
                }

                // Direct track download routes
                if (uri.getPath() != null && uri.getPath().contains("/download")) {
                    handleDownload(uri.toString(), null, null, null);
                    return true;
                }

                // External domains (t.me, telegram, github, etc.) open in external apps/browser
                String host = uri.getHost();
                if (host != null && (host.contains("t.me") || host.contains("telegram.me") ||
                    host.contains("github.com") || host.contains("google.com"))) {
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                        intent.addCategory(Intent.CATEGORY_BROWSABLE);
                        startActivity(intent);
                        return true;
                    } catch (Exception e) {
                        Log.w(TAG, "Cannot open external browser for: " + uri, e);
                    }
                }

                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                injectMediaBridge();
                injectInsets();
                injectKeyboardStyles();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request != null && request.isForMainFrame()) {
                    Log.w(TAG, "Main frame failed to load, switching to offline fallback: " + error);
                    view.loadUrl("file:///android_asset/offline.html");
                }
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                super.onReceivedError(view, errorCode, description, failingUrl);
                if (failingUrl != null && !failingUrl.startsWith("file:///android_asset/")) {
                    Log.w(TAG, "Page error (" + errorCode + "): " + description);
                    view.loadUrl("file:///android_asset/offline.html");
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage cm) {
                Log.d("NotkaWeb", "[" + cm.messageLevel() + "] " + cm.message() + " (" + cm.sourceId() + ":" + cm.lineNumber() + ")");
                return true;
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                // Security check: only allow media permissions from the verified Notka origin
                Uri origin = request.getOrigin();
                if (origin != null && ("notka.duckdns.org".equalsIgnoreCase(origin.getHost()) ||
                                       "127.0.0.1".equals(origin.getHost()) ||
                                       "localhost".equals(origin.getHost()))) {
                    request.grant(request.getResources());
                } else {
                    Log.w(TAG, "Denied untrusted permission request from: " + origin);
                    request.deny();
                }
            }
        });

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT_WATCH) {
            webView.setOnApplyWindowInsetsListener((v, insets) -> {
                injectInsets();
                return insets;
            });
        }
    }

    private void injectInsets() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            View decor = getWindow().getDecorView();
            WindowInsets insets = decor.getRootWindowInsets();
            if (insets != null) {
                float density = getResources().getDisplayMetrics().density;
                int topPx = insets.getSystemWindowInsetTop();
                int bottomPx = insets.getSystemWindowInsetBottom();
                int topDp = Math.round(topPx / density);
                int bottomDp = Math.round(bottomPx / density);

                // Ensure bottom inset accounts for gesture navigation pill (minimum 24dp)
                if (bottomDp < 16) {
                    bottomDp = 24;
                }

                String js = String.format(
                    "(function() {" +
                    "  var r = document.documentElement.style;" +
                    "  r.setProperty('--sat', '%dpx');" +
                    "  r.setProperty('--sab', '%dpx');" +
                    "  r.setProperty('--tg-safe-area-inset-top', '%dpx');" +
                    "  r.setProperty('--tg-safe-area-inset-bottom', '%dpx');" +
                    "  if (window.Telegram && window.Telegram.WebApp) {" +
                    "    window.Telegram.WebApp.safeAreaInset = { top: %d, bottom: %d, left: 0, right: 0 };" +
                    "    window.Telegram.WebApp.contentSafeAreaInset = { top: %d, bottom: %d, left: 0, right: 0 };" +
                    "  }" +
                    "})();",
                    topDp, bottomDp, topDp, bottomDp, topDp, bottomDp, topDp, bottomDp
                );
                webView.evaluateJavascript(js, null);
            }
        }
    }

    private void injectKeyboardStyles() {
        if (webView == null) return;
        String script = 
            "(function() {" +
            "  var style = document.getElementById('notka-keyboard-style');" +
            "  if (!style) {" +
            "    style = document.createElement('style');" +
            "    style.id = 'notka-keyboard-style';" +
            "    style.textContent = '" +
            "      * { -webkit-tap-highlight-color: transparent !important; }" +
            "      body { -webkit-user-select: none !important; user-select: none !important; }" +
            "      input, textarea { -webkit-user-select: auto !important; user-select: auto !important; }" +
            "      img, svg { -webkit-touch-callout: none !important; }" +
            "      .cover img { transition: opacity 0.28s ease !important; will-change: opacity; }" +
            "      #login-modal.gate .modal-actions { display: grid !important; grid-template-columns: 1fr 1.35fr !important; gap: 10px !important; margin-top: 10px !important; }" +
            "      #login-modal.gate #login-cancel, #login-modal #login-cancel { display: flex !important; align-items: center !important; justify-content: center !important; min-height: 52px !important; font-size: 16px !important; }" +
            "      #login-modal.gate #login-cancel[hidden], #login-modal #login-cancel[hidden] { display: flex !important; }" +
            "      #login-modal.gate #login-next { display: flex !important; align-items: center !important; justify-content: center !important; min-height: 52px !important; font-size: 16px !important; width: 100% !important; }" +
            "      #login-modal.gate .modal { transition: padding 0.35s cubic-bezier(0.16, 1, 0.3, 1) !important; }" +
            "      #login-modal.gate .login-hero { transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.28s ease, max-height 0.35s cubic-bezier(0.16, 1, 0.3, 1), margin 0.35s cubic-bezier(0.16, 1, 0.3, 1) !important; will-change: transform, opacity, max-height; max-height: 480px; }" +
            "      body.keyboard-open #login-modal.gate .login-hero { opacity: 0 !important; transform: translateY(-26px) scale(0.92) !important; max-height: 0 !important; margin: 0 !important; overflow: hidden !important; pointer-events: none !important; }" +
            "      #login-modal.gate .login-card { transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.35s ease !important; will-change: transform; }" +
            "      body.keyboard-open #login-modal.gate .modal { justify-content: center !important; height: 100% !important; padding-top: 14px !important; padding-bottom: 14px !important; }" +
            "      body.keyboard-open #login-modal.gate { overflow-y: auto !important; -webkit-overflow-scrolling: touch !important; }" +
            "      .modal-anim .modal { transition: transform 0.32s cubic-bezier(0.16, 1, 0.3, 1) !important; will-change: transform; }" +
            "      body.keyboard-open .modal-anim { overflow-y: auto !important; align-items: center !important; justify-content: center !important; }" +
            "      body.keyboard-open .modal { margin: auto !important; max-height: calc(100vh - 20px) !important; }" +
            "      body.keyboard-open .sheet { max-height: calc(100vh - 20px) !important; }" +
            "      body.keyboard-open .tabbar, body.keyboard-open #bottom-nav, body.keyboard-open .mini-player { opacity: 0 !important; pointer-events: none !important; transform: translateY(120px) !important; transition: opacity 0.22s ease, transform 0.22s ease !important; }" +
            "      .tabbar, #bottom-nav, .mini-player { transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important; }" +
            "      body.keyboard-open .screen { padding-bottom: 24px !important; }';" +
            "    (document.head || document.documentElement).appendChild(style);" +
            "  }" +
            "  function ensureCancelBtn() {" +
            "    var lc = document.getElementById('login-cancel');" +
            "    if (lc) {" +
            "      if (lc.hasAttribute('hidden')) lc.removeAttribute('hidden');" +
            "      if (lc.style.display === 'none') lc.style.removeProperty('display');" +
            "      if (!lc.__notka_cancel_bound) {" +
            "        lc.__notka_cancel_bound = true;" +
            "        var dismiss = function(e) {" +
            "          if (e) { e.preventDefault(); e.stopPropagation(); }" +
            "          var m = document.getElementById('login-modal');" +
            "          if (m) {" +
            "            m.classList.remove('open', 'gate');" +
            "            m.style.display = 'none';" +
            "          }" +
            "          document.body.classList.remove('overlay-open');" +
            "        };" +
            "        lc.onclick = dismiss;" +
            "        lc.addEventListener('pointerdown', dismiss, true);" +
            "        lc.addEventListener('touchstart', dismiss, true);" +
            "      }" +
            "    }" +
            "  }" +
            "  ensureCancelBtn();" +
            "  if (window.MutationObserver && !window.__notka_modal_mo) {" +
            "    window.__notka_modal_mo = true;" +
            "    var mo = new MutationObserver(ensureCancelBtn);" +
            "    mo.observe(document.documentElement || document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'style', 'class'] });" +
            "  }" +
            "  document.addEventListener('click', function(e) {" +
            "    var btn = e.target ? (e.target.id === 'login-cancel' ? e.target : (e.target.closest ? e.target.closest('#login-cancel') : null)) : null;" +
            "    if (btn) {" +
            "      var m = document.getElementById('login-modal');" +
            "      if (m) {" +
            "        m.classList.remove('open', 'gate');" +
            "        m.style.display = 'none';" +
            "      }" +
            "    }" +
            "  }, true);" +
            "  if (window.visualViewport && !window.__notka_viewport_listener_added) {" +
            "    window.__notka_viewport_listener_added = true;" +
            "    window.visualViewport.addEventListener('resize', function() {" +
            "      var isKb = (window.innerHeight - window.visualViewport.height) > 150;" +
            "      if (isKb) document.body.classList.add('keyboard-open');" +
            "      else {" +
            "        var a = document.activeElement;" +
            "        if (!a || (a.tagName !== 'INPUT' && a.tagName !== 'TEXTAREA')) {" +
            "          document.body.classList.remove('keyboard-open');" +
            "        }" +
            "      }" +
            "    });" +
            "  }" +
            "  if (!window.__notka_focus_listener_added) {" +
            "    window.__notka_focus_listener_added = true;" +
            "    window.addEventListener('focusin', function(e) {" +
            "      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {" +
            "        document.body.classList.add('keyboard-open');" +
            "        setTimeout(function() {" +
            "          if (typeof e.target.scrollIntoView === 'function') {" +
            "            e.target.scrollIntoView({ block: 'center', behavior: 'smooth' });" +
            "          }" +
            "        }, 100);" +
            "      }" +
            "    });" +
            "    window.addEventListener('focusout', function(e) {" +
            "      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {" +
            "        setTimeout(function() {" +
            "          var a = document.activeElement;" +
            "          if (!a || (a.tagName !== 'INPUT' && a.tagName !== 'TEXTAREA')) {" +
            "            document.body.classList.remove('keyboard-open');" +
            "          }" +
            "        }, 200);" +
            "      }" +
            "    });" +
            "  }" +
            "})();";
        webView.evaluateJavascript(script, null);
    }

    private void injectMediaBridge() {
        String script =
            "(function() {" +
            "  if (window.__notka_bridge_injected) return;" +
            "  window.__notka_bridge_injected = true;" +
            "  window.NotkaAndroidBridge = {" +
            "    play: function() {" +
            "      if (window.notkaMedia && typeof window.notkaMedia.play === 'function') {" +
            "        window.notkaMedia.play();" +
            "      } else if (navigator.mediaSession && navigator.mediaSession._actions && navigator.mediaSession._actions.play) {" +
            "        navigator.mediaSession._actions.play();" +
            "      } else {" +
            "        var a = document.querySelector('audio');" +
            "        if (a && a.paused) a.play().catch(function(e){});" +
            "      }" +
            "    }," +
            "    pause: function() {" +
            "      if (window.notkaMedia && typeof window.notkaMedia.pause === 'function') {" +
            "        window.notkaMedia.pause();" +
            "      } else if (navigator.mediaSession && navigator.mediaSession._actions && navigator.mediaSession._actions.pause) {" +
            "        navigator.mediaSession._actions.pause();" +
            "      } else {" +
            "        var a = document.querySelector('audio');" +
            "        if (a && !a.paused) a.pause();" +
            "      }" +
            "    }," +
            "    next: function() {" +
            "      if (window.notkaMedia && typeof window.notkaMedia.next === 'function') {" +
            "        window.notkaMedia.next();" +
            "      } else if (navigator.mediaSession && navigator.mediaSession._actions && navigator.mediaSession._actions.nexttrack) {" +
            "        navigator.mediaSession._actions.nexttrack();" +
            "      } else {" +
            "        var btn = document.getElementById('player-next-btn') || document.getElementById('mp-next-btn');" +
            "        if (btn) btn.click();" +
            "      }" +
            "    }," +
            "    prev: function() {" +
            "      if (window.notkaMedia && typeof window.notkaMedia.prev === 'function') {" +
            "        window.notkaMedia.prev();" +
            "      } else if (navigator.mediaSession && navigator.mediaSession._actions && navigator.mediaSession._actions.previoustrack) {" +
            "        navigator.mediaSession._actions.previoustrack();" +
            "      } else {" +
            "        var btn = document.getElementById('player-prev-btn') || document.getElementById('mp-prev-btn');" +
            "        if (btn) btn.click();" +
            "      }" +
            "    }" +
            "  };" +
            "  function syncAudioEvents() {" +
            "    var a = document.querySelector('audio');" +
            "    if (a && !a.__notka_synced) {" +
            "      a.__notka_synced = true;" +
            "      ['play', 'playing'].forEach(function(ev) {" +
            "        a.addEventListener(ev, function() {" +
            "          if (window.NotkaAndroid) window.NotkaAndroid.updatePlaybackState(true);" +
            "        });" +
            "      });" +
            "      ['pause', 'ended'].forEach(function(ev) {" +
            "        a.addEventListener(ev, function() {" +
            "          if (window.NotkaAndroid) window.NotkaAndroid.updatePlaybackState(false);" +
            "        });" +
            "      });" +
            "    }" +
            "  }" +
            "  syncAudioEvents();" +
            "  if ('mediaSession' in navigator) {" +
            "    var origSet = Object.getOwnPropertyDescriptor(Navigator.prototype, 'mediaSession') ||" +
            "                 Object.getOwnPropertyDescriptor(navigator, 'mediaSession');" +
            "    var ms = navigator.mediaSession;" +
            "    ms._actions = ms._actions || {};" +
            "    var origSetAction = ms.setActionHandler.bind(ms);" +
            "    ms.setActionHandler = function(action, fn) {" +
            "      ms._actions[action] = fn;" +
            "      return origSetAction(action, fn);" +
            "    };" +
            "    var origMetaDesc = Object.getOwnPropertyDescriptor(MediaSession.prototype, 'metadata');" +
            "    if (origMetaDesc && origMetaDesc.set) {" +
            "      var origMetaSet = origMetaDesc.set;" +
            "      Object.defineProperty(ms, 'metadata', {" +
            "        set: function(meta) {" +
            "          origMetaSet.call(this, meta);" +
            "          syncAudioEvents();" +
            "          if (meta && window.NotkaAndroid) {" +
            "            var art = (meta.artwork && meta.artwork.length) ? meta.artwork[0].src : '';" +
            "            var isPlaying = (ms.playbackState === 'playing');" +
            "            window.NotkaAndroid.updateTrack(meta.title || '\\u041d\\u043e\\u0442\\u043a\\u0430', meta.artist || '', meta.album || '', art, isPlaying);" +
            "          }" +
            "        }" +
            "      });" +
            "    }" +
            "    var origStateDesc = Object.getOwnPropertyDescriptor(MediaSession.prototype, 'playbackState');" +
            "    if (origStateDesc && origStateDesc.set) {" +
            "      var origStateSet = origStateDesc.set;" +
            "      Object.defineProperty(ms, 'playbackState', {" +
            "        set: function(st) {" +
            "          origStateSet.call(this, st);" +
            "          if (window.NotkaAndroid) window.NotkaAndroid.updatePlaybackState(st === 'playing');" +
            "        }" +
            "      });" +
            "    }" +
            "  }" +
            "})();";
        webView.evaluateJavascript(script, null);
    }

    public void dispatchMediaCommand(String action) {
        runOnUiThread(() -> {
            if (webView == null) return;
            switch (action) {
                case MediaPlaybackService.ACTION_PLAY:
                    webView.evaluateJavascript("window.NotkaAndroidBridge && window.NotkaAndroidBridge.play()", null);
                    break;
                case MediaPlaybackService.ACTION_PAUSE:
                    webView.evaluateJavascript("window.NotkaAndroidBridge && window.NotkaAndroidBridge.pause()", null);
                    break;
                case MediaPlaybackService.ACTION_NEXT:
                    webView.evaluateJavascript("window.NotkaAndroidBridge && window.NotkaAndroidBridge.next()", null);
                    break;
                case MediaPlaybackService.ACTION_PREV:
                    webView.evaluateJavascript("window.NotkaAndroidBridge && window.NotkaAndroidBridge.prev()", null);
                    break;
            }
        });
    }

    public void handleDownload(String url, String contentDisposition, String mimeType, String customFileName) {
        runOnUiThread(() -> {
            try {
                if (url == null || url.trim().isEmpty()) return;
                Uri uri = Uri.parse(url);
                android.app.DownloadManager.Request request = new android.app.DownloadManager.Request(uri);

                String resolvedMime = mimeType;
                if (resolvedMime == null || resolvedMime.isEmpty() || "*/*".equals(resolvedMime)) {
                    resolvedMime = url.contains(".mp3") ? "audio/mpeg" : "audio/mp4";
                }
                request.setMimeType(resolvedMime);

                String fileName = customFileName;
                if (fileName == null || fileName.trim().isEmpty()) {
                    fileName = android.webkit.URLUtil.guessFileName(url, contentDisposition, resolvedMime);
                }
                if (fileName == null || fileName.isEmpty() || fileName.endsWith(".bin")) {
                    fileName = "notka_track.m4a";
                }

                request.setTitle(fileName);
                request.setDescription("\u0421\u043a\u0430\u0447\u0438\u0432\u0430\u043d\u0438\u0435 \u0442\u0440\u0435\u043a\u0430 \u0438\u0437 \u041d\u043e\u0442\u043a\u0438"); // Скачивание трека из Нотки
                request.setNotificationVisibility(android.app.DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setDestinationInExternalPublicDir(android.os.Environment.DIRECTORY_DOWNLOADS, fileName);

                android.app.DownloadManager dm = (android.app.DownloadManager) getSystemService(android.content.Context.DOWNLOAD_SERVICE);
                if (dm != null) {
                    dm.enqueue(request);
                    android.widget.Toast.makeText(this, "\u0421\u043a\u0430\u0447\u0438\u0432\u0430\u043d\u0438\u0435: " + fileName, android.widget.Toast.LENGTH_SHORT).show(); // Скачивание:
                }
            } catch (Exception e) {
                Log.e(TAG, "Download error", e);
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    intent.addCategory(Intent.CATEGORY_BROWSABLE);
                    startActivity(intent);
                } catch (Exception ex) {
                    android.widget.Toast.makeText(this, "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043d\u0430\u0447\u0430\u0442\u044c \u0441\u043a\u0430\u0447\u0438\u0432\u0430\u043d\u0438\u0435", android.widget.Toast.LENGTH_SHORT).show(); // Не удалось начать скачивание
                }
            }
        });
    }

    @Override
    public void onBackPressed() {
        if (webView != null) {
            webView.evaluateJavascript(
                "(function(){ " +
                "  try { " +
                "    var lm = document.getElementById('login-modal'); " +
                "    if (lm && (lm.classList.contains('open') || (lm.style.display !== 'none' && lm.offsetWidth > 0))) { " +
                "      lm.classList.remove('open', 'gate'); " +
                "      lm.style.display = 'none'; " +
                "      return 'handled'; " +
                "    } " +
                "    var openModal = document.querySelector('.sheet-anim.open, .modal-anim.open, .sheet.open, .modal-wrap.open'); " +
                "    if (openModal) { " +
                "      var closeBtn = openModal.querySelector('#login-cancel, .sheet-close, .modal-close, .btn-close, [data-close]'); " +
                "      if (closeBtn) { closeBtn.click(); return 'handled'; } " +
                "      openModal.click(); " +
                "      return 'handled'; " +
                "    } " +
                "    var screen = (document.body && document.body.dataset) ? document.body.dataset.screen : ''; " +
                "    var p = document.getElementById('screen-player'); " +
                "    if (screen === 'player' || (p && !p.hidden)) { " +
                "      var b = document.getElementById('player-back-btn'); " +
                "      if (b) { b.click(); return 'handled'; } " +
                "    } " +
                "    var tabs = ['home', 'search', 'library']; " +
                "    if (screen && tabs.indexOf(screen) === -1 && screen !== 'splash' && screen !== 'onboarding') { " +
                "      var activeScreen = document.getElementById('screen-' + screen) || document.querySelector('.screen:not([hidden])'); " +
                "      if (activeScreen) { " +
                "        var backBtn = activeScreen.querySelector('.back-btn, #player-back-btn, [data-back]'); " +
                "        if (backBtn) { backBtn.click(); return 'handled'; } " +
                "      } " +
                "      var anyBack = document.querySelector('.back-btn:not([hidden])'); " +
                "      if (anyBack) { anyBack.click(); return 'handled'; } " +
                "    } " +
                "    if (typeof window.notkaBack === 'function') { " +
                "      var res = window.notkaBack(); " +
                "      if (res === 'handled' || res === true) return 'handled'; " +
                "    } " +
                "    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.BackButton && window.Telegram.WebApp.BackButton._trigger) { " +
                "      var res = window.Telegram.WebApp.BackButton._trigger(); " +
                "      if (res === 'handled' || res === true) return 'handled'; " +
                "    } " +
                "  } catch (e) { console.error('onBackPressed error', e); } " +
                "  return 'unhandled'; " +
                "})();",
                val -> {
                    if ("\"handled\"".equals(val)) {
                        return;
                    }
                    if (webView.canGoBack()) {
                        webView.goBack();
                    } else {
                        // Minimize to home instead of destroying audio playback
                        moveTaskToBack(true);
                    }
                }
            );
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (sInstance == this) {
            sInstance = null;
        }
        super.onDestroy();
    }
}
