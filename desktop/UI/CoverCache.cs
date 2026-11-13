using System;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace Notka.Desktop.UI;

public sealed class CoverCache : IDisposable
{
    private const string TAG = "[CoverCache]";
    private const int MaxMemoryCacheBytes = 48 * 1024 * 1024; // 48 MB RAM cache
    private static readonly string[] ArtworkHosts =
    [
        "googleusercontent.com", "ytimg.com", "ggpht.com", "mzstatic.com", "dzcdn.net", "sndcdn.com"
    ];

    private readonly string _cacheDir;
    private readonly ConcurrentDictionary<string, byte[]> _memoryCache = new();
    private readonly ConcurrentDictionary<string, Lazy<Task<byte[]?>>> _inFlight = new();
    private readonly HttpClient _httpClient;
    private long _currentMemoryBytes;
    private bool _isDisposed;

    public CoverCache(string appDataDir) : this(appDataDir, new SocketsHttpHandler
    {
        PooledConnectionLifetime = TimeSpan.FromMinutes(5),
        PooledConnectionIdleTimeout = TimeSpan.FromMinutes(2),
        AutomaticDecompression = DecompressionMethods.All,
        ConnectTimeout = TimeSpan.FromSeconds(3)
    })
    {
    }

    internal CoverCache(string appDataDir, HttpMessageHandler handler)
    {
        _cacheDir = Path.Combine(appDataDir, "cache", "covers");
        try
        {
            Directory.CreateDirectory(_cacheDir);
        }
        catch { }

        _httpClient = new HttpClient(handler)
        {
            Timeout = TimeSpan.FromSeconds(6)
        };
        _httpClient.DefaultRequestHeaders.UserAgent.ParseAdd(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 NotkaDesktop/1.3"
        );
        _httpClient.DefaultRequestHeaders.Accept.ParseAdd(
            "image/webp,image/png,image/jpeg,image/*;q=0.9"
        );
    }

    public static string DetectContentType(byte[] data)
    {
        if (data == null || data.Length < 4) return "image/jpeg";
        if (data[0] == 0xFF && data[1] == 0xD8) return "image/jpeg";
        if (data[0] == 0x89 && data[1] == 0x50 && data[2] == 0x4E && data[3] == 0x47) return "image/png";
        if (data.Length >= 12 && data[0] == 0x52 && data[1] == 0x49 && data[2] == 0x46 && data[3] == 0x46 &&
            data[8] == 0x57 && data[9] == 0x45 && data[10] == 0x42 && data[11] == 0x50)
            return "image/webp";
        if (data[0] == 0x47 && data[1] == 0x49 && data[2] == 0x46) return "image/gif";
        return "image/jpeg";
    }

