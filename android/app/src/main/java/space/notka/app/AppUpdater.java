package space.notka.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONObject;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class AppUpdater {
    private static final String TAG = "NotkaAppUpdater";
    private static final String PRIMARY_VERSION_URL = "https://notka.duckdns.org/app/version.json";
    private static final String GITHUB_RELEASE_URL = "https://api.github.com/repos/crxwov/notka-app/releases/latest";

    public static void checkForUpdatesAsync(Activity activity) {
        new Thread(() -> {
            try {
                // Give the web app 2 seconds to render first
                Thread.sleep(2000);

                Context context = activity.getApplicationContext();
                PackageInfo pInfo = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
                long currentVersionCode;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    currentVersionCode = pInfo.getLongVersionCode();
                } else {
                    currentVersionCode = pInfo.versionCode;
                }
                String currentVersionName = (pInfo.versionName != null) ? pInfo.versionName : "2.5.3";

                JSONObject versionData = fetchVersionInfo();
                if (versionData == null) return;

                int latestVersionCode = versionData.optInt("versionCode", 0);
                String latestVersionName = versionData.optString("versionName", "");
                String changelog = versionData.optString("changelog", "\u041e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u044f \u043f\u0440\u043e\u0438\u0437\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u044c\u043d\u043e\u0441\u0442\u0438 \u0438 \u0438\u0441\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u044f \u043e\u0448\u0438\u0431\u043e\u043a.");
                String downloadUrl = versionData.optString("downloadUrl", "");

                if (downloadUrl.isEmpty()) return;

                boolean isUpdate = false;
                if (!latestVersionName.isEmpty()) {
                    isUpdate = isNewerSemver(latestVersionName, currentVersionName);
                } else if (latestVersionCode > 0) {
                    isUpdate = (latestVersionCode > currentVersionCode);
                }

                if (isUpdate) {
                    final String verName = latestVersionName;
                    final String log = changelog;
                    final String url = downloadUrl;
                    activity.runOnUiThread(() -> showUpdateDialog(activity, verName, log, url));
                }
            } catch (Exception e) {
                Log.d(TAG, "Update check completed without prompt: " + e.getMessage());
            }
        }).start();
    }

    public static boolean isNewerSemver(String latest, String current) {
        if (latest == null || current == null) return false;
        try {
            String lClean = latest.replaceAll("[^0-9.]", "");
            String cClean = current.replaceAll("[^0-9.]", "");
            if (lClean.isEmpty() || cClean.isEmpty()) return false;
            String[] lParts = lClean.split("\\.");
            String[] cParts = cClean.split("\\.");
            int maxLen = Math.max(lParts.length, cParts.length);
            for (int i = 0; i < maxLen; i++) {
                int l = (i < lParts.length && !lParts[i].isEmpty()) ? Integer.parseInt(lParts[i]) : 0;
                int c = (i < cParts.length && !cParts[i].isEmpty()) ? Integer.parseInt(cParts[i]) : 0;
                if (l > c) return true;
                if (l < c) return false;
            }
        } catch (Exception ignored) {}
        return false;
    }

    private static JSONObject fetchVersionInfo() {
        // 1. Try primary server mirror in Russia
        try {
            JSONObject data = fetchJson(PRIMARY_VERSION_URL);
            if (data != null && (data.has("versionCode") || data.has("versionName"))) {
                return data;
            }
        } catch (Exception e) {
            Log.d(TAG, "Primary version check fallback: " + e.getMessage());
        }

        // 2. Try GitHub API fallback
        try {
            JSONObject gh = fetchJson(GITHUB_RELEASE_URL);
            if (gh != null) {
                String tag = gh.optString("tag_name", "");
                String name = gh.optString("name", "");
                String body = gh.optString("body", "");
                String downloadUrl = "";
                if (gh.has("assets")) {
                    for (int i = 0; i < gh.getJSONArray("assets").length(); i++) {
                        JSONObject asset = gh.getJSONArray("assets").getJSONObject(i);
                        if (asset.getString("name").endsWith(".apk")) {
                            downloadUrl = asset.getString("browser_download_url");
                            break;
                        }
                    }
                }
                if (!downloadUrl.isEmpty()) {
                    String androidVersion = extractAndroidVersion(tag, name, body);
                    if (androidVersion != null && !androidVersion.isEmpty()) {
                        JSONObject res = new JSONObject();
                        res.put("versionName", androidVersion);
                        res.put("changelog", extractAndroidChangelog(body));
                        res.put("downloadUrl", downloadUrl);
                        return res;
                    }
                }
            }
        } catch (Exception e) {
            Log.d(TAG, "GitHub version check failed: " + e.getMessage());
        }
        return null;
    }

    private static String extractAndroidVersion(String tag, String name, String body) {
        String tagLower = (tag != null) ? tag.toLowerCase() : "";
        if (!tagLower.startsWith("desktop") && !tagLower.startsWith("win")) {
            String clean = tagLower.replaceAll("[^0-9.]", "");
            if (!clean.isEmpty()) return clean;
        }

        if (name != null) {
            Matcher m = Pattern.compile("Android\\s*(?:v|version)?\\s*([0-9]+(?:\\.[0-9]+)+)", Pattern.CASE_INSENSITIVE).matcher(name);
            if (m.find()) {
                return m.group(1);
            }
        }

        if (body != null) {
            Matcher mBody = Pattern.compile("###\\s*Android\\s*([0-9]+(?:\\.[0-9]+)+)", Pattern.CASE_INSENSITIVE).matcher(body);
            if (mBody.find()) {
                return mBody.group(1);
            }
        }

        return null;
    }

    private static String extractAndroidChangelog(String body) {
        if (body == null || body.isEmpty()) {
            return "\u041e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u044f \u043f\u0440\u043e\u0438\u0437\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u044c\u043d\u043e\u0441\u0442\u0438 \u0438 \u0438\u0441\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u044f \u043e\u0448\u0438\u0431\u043e\u043a.";
        }
        Matcher m = Pattern.compile("(###\\s*Android[^\n]*\n(?:(?!\n###|\n---).)*)", Pattern.DOTALL | Pattern.CASE_INSENSITIVE).matcher(body);
        if (m.find()) {
            return m.group(1).trim();
        }
        return body.trim();
    }

    private static JSONObject fetchJson(String urlStr) throws Exception {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setConnectTimeout(4000);
        conn.setReadTimeout(5000);
        conn.setRequestProperty("User-Agent", "NotkaAndroidApp");
        conn.connect();
        if (conn.getResponseCode() == 200) {
            try (InputStream is = conn.getInputStream()) {
                byte[] bytes = is.readAllBytes();
                return new JSONObject(new String(bytes, "UTF-8"));
            }
        }
        return null;
    }

    private static void showUpdateDialog(Activity activity, String versionName, String changelog, String downloadUrl) {
        if (activity.isFinishing()) return;

        AlertDialog.Builder builder = new AlertDialog.Builder(activity);
        builder.setCancelable(true);

        LinearLayout root = new LinearLayout(activity);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(activity, 24), dp(activity, 24), dp(activity, 24), dp(activity, 20));

        // Dark Living Light card background
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#16121E"));
        bg.setCornerRadius(dp(activity, 24));
        bg.setStroke(dp(activity, 1), Color.parseColor("#33FFFFFF"));
        root.setBackground(bg);

        TextView title = new TextView(activity);
        title.setText("\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u043e \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u0435"); // Доступно обновление
        title.setTextColor(Color.WHITE);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        root.addView(title);

        TextView sub = new TextView(activity);
        sub.setText("\u041d\u043e\u0442\u043a\u0430 " + versionName); // Нотка <version>
        sub.setTextColor(Color.parseColor("#FF2D55"));
        sub.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        sub.setPadding(0, dp(activity, 4), 0, dp(activity, 16));
        root.addView(sub);

        ScrollView scroll = new ScrollView(activity);
        scroll.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(activity, 140)));
        TextView body = new TextView(activity);
        body.setText(changelog);
        body.setTextColor(Color.parseColor("#B3B0C2"));
        body.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        body.setLineSpacing(dp(activity, 4), 1.0f);
        scroll.addView(body);
        root.addView(scroll);

        LinearLayout buttons = new LinearLayout(activity);
        buttons.setOrientation(LinearLayout.HORIZONTAL);
        buttons.setGravity(Gravity.END);
        buttons.setPadding(0, dp(activity, 16), 0, 0);

        Button laterBtn = new Button(activity);
        laterBtn.setText("\u041f\u043e\u0437\u0436\u0435"); // Позже
        laterBtn.setTextColor(Color.parseColor("#8E8B9E"));
        laterBtn.setBackgroundColor(Color.TRANSPARENT);

        Button updateBtn = new Button(activity);
        updateBtn.setText("\u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c"); // Обновить
        updateBtn.setTextColor(Color.WHITE);
        GradientDrawable btnBg = new GradientDrawable();
        btnBg.setColor(Color.parseColor("#FF2D55"));
        btnBg.setCornerRadius(dp(activity, 16));
        updateBtn.setBackground(btnBg);

        buttons.addView(laterBtn);
        buttons.addView(updateBtn);
        root.addView(buttons);

        builder.setView(root);
        AlertDialog dialog = builder.create();
        dialog.setCanceledOnTouchOutside(true);
        if (dialog.getWindow() != null) {
            dialog.getWindow().setBackgroundDrawableResource(android.R.color.transparent);
        }

        laterBtn.setOnClickListener(v -> dialog.dismiss());
        updateBtn.setOnClickListener(v -> {
            dialog.dismiss();
            try {
                Intent browserIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(downloadUrl));
                browserIntent.addCategory(Intent.CATEGORY_BROWSABLE);
                browserIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                activity.startActivity(browserIntent);
            } catch (Exception e) {
                Log.e(TAG, "Cannot launch browser for update URL", e);
            }
        });

        dialog.show();
    }

    private static int dp(Context context, int dp) {
        return (int) (dp * context.getResources().getDisplayMetrics().density + 0.5f);
    }
}
