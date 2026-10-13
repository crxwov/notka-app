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
    private static final String TAG = "WebAppInterface";
    private static final String PREFS_NAME = "notka_prefs";
    private static final String KEY_API_URL = "api_url";
    private static final String DEFAULT_API_URL = "https://94-156-179-229.sslip.io";

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
    public String getApiBaseUrl() {
        String url = prefs.getString(KEY_API_URL, DEFAULT_API_URL);
        if (url == null || url.isEmpty() || url.contains("127.0.0.1") || url.contains("localhost")) {
            url = DEFAULT_API_URL;
            prefs.edit().putString(KEY_API_URL, url).apply();
        }
        return url;
    }

    @JavascriptInterface
    public void setApiBaseUrl(String url) {
        if (url != null) {
            String clean = url.trim();
            if (clean.endsWith("/")) {
                clean = clean.substring(0, clean.length() - 1);
            }
            prefs.edit().putString(KEY_API_URL, clean).apply();
            Log.d(TAG, "Saved API Base URL: " + clean);
        }
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
            Log.e(TAG, "Notification haptic error", e);
        }
    }

    @JavascriptInterface
    public void hapticSelection() {
        if (vibrator == null || !vibrator.hasVibrator()) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createOneShot(10, 100));
            } else {
                vibrator.vibrate(10);
            }
        } catch (Exception e) {
            Log.e(TAG, "Selection haptic error", e);
        }
    }

    @JavascriptInterface
    public void setBackButtonVisible(boolean visible) {
        activity.setBackButtonState(visible);
    }

    @JavascriptInterface
    public void onAppReady() {
        Log.i(TAG, "Notka web application reported ready");
    }

    @JavascriptInterface
    public void closeApp() {
        activity.runOnUiThread(activity::finish);
    }

    @JavascriptInterface
    public void openExternal(String url) {
        if (url == null || url.isEmpty()) return;
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(intent);
        } catch (Exception e) {
            Log.e(TAG, "Error opening external URL: " + url, e);
        }
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
}