    public bool IsCoverUrl(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) ||
            uri.Scheme != Uri.UriSchemeHttps || !uri.IsDefaultPort || !string.IsNullOrEmpty(uri.UserInfo))
        {
            return false;
        }

        string host = uri.IdnHost;
        if (host.Equals("notka.duckdns.org", StringComparison.OrdinalIgnoreCase))
        {
            return (uri.AbsolutePath.EndsWith("/img", StringComparison.OrdinalIgnoreCase) && uri.Query.Contains("u=", StringComparison.OrdinalIgnoreCase)) ||
                   (uri.AbsolutePath.EndsWith("/artwork", StringComparison.OrdinalIgnoreCase) && uri.Query.Contains("url=", StringComparison.OrdinalIgnoreCase));
        }

        return ArtworkHosts.Any(domain =>
            host.Equals(domain, StringComparison.OrdinalIgnoreCase) ||
            host.EndsWith("." + domain, StringComparison.OrdinalIgnoreCase));
    }

    public static string ExtractTargetUrl(string urlStr)
    {
        if (string.IsNullOrWhiteSpace(urlStr)) return string.Empty;
        try
        {
            if (urlStr.Contains("/img?u="))
            {
                int idx = urlStr.IndexOf("/img?u=");
                string param = urlStr.Substring(idx + 7);
                int amp = param.IndexOf('&');
                if (amp != -1) param = param.Substring(0, amp);
                return Uri.UnescapeDataString(param);
            }
            if (urlStr.Contains("/artwork?url="))
            {
                int idx = urlStr.IndexOf("/artwork?url=");
                string param = urlStr.Substring(idx + 13);
                int amp = param.IndexOf('&');
                if (amp != -1) param = param.Substring(0, amp);
                return Uri.UnescapeDataString(param);
            }
        }
        catch { }
        return urlStr;
    }

    public static string ToFetchableUrl(string urlStr)
    {
        if (string.IsNullOrWhiteSpace(urlStr)) return string.Empty;
        string lower = urlStr.ToLowerInvariant();

        if (urlStr.Contains("/img?u="))
        {
            return urlStr;
        }

        if (urlStr.Contains("/artwork?url="))
        {
            int idx = urlStr.IndexOf("/artwork?url=");
            string param = urlStr.Substring(idx + 13);
            int amp = param.IndexOf('&');
            if (amp != -1) param = param.Substring(0, amp);
            try
            {
                string decoded = Uri.UnescapeDataString(param);
                return "https://notka.duckdns.org/img?u=" + Uri.EscapeDataString(decoded);
            }
            catch
            {
                return urlStr;
            }
        }

        // In Russia, YouTube/Googleusercontent CDN IPs are blocked by DPI; route through server proxy
        if (lower.Contains("googleusercontent.com") || lower.Contains("ytimg.com") || lower.Contains("ggpht.com"))
        {
            try
            {
                return "https://notka.duckdns.org/img?u=" + Uri.EscapeDataString(urlStr);
            }
            catch
            {
                return urlStr;
            }
        }

        return urlStr;
    }

    public string? GetDiskCachePath(string rawUrl)
    {
        if (!IsCoverUrl(rawUrl)) return null;
        string canonical = ExtractTargetUrl(rawUrl);
        if (string.IsNullOrWhiteSpace(canonical)) canonical = rawUrl;
        string key = HashKey(canonical);
        string path = Path.Combine(_cacheDir, key);
        return File.Exists(path) ? path : null;
    }

    public async Task<byte[]?> GetCoverAsync(string rawUrl)
    {
        if (!IsCoverUrl(rawUrl)) return null;

        string canonical = ExtractTargetUrl(rawUrl);
        if (string.IsNullOrWhiteSpace(canonical)) canonical = rawUrl;
        string key = HashKey(canonical);

        // 1. In-memory cache hit (0ms)
        if (_memoryCache.TryGetValue(key, out var memBytes) && memBytes != null)
        {
            return memBytes;
        }

        // 2. Disk cache hit (1-2ms)
        string diskPath = Path.Combine(_cacheDir, key);
        if (File.Exists(diskPath))
        {
            try
            {
                byte[] diskBytes = await File.ReadAllBytesAsync(diskPath);
                if (diskBytes.Length > 0)
                {
                    PutMemoryCache(key, diskBytes);
                    return diskBytes;
                }
            }
            catch { }
        }

        // 3. Network fetch (with in-flight deduplication)
        var pending = _inFlight.GetOrAdd(key, _ => new Lazy<Task<byte[]?>>(
            () => DownloadAndCacheAsync(rawUrl, key, diskPath)));
        return await pending.Value;
    }

    private async Task<byte[]?> DownloadAndCacheAsync(string rawUrl, string key, string diskPath)
    {
        try
        {
            string fetchUrl = ToFetchableUrl(rawUrl);
            using var response = await _httpClient.GetAsync(fetchUrl, HttpCompletionOption.ResponseHeadersRead);
            if (response.IsSuccessStatusCode)
            {
                byte[] data = await response.Content.ReadAsByteArrayAsync();
                if (data.Length > 0)
                {
                    PutMemoryCache(key, data);
                    try
                    {
                        string tempFile = Path.Combine(_cacheDir, key + ".tmp");
                        await File.WriteAllBytesAsync(tempFile, data);
                        File.Move(tempFile, diskPath, true);
                    }
                    catch { }
                    return data;
                }
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"{TAG} Download failed for {rawUrl}: {ex.Message}");
        }
        finally
        {
            _inFlight.TryRemove(key, out var _);
        }
        return null;
    }

    public void Prefetch(string rawUrl)
    {
        if (string.IsNullOrWhiteSpace(rawUrl)) return;
        _ = Task.Run(async () =>
        {
            try
            {
                await GetCoverAsync(rawUrl);
            }
            catch { }
        });
    }

    private void PutMemoryCache(string key, byte[] bytes)
    {
        if (bytes == null || bytes.Length == 0) return;
        _memoryCache[key] = bytes;
        Interlocked.Add(ref _currentMemoryBytes, bytes.Length);

        // Trim memory if exceeded
        if (Interlocked.Read(ref _currentMemoryBytes) > MaxMemoryCacheBytes)
        {
            ThreadPool.QueueUserWorkItem(_ =>
            {
                try
                {
                    while (Interlocked.Read(ref _currentMemoryBytes) > MaxMemoryCacheBytes * 0.75 && !_memoryCache.IsEmpty)
                    {
                        foreach (var k in _memoryCache.Keys)
                        {
                            if (_memoryCache.TryRemove(k, out var removed))
                            {
                                Interlocked.Add(ref _currentMemoryBytes, -removed.Length);
                                break;
                            }
                        }
                    }
                }
                catch { }
            });
        }
    }

    private static string HashKey(string input)
    {
        using var md5 = MD5.Create();
        byte[] hash = md5.ComputeHash(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    public void Dispose()
    {
        if (_isDisposed) return;
        _isDisposed = true;
        _httpClient.Dispose();
        _memoryCache.Clear();
    }
}
