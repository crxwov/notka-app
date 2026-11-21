package space.notka.app;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.util.Log;
import android.webkit.WebView;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.lang.ref.WeakReference;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Self-hosted update notifier for Notka Android.
 * Checks https://notka.site/app/version.json on every startup, renders
 * the update modal in the live Living Light WebView UI, and downloads the update
 * cleanly via Android's system DownloadManager without requesting sensitive
 * REQUEST_INSTALL_PACKAGES permissions.
 */
public class AppUpdater {
    private static final String TAG = "NotkaAppUpdater";
    private static final String PRIMARY_VERSION_URL = "https://notka.site/app/version.json";
    private static final String FALLBACK_VERSION_URL = "https://notka.duckdns.org/app/version.json";
    private static final String TRUSTED_HOST = "notka.site";
    private static final String LEGACY_TRUSTED_HOST = "notka.duckdns.org";

    public static final class UpdateInfo {
        public final int versionCode;
        public final String versionName;
        public final String currentVersionName;
        public final String changelog;
        public final String downloadUrl;
        public final long sizeBytes;

        public UpdateInfo(int versionCode, String versionName, String currentVersionName,
                          String changelog, String downloadUrl, long sizeBytes) {
            this.versionCode = versionCode;
            this.versionName = versionName;
            this.currentVersionName = currentVersionName;
            this.changelog = changelog;
            this.downloadUrl = downloadUrl;
            this.sizeBytes = sizeBytes;
        }
    }

    private static volatile UpdateInfo sPendingUpdate = null;
    private static volatile boolean sPageReady = false;
    private static volatile boolean sPromptShown = false;
    private static volatile boolean sPromptDismissed = false;
    private static volatile WeakReference<WebView> sWebViewRef = new WeakReference<>(null);
    private static final AtomicBoolean sDownloading = new AtomicBoolean(false);
    private static final AtomicBoolean sCancelRequested = new AtomicBoolean(false);
    private static final AtomicLong sActiveDownloadId = new AtomicLong(-1L);

    public static void checkForUpdatesAsync(Activity activity) {
        checkForUpdatesAsync(activity, false);
    }

