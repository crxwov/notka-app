package space.notka.app;

import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private static final String TAG = "NotkaActivity";
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

        // Dark Living Light theme colors
        setupSystemBars("#0C0A12", "#0C0A12");

        webView = new WebView(this);
        setContentView(webView);

        configureWebView();

        // Load bundled single-page app
        webView.loadUrl("file:///android_asset/miniapp/index.html");
    }

    private void setupSystemBars(String statusBarHex, String navBarHex) {
        Window window = getWindow();
        try {
            int statusColor = Color.parseColor(statusBarHex);
            int navColor = Color.parseColor(navBarHex);
            window.setStatusBarColor(statusColor);
            window.setNavigationBarColor(navColor);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                View decor = window.getDecorView();
                int flags = decor.getSystemUiVisibility();
                flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                decor.setSystemUiVisibility(flags);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error applying bar colors", e);
        }
    }

    public void setHeaderColor(String hexColor) {
        runOnUiThread(() -> setupSystemBars(hexColor, "#0C0A12"));
    }

    public void setBackgroundColor(String hexColor) {
        runOnUiThread(() -> setupSystemBars("#0C0A12", hexColor));
    }

    public void setBackButtonState(boolean visible) {
        this.isBackButtonVisible = visible;
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        webView.setBackgroundColor(Color.parseColor("#0C0A12"));

        webAppInterface = new WebAppInterface(this, webView);
        webView.addJavascriptInterface(webAppInterface, "NotkaAndroid");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                injectMediaBridge();
                injectInsets();
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
                request.grant(request.getResources());
            }
        });

        // Apply safe-area insets when window insets change
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

                String js = String.format(
                    "document.documentElement.style.setProperty('--tg-safe-area-inset-top', '%dpx');" +
                    "document.documentElement.style.setProperty('--tg-safe-area-inset-bottom', '%dpx');",
                    topDp, bottomDp
                );
                webView.evaluateJavascript(js, null);
            }
        }
    }

    private void injectMediaBridge() {
        String script =
            "(function() {" +
            "  if (window.__notka_bridge_injected) return;" +
            "  window.__notka_bridge_injected = true;" +
            "  window.NotkaAndroidBridge = {" +
            "    play: function() {" +
            "      var a = document.querySelector('audio');" +
            "      if (a) a.play().catch(function(e){ console.error(e); });" +
            "    }," +
            "    pause: function() {" +
            "      var a = document.querySelector('audio');" +
            "      if (a) a.pause();" +
            "    }," +
            "    next: function() {" +
            "      if (navigator.mediaSession && navigator.mediaSession._actions && navigator.mediaSession._actions.nexttrack) {" +
            "        navigator.mediaSession._actions.nexttrack();" +
            "      } else {" +
            "        var btn = document.getElementById('player-next') || document.getElementById('dock-next-btn');" +
            "        if (btn) btn.click();" +
            "      }" +
            "    }," +
            "    prev: function() {" +
            "      if (navigator.mediaSession && navigator.mediaSession._actions && navigator.mediaSession._actions.previoustrack) {" +
            "        navigator.mediaSession._actions.previoustrack();" +
            "      } else {" +
            "        var btn = document.getElementById('player-prev');" +
            "        if (btn) btn.click();" +
            "      }" +
            "    }" +
            "  };" +
            "  if ('mediaSession' in navigator) {" +
            "    var origSet = Object.getOwnPropertyDescriptor(Navigator.prototype, 'mediaSession') ||" +
            "                 Object.getOwnPropertyDescriptor(navigator, 'mediaSession');" +
            "    var ms = navigator.mediaSession;" +
            "    ms._actions = {};" +
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
            "          if (meta && window.NotkaAndroid) {" +
            "            var art = (meta.artwork && meta.artwork.length) ? meta.artwork[0].src : '';" +
            "            window.NotkaAndroid.updateTrack(meta.title || 'Нотка', meta.artist || '', meta.album || '', art, true);" +
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

    @Override
    public void onBackPressed() {
        if (webView != null) {
            // Check if Telegram BackButton handler is active (e.g. open sheet/screen)
            webView.evaluateJavascript(
                "(function(){ return (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.BackButton && window.Telegram.WebApp.BackButton._trigger()) ? 'handled' : 'unhandled'; })();",
                val -> {
                    if ("\"handled\"".equals(val)) {
                        // Consumed by sheet/screen close
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
