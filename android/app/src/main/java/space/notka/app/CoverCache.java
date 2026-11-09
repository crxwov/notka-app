package space.notka.app;

import android.content.Context;
import android.util.Log;
import android.util.LruCache;
import android.webkit.WebResourceResponse;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class CoverCache {
    private static final String TAG = "NotkaCoverCache";
    private static final String CACHE_DIR_NAME = "notka_covers";
    private static final int MAX_MEMORY_CACHE_BYTES = 16 * 1024 * 1024; // 16 MB memory cache

    private static CoverCache sInstance;

    private final File cacheDir;
    private final LruCache<String, byte[]> memoryCache;
    private final ExecutorService prefetchPool;
    private final ConcurrentHashMap<String, Boolean> inFlightDownloads = new ConcurrentHashMap<>();

    public static synchronized void init(Context context) {
        if (sInstance == null) {
            sInstance = new CoverCache(context.getApplicationContext());
        }
    }

    public static CoverCache getInstance() {
        return sInstance;
    }

    private CoverCache(Context context) {
        this.cacheDir = new File(context.getCacheDir(), CACHE_DIR_NAME);
        if (!cacheDir.exists()) {
            cacheDir.mkdirs();
        }

        this.memoryCache = new LruCache<String, byte[]>(MAX_MEMORY_CACHE_BYTES) {
            @Override
            protected int sizeOf(String key, byte[] value) {
                return value != null ? value.length : 0;
            }
        };

        this.prefetchPool = Executors.newFixedThreadPool(6);
    }

    public boolean isCoverUrl(String url) {
        if (url == null) return false;
        String lower = url.toLowerCase();

        // Must not be web app code or API endpoints
        if (lower.contains("/app/") || lower.contains("/api/") || lower.contains("/auth/") ||
            lower.contains("/stream") || lower.contains(".js") || lower.contains(".css") || lower.contains(".html")) {
            return false;
        }

        // Common music artwork hosts and patterns
        return lower.contains("mzstatic.com") ||
               lower.contains("googleusercontent.com") ||
               lower.contains("ytimg.com") ||
               lower.contains("ggpht.com") ||
               lower.contains("sndcdn.com") ||
               lower.contains("twimg.com") ||
               lower.contains("/artwork") ||
               lower.contains("/cover") ||
               lower.contains("/thumb") ||
               lower.endsWith(".jpg") ||
               lower.endsWith(".jpeg") ||
               lower.endsWith(".png") ||
               lower.endsWith(".webp");
    }

    private String getMimeType(String url) {
        if (url == null) return "image/jpeg";
        String lower = url.toLowerCase();
        if (lower.contains(".png")) return "image/png";
        if (lower.contains(".webp")) return "image/webp";
        if (lower.contains(".gif")) return "image/gif";
        return "image/jpeg";
    }

    private Map<String, String> getResponseHeaders() {
        Map<String, String> headers = new HashMap<>();
        headers.put("Access-Control-Allow-Origin", "*");
        headers.put("Cache-Control", "public, max-age=31536000, immutable");
        return headers;
    }

    public WebResourceResponse getInterceptedResponse(String url) {
        try {
            // Fast non-blocking lookup: only return if already in RAM or on disk (0 ms).
            // Never block WebView worker threads with synchronous network downloads!
            byte[] cached = getCoverBytes(url, false);
            if (cached != null && cached.length > 0) {
                return new WebResourceResponse(
                        getMimeType(url),
                        null,
                        200,
                        "OK",
                        getResponseHeaders(),
                        new ByteArrayInputStream(cached)
                );
            }
        } catch (Exception e) {
            Log.w(TAG, "Cache read failed: " + url, e);
        }

        // Return null so Chromium's native network engine downloads the resource via HTTP/2
        // with full connection pooling, hardware acceleration, and zero thread contention.
        return null;
    }

    public byte[] getCoverBytes(String urlStr, boolean allowDownload) {
        if (urlStr == null || urlStr.trim().isEmpty()) return null;
        String key = hashKey(urlStr);

        // 1. Check in-memory RAM cache (0.01 ms)
        byte[] mem = memoryCache.get(key);
        if (mem != null && mem.length > 0) {
            return mem;
        }

        // 2. Check on-disk cache file (0.5 ms)
        File file = new File(cacheDir, key);
        if (file.exists() && file.length() > 0) {
            try (FileInputStream fis = new FileInputStream(file);
                 ByteArrayOutputStream bos = new ByteArrayOutputStream((int) file.length())) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = fis.read(buf)) != -1) {
                    bos.write(buf, 0, n);
                }
                byte[] diskBytes = bos.toByteArray();
                if (diskBytes.length > 0) {
                    memoryCache.put(key, diskBytes);
                    return diskBytes;
                }
            } catch (Exception e) {
                Log.w(TAG, "Error reading cover file: " + file.getName(), e);
            }
        }

        if (!allowDownload) {
            return null;
        }

        // 3. Download from network via optimized native connection
        return downloadAndCache(urlStr, key);
    }

    private byte[] downloadAndCache(String urlStr, String key) {
        HttpURLConnection conn = null;
        try {
            System.setProperty("java.net.preferIPv4Stack", "true");
            System.setProperty("java.net.preferIPv6Addresses", "false");

            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(3000);
            conn.setReadTimeout(3500);
            conn.setInstanceFollowRedirects(true);
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36 NotkaApp/2.5");
            conn.setRequestProperty("Accept", "image/webp,image/png,image/jpeg,image/*;q=0.9");
            conn.setRequestProperty("Accept-Encoding", "identity");
            conn.connect();

            int status = conn.getResponseCode();
            if (status >= 200 && status < 300) {
                InputStream is = conn.getInputStream();
                String enc = conn.getHeaderField("Content-Encoding");
                if ("gzip".equalsIgnoreCase(enc)) {
                    is = new java.util.zip.GZIPInputStream(is);
                }

                ByteArrayOutputStream bos = new ByteArrayOutputStream();
                byte[] buffer = new byte[8192];
                int read;
                while ((read = is.read(buffer)) != -1) {
                    bos.write(buffer, 0, read);
                }
                is.close();

                byte[] data = bos.toByteArray();
                if (data.length > 0) {
                    // Cache in memory
                    memoryCache.put(key, data);

                    // Cache to disk
                    File tempFile = new File(cacheDir, key + ".tmp");
                    File finalFile = new File(cacheDir, key);
                    try (FileOutputStream fos = new FileOutputStream(tempFile)) {
                        fos.write(data);
                    }
                    if (tempFile.exists()) {
                        tempFile.renameTo(finalFile);
                    }
                    return data;
                }
            } else {
                Log.w(TAG, "Cover fetch returned status: " + status + " for " + urlStr);
            }
        } catch (Exception e) {
            Log.w(TAG, "Cover download failed: " + e.getMessage() + " (" + urlStr + ")");
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
        return null;
    }

    public void prefetchAsync(String urlStr) {
        if (urlStr == null || urlStr.trim().isEmpty()) return;
        String key = hashKey(urlStr);
        if (memoryCache.get(key) != null) return;
        File file = new File(cacheDir, key);
        if (file.exists() && file.length() > 0) return;

        if (inFlightDownloads.putIfAbsent(key, Boolean.TRUE) == null) {
            prefetchPool.submit(() -> {
                try {
                    downloadAndCache(urlStr, key);
                } finally {
                    inFlightDownloads.remove(key);
                }
            });
        }
    }

    private static String hashKey(String url) {
        try {
            MessageDigest digest = MessageDigest.getInstance("MD5");
            byte[] hash = digest.digest(url.getBytes("UTF-8"));
            StringBuilder sb = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                sb.append(String.format("%02x", b & 0xff));
            }
            return sb.toString();
        } catch (Exception e) {
            return String.valueOf(url.hashCode());
        }
    }
}