    public static void checkForUpdatesAsync(Activity activity, boolean manual) {
        if (activity == null) return;
        if (manual) {
            sPromptDismissed = false;
            sPromptShown = false;
        }
        new Thread(() -> {
            try {
                Context context = activity.getApplicationContext();
                PackageInfo pInfo = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
                long currentVersionCode = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P)
                        ? pInfo.getLongVersionCode()
                        : pInfo.versionCode;
                String currentVersionName = (pInfo.versionName != null && !pInfo.versionName.isEmpty())
                        ? pInfo.versionName
                        : "2.6.1";

                String urlWithBust = PRIMARY_VERSION_URL + "?t=" + System.currentTimeMillis();
                JSONObject root = fetchJson(urlWithBust);
                if (root == null) {
                    try {
                        root = fetchJson(FALLBACK_VERSION_URL + "?t=" + System.currentTimeMillis());
                    } catch (Exception ignored) {}
                }
                if (root == null) {
                    if (manual) {
                        showToast(activity, "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u044f");
                    }
                    return;
                }

                JSONObject androidNode = root.optJSONObject("android");
                JSONObject src = (androidNode != null) ? androidNode : root;

                int latestVersionCode = src.optInt("versionCode", root.optInt("versionCode", 0));
                String latestVersionName = src.optString("versionName", root.optString("versionName", "")).trim();
                String changelog = src.optString("changelog",
                        root.optString("changelog", "\u0423\u043b\u0443\u0447\u0448\u0435\u043d\u0438\u044f \u0441\u0442\u0430\u0431\u0438\u043b\u044c\u043d\u043e\u0441\u0442\u0438 \u0438 \u0438\u0441\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u044f \u043e\u0448\u0438\u0431\u043e\u043a."));
                String downloadUrl = src.optString("downloadUrl", root.optString("downloadUrl", "")).trim();
                long sizeBytes = src.optLong("size", root.optLong("size", 0L));

                if (!isTrustedServerUrl(downloadUrl)) {
                    Log.w(TAG, "Rejected untrusted update URL: " + downloadUrl);
                    return;
                }

                if (isUpdateAvailable(latestVersionCode, latestVersionName, currentVersionCode, currentVersionName)) {
                    sPendingUpdate = new UpdateInfo(
                            latestVersionCode,
                            latestVersionName.isEmpty() ? String.valueOf(latestVersionCode) : latestVersionName,
                            currentVersionName,
                            changelog,
                            downloadUrl,
                            sizeBytes
                    );
                    tryShowPrompt(activity);
                } else {
                    sPendingUpdate = null;
                    if (manual) {
                        showToast(activity, "\u0423 \u0432\u0430\u0441 \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u044f\u044f \u0432\u0435\u0440\u0441\u0438\u044f \u041d\u043e\u0442\u043a\u0438 (" + currentVersionName + ")");
                    }
                }
            } catch (Exception e) {
                Log.d(TAG, "Update check skipped: " + e.getMessage());
            }
        }, "NotkaUpdateCheck").start();
    }

    public static void onPageReady(Activity activity, WebView webView) {
        if (activity == null || webView == null) return;
        sWebViewRef = new WeakReference<>(webView);
        sPageReady = true;
        if (sPendingUpdate != null && !sPromptDismissed && !sPromptShown) {
            webView.postDelayed(() -> tryShowPrompt(activity), 650);
        }
    }

    public static void dismissPrompt() {
        sPromptDismissed = true;
        sPromptShown = false;
        sCancelRequested.set(true);
    }

    public static void cancelDownload(Activity activity) {
        sCancelRequested.set(true);
        long dlId = sActiveDownloadId.getAndSet(-1L);
        if (dlId >= 0 && activity != null) {
            try {
                DownloadManager dm = (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
                if (dm != null) dm.remove(dlId);
            } catch (Exception ignored) {}
        }
        pushModalState(activity, "idle", 0, 0, 0, null, null);
    }

    public static void openDownloads(Activity activity) {
        if (activity == null || activity.isFinishing()) return;
        activity.runOnUiThread(() -> {
            try {
                Intent intent = new Intent(DownloadManager.ACTION_VIEW_DOWNLOADS);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                activity.startActivity(intent);
            } catch (Exception e) {
                UpdateInfo info = sPendingUpdate;
                if (info != null) {
                    openInBrowser(activity, info.downloadUrl);
                }
            }
        });
    }

    public static void startDownload(Activity activity) {
        if (activity == null) return;
        UpdateInfo info = sPendingUpdate;
        if (info == null || !isTrustedServerUrl(info.downloadUrl)) return;
        if (!sDownloading.compareAndSet(false, true)) return;

        sCancelRequested.set(false);
        pushModalState(activity, "downloading", 5, 0, info.sizeBytes,
                "\u041f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u0435 \u043a \u0441\u0435\u0440\u0432\u0435\u0440\u0443\u2026", null);

        new Thread(() -> {
            try {
                DownloadManager dm = (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
                if (dm == null) {
                    openInBrowser(activity, info.downloadUrl);
                    pushModalState(activity, "done", 100, info.sizeBytes, info.sizeBytes,
                            "\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430 \u043e\u0442\u043a\u0440\u044b\u0442\u0430 \u0432 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435", null);
                    return;
                }

                String safeVer = info.versionName.replaceAll("[^0-9.]", "");
                if (safeVer.isEmpty()) safeVer = "latest";
                String fileName = "Notka-" + safeVer + ".apk";
                String dlUrl = info.downloadUrl + (info.downloadUrl.contains("?") ? "&" : "?") + "t=" + System.currentTimeMillis();

                DownloadManager.Request req = new DownloadManager.Request(Uri.parse(dlUrl));
                req.setTitle("\u041d\u043e\u0442\u043a\u0430 " + info.versionName);
                req.setDescription("\u041e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u0435 \u043f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u044f");
                req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);

                long downloadId = dm.enqueue(req);
                sActiveDownloadId.set(downloadId);

                DownloadManager.Query query = new DownloadManager.Query().setFilterById(downloadId);
                long deadline = System.currentTimeMillis() + 120_000L;

                while (!sCancelRequested.get() && System.currentTimeMillis() < deadline) {
                    Cursor cursor = null;
                    try {
                        cursor = dm.query(query);
                        if (cursor == null || !cursor.moveToFirst()) {
                            break;
                        }
                        int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                        long loaded = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                        long total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                        if (total <= 0 && info.sizeBytes > 0) total = info.sizeBytes;

                        if (status == DownloadManager.STATUS_SUCCESSFUL) {
                            sActiveDownloadId.set(-1L);
                            long finalBytes = loaded > 0 ? loaded : total;
                            pushModalState(activity, "done", 100, finalBytes, finalBytes,
                                    "\u0413\u043e\u0442\u043e\u0432\u043e! \u041e\u0442\u043a\u0440\u043e\u0439\u0442\u0435 " + fileName + " \u0432 \u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430\u0445", null);
                            openDownloads(activity);
                            return;
                        }
                        if (status == DownloadManager.STATUS_FAILED) {
                            sActiveDownloadId.set(-1L);
                            pushModalState(activity, "error", 0, 0, 0, null,
                                    "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u0435. \u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0441\u043d\u043e\u0432\u0430.");
                            return;
                        }

                        int pct = (total > 0 && loaded > 0) ? (int) Math.min(99, (loaded * 100L) / total) : 15;
                        String label = (total > 0 && loaded > 0)
                                ? "\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430\u2026 " + pct + "%"
                                : "\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430\u2026";
                        pushModalState(activity, "downloading", pct, Math.max(0, loaded), Math.max(0, total), label, null);
                    } finally {
                        if (cursor != null) cursor.close();
                    }
                    Thread.sleep(150);
                }

                if (sCancelRequested.get()) {
                    pushModalState(activity, "idle", 0, 0, 0, null, null);
                }
            } catch (Exception e) {
                Log.e(TAG, "Update download failed, falling back to browser", e);
                openInBrowser(activity, info.downloadUrl);
                pushModalState(activity, "done", 100, info.sizeBytes, info.sizeBytes,
                        "\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430 \u043e\u0442\u043a\u0440\u044b\u0442\u0430 \u0432 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435", null);
            } finally {
                sDownloading.set(false);
            }
        }, "NotkaUpdateDownload").start();
    }

    private static void openInBrowser(Activity activity, String url) {
        if (activity == null || activity.isFinishing()) return;
        activity.runOnUiThread(() -> {
            try {
                Intent browserIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                browserIntent.addCategory(Intent.CATEGORY_BROWSABLE);
                browserIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                activity.startActivity(browserIntent);
            } catch (Exception e) {
                Log.e(TAG, "Cannot open browser for update", e);
            }
        });
    }

    private static void tryShowPrompt(Activity activity) {
        if (activity == null || activity.isFinishing()) return;
        UpdateInfo info = sPendingUpdate;
        WebView wv = sWebViewRef.get();
        if (info == null || !sPageReady || wv == null || sPromptDismissed || sPromptShown) return;

        sPromptShown = true;
        activity.runOnUiThread(() -> {
            if (activity.isFinishing()) return;
            try {
                JSONObject payload = new JSONObject();
                payload.put("version", info.versionName);
                payload.put("currentVersion", info.currentVersionName);
                payload.put("changelog", info.changelog);
                payload.put("size", info.sizeBytes);
                wv.evaluateJavascript(buildInjectModalScript(payload.toString()), null);
            } catch (Exception e) {
                Log.e(TAG, "Failed to inject Living Light update modal", e);
                sPromptShown = false;
            }
        });
    }

    private static void pushModalState(Activity activity, String phase, int percent,
                                       long loaded, long total, String text, String error) {
        WebView wv = sWebViewRef.get();
        if (activity == null || activity.isFinishing() || wv == null) return;
        activity.runOnUiThread(() -> {
            try {
                JSONObject st = new JSONObject();
                st.put("phase", phase);
                st.put("percent", percent);
                st.put("loaded", loaded);
                st.put("total", total);
                if (text != null) st.put("text", text);
                if (error != null) st.put("error", error);
                wv.evaluateJavascript("window.__notkaUpdateState && window.__notkaUpdateState(" + st.toString() + ");", null);
            } catch (Exception ignored) {}
        });
    }

    private static void showToast(Activity activity, String message) {
        WebView wv = sWebViewRef.get();
        if (activity == null || activity.isFinishing() || wv == null) return;
        activity.runOnUiThread(() -> {
            String quoted = JSONObject.quote(message);
            wv.evaluateJavascript(
                "(function(){ var t = document.getElementById('toast'); if (t) { t.textContent = " + quoted + "; t.classList.add('show'); setTimeout(function(){ t.classList.remove('show'); }, 2400); } })();",
                null
            );
        });
    }

    private static String buildInjectModalScript(String payloadJson) {
        return "(function(info) {" +
            "  try {" +
            "    if (!document.body) return;" +
            "    if (!document.getElementById('notka-upd-style')) {" +
            "      var st = document.createElement('style');" +
            "      st.id = 'notka-upd-style';" +
            "      st.textContent = '" +
            "        #notka-update-modal { z-index: 95; }" +
            "        #notka-update-modal .modal { text-align: center; padding: 22px 18px 18px; }" +
            "        #notka-update-modal .sheet-title { justify-content: center; text-align: center; padding: 0; margin: 0 0 2px; }" +
            "        .notka-upd-badge { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 11px; margin-bottom: 10px; border-radius: 999px; font-size: 12px; font-weight: 600; background: color-mix(in srgb, var(--c-warm, #FFA6B8) 18%, var(--surface-2, rgba(255,233,223,0.09))); color: var(--c-core, #FFE9DF); box-shadow: inset 0 0 0 1px var(--line, rgba(255,233,223,0.12)); }" +
            "        .notka-upd-badge i { width: 7px; height: 7px; border-radius: 50%; background: var(--c-warm, #FFA6B8); box-shadow: 0 0 8px var(--c-mid, #FF4FA0); }" +
            "        .notka-upd-log { text-align: left; margin: 12px 0 14px; padding: 12px 14px; border-radius: 18px; max-height: 240px; overflow-y: auto; font-size: 14px; line-height: 1.48; color: var(--text-2, rgba(255,241,234,0.72)); background: var(--surface-1, rgba(255,233,223,0.055)); box-shadow: inset 0 0 0 1px var(--line, rgba(255,233,223,0.09)); white-space: pre-line; }" +
            "        .notka-upd-prog { margin: 4px 0 14px; text-align: left; }" +
            "        .notka-upd-prog-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; font-size: 13px; color: var(--text-2, rgba(255,241,234,0.72)); font-variant-numeric: tabular-nums; }" +
            "        .notka-upd-bar { height: 6px; border-radius: 999px; overflow: hidden; background: var(--surface-2, rgba(255,233,223,0.1)); }" +
            "        .notka-upd-fill { height: 100%; width: 0%; border-radius: 999px; background: var(--btn-light, #FFF1EA); transition: width 0.18s ease-out; }" +
            "        .notka-upd-err { margin: 0 0 12px; font-size: 13px; line-height: 1.4; color: #ff8e9e; }" +
            "        #notka-update-modal .pill-btn:disabled { opacity: 0.55; pointer-events: none; }" +
            "      ';" +
            "      (document.head || document.documentElement).appendChild(st);" +
            "    }" +
            "    var existing = document.getElementById('notka-update-modal');" +
            "    if (existing) existing.remove();" +
            "    var wrap = document.createElement('div');" +
            "    wrap.id = 'notka-update-modal';" +
            "    wrap.className = 'modal-anim';" +
            "    wrap.setAttribute('role', 'dialog');" +
            "    wrap.setAttribute('aria-modal', 'true');" +
            "    wrap.style.display = 'flex';" +
            "    var card = document.createElement('div');" +
            "    card.className = 'modal';" +
            "    var badge = document.createElement('span');" +
            "    badge.className = 'notka-upd-badge';" +
            "    badge.appendChild(document.createElement('i'));" +
            "    var verLabel = (info.currentVersion && info.version && info.currentVersion !== info.version)" +
            "      ? ('v' + info.currentVersion + ' \\u2192 v' + info.version) : ('\\u041d\\u043e\\u0442\\u043a\\u0430 ' + (info.version || ''));" +
            "    badge.appendChild(document.createTextNode(verLabel));" +
            "    card.appendChild(badge);" +
            "    var title = document.createElement('p');" +
            "    title.className = 'sheet-title';" +
            "    title.textContent = '\\u0414\\u043e\\u0441\\u0442\\u0443\\u043f\\u043d\\u043e \\u043e\\u0431\\u043d\\u043e\\u0432\\u043b\\u0435\\u043d\\u0438\\u0435';" +
            "    card.appendChild(title);" +
            "    var log = document.createElement('div');" +
            "    log.className = 'notka-upd-log';" +
            "    log.textContent = info.changelog || '';" +
            "    card.appendChild(log);" +
            "    var prog = document.createElement('div');" +
            "    prog.className = 'notka-upd-prog';" +
            "    prog.hidden = true;" +
            "    var progRow = document.createElement('div');" +
            "    progRow.className = 'notka-upd-prog-row';" +
            "    var progTxt = document.createElement('span');" +
            "    var progMb = document.createElement('span');" +
            "    progRow.appendChild(progTxt);" +
            "    progRow.appendChild(progMb);" +
            "    var bar = document.createElement('div');" +
            "    bar.className = 'notka-upd-bar';" +
            "    var fill = document.createElement('div');" +
            "    fill.className = 'notka-upd-fill';" +
            "    bar.appendChild(fill);" +
            "    prog.appendChild(progRow);" +
            "    prog.appendChild(bar);" +
            "    card.appendChild(prog);" +
            "    var err = document.createElement('p');" +
            "    err.className = 'notka-upd-err';" +
            "    err.hidden = true;" +
            "    card.appendChild(err);" +
            "    var acts = document.createElement('div');" +
            "    acts.className = 'modal-actions';" +
            "    var laterBtn = document.createElement('button');" +
            "    laterBtn.type = 'button';" +
            "    laterBtn.className = 'pill-btn pill-quiet';" +
            "    laterBtn.setAttribute('data-close', '1');" +
            "    laterBtn.textContent = '\\u041f\\u043e\\u0437\\u0436\\u0435';" +
            "    var goBtn = document.createElement('button');" +
            "    goBtn.type = 'button';" +
            "    goBtn.className = 'pill-btn pill-primary';" +
            "    goBtn.textContent = '\\u041e\\u0431\\u043d\\u043e\\u0432\\u0438\\u0442\\u044c';" +
            "    acts.appendChild(laterBtn);" +
            "    acts.appendChild(goBtn);" +
            "    card.appendChild(acts);" +
            "    wrap.appendChild(card);" +
            "    document.body.appendChild(wrap);" +
            "    var phase = 'idle';" +
            "    function closeModal() {" +
            "      wrap.classList.remove('open');" +
            "      setTimeout(function() { if (wrap.parentNode) wrap.remove(); }, 320);" +
            "      if (window.NotkaAndroid && window.NotkaAndroid.dismissAppUpdate) window.NotkaAndroid.dismissAppUpdate();" +
            "    }" +
            "    laterBtn.addEventListener('click', function() {" +
            "      if (window.NotkaAndroid && window.NotkaAndroid.hapticImpact) window.NotkaAndroid.hapticImpact('light');" +
            "      if (phase === 'downloading') {" +
            "        if (window.NotkaAndroid && window.NotkaAndroid.cancelAppUpdate) window.NotkaAndroid.cancelAppUpdate();" +
            "      } else {" +
            "        closeModal();" +
            "      }" +
            "    });" +
            "    wrap.addEventListener('click', function(e) {" +
            "      if (e.target === wrap && phase !== 'downloading') closeModal();" +
            "    });" +
            "    goBtn.addEventListener('click', function() {" +
            "      if (phase === 'downloading') return;" +
            "      if (window.NotkaAndroid && window.NotkaAndroid.hapticImpact) window.NotkaAndroid.hapticImpact('medium');" +
            "      if (phase === 'done') {" +
            "        if (window.NotkaAndroid && window.NotkaAndroid.openUpdateDownloads) window.NotkaAndroid.openUpdateDownloads();" +
            "      } else {" +
            "        if (window.NotkaAndroid && window.NotkaAndroid.startAppUpdate) window.NotkaAndroid.startAppUpdate();" +
            "      }" +
            "    });" +
            "    function fmtBytes(b) {" +
            "      if (!b || b <= 0) return '';" +
            "      if (b < 1048576) return Math.round(b / 1024) + ' \\u041a\\u0411';" +
            "      return (b / 1048576).toFixed(1) + ' \\u041c\\u0411';" +
            "    }" +
            "    window.__notkaUpdateState = function(s) {" +
            "      if (!s) return;" +
            "      phase = s.phase || 'idle';" +
            "      if (phase === 'downloading' || phase === 'done') {" +
            "        prog.hidden = false;" +
            "        err.hidden = true;" +
            "        progTxt.textContent = s.text || '';" +
            "        progMb.textContent = (s.total > 0) ? (fmtBytes(s.loaded) + ' / ' + fmtBytes(s.total)) : fmtBytes(s.loaded);" +
            "        fill.style.width = (s.percent >= 0 ? s.percent : 35) + '%';" +
            "        goBtn.disabled = (phase === 'downloading');" +
            "        goBtn.textContent = (phase === 'downloading') ? '\\u0417\\u0430\\u0433\\u0440\\u0443\\u0437\\u043a\\u0430\\u2026' : '\\u041e\\u0442\\u043a\\u0440\\u044b\\u0442\\u044c \\u0437\\u0430\\u0433\\u0440\\u0443\\u0437\\u043a\\u0438';" +
            "        laterBtn.textContent = (phase === 'downloading') ? '\\u041e\\u0442\\u043c\\u0435\\u043d\\u0430' : '\\u0417\\u0430\\u043a\\u0440\\u044b\\u0442\\u044c';" +
            "      } else if (phase === 'error') {" +
            "        prog.hidden = true;" +
            "        err.hidden = false;" +
            "        err.textContent = s.error || '\\u041e\\u0448\\u0438\\u0431\\u043a\\u0430 \\u0437\\u0430\\u0433\\u0440\\u0443\\u0437\\u043a\\u0438';" +
            "        goBtn.disabled = false;" +
            "        goBtn.textContent = '\\u041f\\u043e\\u0432\\u0442\\u043e\\u0440\\u0438\\u0442\\u044c';" +
            "        laterBtn.textContent = '\\u041f\\u043e\\u0437\\u0436\\u0435';" +
            "      } else {" +
            "        prog.hidden = true;" +
            "        err.hidden = true;" +
            "        goBtn.disabled = false;" +
            "        goBtn.textContent = '\\u041e\\u0431\\u043d\\u043e\\u0432\\u0438\\u0442\\u044c';" +
            "        laterBtn.textContent = '\\u041f\\u043e\\u0437\\u0436\\u0435';" +
            "      }" +
            "    };" +
            "    requestAnimationFrame(function() { requestAnimationFrame(function() { wrap.classList.add('open'); }); });" +
            "  } catch (e) { console.error('[NotkaUpdater] modal error', e); }" +
            "})(" + payloadJson + ");";
    }

    public static boolean isUpdateAvailable(int latestCode, String latestName, long currentCode, String currentName) {
        if (latestCode > 0 && currentCode > 0) {
            if (latestCode > currentCode) return true;
            if (latestCode < currentCode) return false;
            return isNewerSemver(latestName, currentName);
        }
        return isNewerSemver(latestName, currentName);
    }

    public static boolean isTrustedServerUrl(String urlStr) {
        if (urlStr == null || urlStr.isEmpty()) return false;
        try {
            URL u = new URL(urlStr.trim());
            String host = u.getHost();
            return "https".equalsIgnoreCase(u.getProtocol())
                    && (TRUSTED_HOST.equalsIgnoreCase(host) || LEGACY_TRUSTED_HOST.equalsIgnoreCase(host));
        } catch (Exception e) {
            return false;
        }
    }

    public static boolean isNewerSemver(String latest, String current) {
        if (latest == null || current == null) return false;
        try {
            String lBase = latest.split("[+-]", 2)[0].replaceAll("[^0-9.]", "");
            String cBase = current.split("[+-]", 2)[0].replaceAll("[^0-9.]", "");
            if (lBase.isEmpty() || cBase.isEmpty()) return false;
            String[] lParts = lBase.split("\\.");
            String[] cParts = cBase.split("\\.");
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

    private static JSONObject fetchJson(String urlStr) throws Exception {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(6000);
            conn.setRequestProperty("User-Agent", "NotkaAndroidApp");
            conn.setRequestProperty("Accept-Encoding", "identity");
            conn.setRequestProperty("Cache-Control", "no-cache");
            conn.setRequestProperty("Pragma", "no-cache");
            conn.connect();
            if (conn.getResponseCode() == HttpURLConnection.HTTP_OK) {
                try (InputStream is = conn.getInputStream();
                     ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                    byte[] buf = new byte[4096];
                    int n;
                    while ((n = is.read(buf)) != -1) {
                        out.write(buf, 0, n);
                    }
                    return new JSONObject(new String(out.toByteArray(), "UTF-8"));
                }
            }
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }
}
