package space.notka.app;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

public class WebAppInterface {
    private static final String TAG = "NotkaWebAppInterface";
    private static final String PREFS_NAME = "notka_prefs";
    private static final String KEY_APP_URL = "app_url";
    private static final String KEY_API_URL = "api_url";

    public static final String DEFAULT_APP_URL = "https://notka.duckdns.org/app/?source=android";
    public static final String DEFAULT_API_URL = "https://notka.duckdns.org";
    public static final String APP_VERSION = "2.5.2";

    private final MainActivity activity;
    private final WebView webView;
    private final Vibrator vibrator;
    private final SharedPreferences prefs;

    public WebAppInterface(MainActivity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        this.vibrator = (Vibrator) activity.getSystemService(Context.VIBRATOR_SERVICE);
        this.prefs = activity.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    @JavascriptInterface
    public String getAppUrl() {
        return prefs.getString(KEY_APP_URL, DEFAULT_APP_URL);
    }

    @JavascriptInterface
    public void setAppUrl(String url) {
        if (url != null && !url.trim().isEmpty()) {
            String clean = url.trim();
            prefs.edit().putString(KEY_APP_URL, clean).apply();
            Log.d(TAG, "Saved App URL: " + clean);
        }
    }

    @JavascriptInterface
    public String getApiBaseUrl() {
        String url = prefs.getString(KEY_API_URL, DEFAULT_API_URL);
        if (url == null || url.trim().isEmpty()) {
            url = DEFAULT_API_URL;
            prefs.edit().putString(KEY_API_URL, url).apply();
        }
        return url;
    }

    @JavascriptInterface
    public void setApiBaseUrl(String url) {
        if (url != null && !url.trim().isEmpty()) {
            String clean = url.trim();
            if (clean.endsWith("/")) {
                clean = clean.substring(0, clean.length() - 1);
            }
            prefs.edit().putString(KEY_API_URL, clean).apply();
            Log.d(TAG, "Saved API Base URL: " + clean);
        }
    }

    @JavascriptInterface
    public void reload() {
        activity.runOnUiThread(() -> {
            activity.loadAppUrl();
        });
    }

    @JavascriptInterface
    public String getAppVersion() {
        return APP_VERSION;
    }

    @JavascriptInterface
    public String getPlatform() {
        return "android";
    }

    @JavascriptInterface
    public void updateTrack(String title, String artist, String album, String artworkUrl, boolean isPlaying) {
        MediaPlaybackService.updateMetadata(activity, title, artist, album, artworkUrl, isPlaying);
    }

    @JavascriptInterface
    public void updatePlaybackState(boolean isPlaying) {
        MediaPlaybackService.updateState(activity, isPlaying);
    }

    @JavascriptInterface
    public void setHeaderColor(String hexColor) {
        activity.setHeaderColor(hexColor);
    }

    @JavascriptInterface
    public void setBackgroundColor(String hexColor) {
        activity.setBackgroundColor(hexColor);
    }

    @JavascriptInterface
    public void setBackButtonVisible(boolean visible) {
        activity.setBackButtonState(visible);
    }

    @JavascriptInterface
    public void hapticImpact(String style) {
        if (vibrator == null || !vibrator.hasVibrator()) return;
        try {
            long duration;
            int amplitude = 180;
            if ("heavy".equalsIgnoreCase(style)) {
                duration = 55;
                amplitude = 255;
            } else if ("medium".equalsIgnoreCase(style)) {
                duration = 35;
                amplitude = 200;
            } else if ("rigid".equalsIgnoreCase(style)) {
                duration = 20;
                amplitude = 240;
            } else if ("soft".equalsIgnoreCase(style)) {
                duration = 30;
                amplitude = 120;
            } else {
                duration = 15;
                amplitude = 150;
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createOneShot(duration, amplitude));
            } else {
                vibrator.vibrate(duration);
            }
        } catch (Exception e) {
            Log.e(TAG, "Haptic error", e);
        }
    }

    @JavascriptInterface
    public void hapticNotification(String type) {
        if (vibrator == null || !vibrator.hasVibrator()) return;
        try {
            long[] pattern;
            if ("error".equalsIgnoreCase(type)) {
                pattern = new long[]{0, 40, 50, 40, 50, 60};
            } else if ("warning".equalsIgnoreCase(type)) {
                pattern = new long[]{0, 35, 60, 45};
            } else { // success
                pattern = new long[]{0, 25, 40, 30};
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1));
            } else {
                vibrator.vibrate(pattern, -1);
            }
        } catch (Exception e) {
            Log.e(TAG, "Haptic notification error", e);
        }
    }

    @JavascriptInterface
    public void downloadFile(String url, String fileName) {
        activity.handleDownload(url, null, null, fileName);
    }
}
