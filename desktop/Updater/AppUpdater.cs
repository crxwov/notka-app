using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace Notka.Desktop.Updater;

public sealed record UpdateInfo(
    string Version,
    string CurrentVersion,
    string Changelog,
    string DownloadUrl,
    string Sha256,
    long SizeBytes
);

public sealed record UpdateProgress(
    string Phase,
    int Percent,
    long LoadedBytes,
    long TotalBytes,
    string? Text = null,
    string? Error = null
);

/// <summary>
/// Self-hosted auto-updater for Notka Desktop.
/// Checks https://notka.duckdns.org/app/version.json on every startup,
/// downloads Notka-Setup.msi directly from the Notka server with SHA-256 verification,
/// and hands off cleanly to msiexec after the running app exits.
/// </summary>
public sealed class AppUpdater : IDisposable
{
    public const string PrimaryVersionUrl = "https://notka.duckdns.org/app/version.json";
    public const string TrustedHost = "notka.duckdns.org";

    private readonly string _updatesDir;
    private readonly string _currentVersion;
    private readonly HttpClient _http;
    private readonly bool _ownsClient;

    public AppUpdater(string appDataDir, string currentVersion, HttpMessageHandler? handler = null)
    {
        _updatesDir = Path.Combine(appDataDir, "updates");
        _currentVersion = NormalizeVersion(currentVersion);
        _http = handler != null ? new HttpClient(handler, disposeHandler: false) : new HttpClient();
        _ownsClient = true;
        _http.Timeout = TimeSpan.FromMinutes(10);
        _http.DefaultRequestHeaders.UserAgent.ParseAdd($"NotkaDesktop/{_currentVersion}");
        _http.DefaultRequestHeaders.AcceptEncoding.Clear();
        _http.DefaultRequestHeaders.AcceptEncoding.Add(new StringWithQualityHeaderValue("identity"));
    }

    public string CurrentVersion => _currentVersion;

    public async Task<UpdateInfo?> CheckForUpdatesAsync(CancellationToken ct = default)
    {
        using var reqCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        reqCts.CancelAfter(TimeSpan.FromSeconds(8));

        string url = $"{PrimaryVersionUrl}?t={DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}";
        using var req = new HttpRequestMessage(HttpMethod.Get, url);
        req.Headers.CacheControl = new CacheControlHeaderValue { NoCache = true, NoStore = true };

        using var resp = await _http.SendAsync(req, HttpCompletionOption.ResponseContentRead, reqCts.Token);
        if (!resp.IsSuccessStatusCode) return null;

        string json = await resp.Content.ReadAsStringAsync(reqCts.Token);
        var info = ParseWindowsManifest(json, _currentVersion);
        if (info == null)
        {
            CleanupStaleUpdates();
            return null;
        }
        return info;
    }

    public static UpdateInfo? ParseWindowsManifest(string json, string currentVersion)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (!root.TryGetProperty("windows", out var win) || win.ValueKind != JsonValueKind.Object)
            {
                return null;
            }

            string latest = win.TryGetProperty("version", out var vp) ? (vp.GetString() ?? "").Trim() : "";
            string downloadUrl = win.TryGetProperty("downloadUrl", out var dp) ? (dp.GetString() ?? "").Trim() : "";
            string changelog = win.TryGetProperty("changelog", out var cp)
                ? (cp.GetString() ?? "").Trim()
                : "Улучшения стабильности и исправления ошибок.";
            string sha256 = win.TryGetProperty("sha256", out var sp) ? (sp.GetString() ?? "").Trim() : "";
            long sizeBytes = win.TryGetProperty("size", out var sz) && sz.TryGetInt64(out var parsedSz) ? parsedSz : 0;

            if (string.IsNullOrEmpty(latest) || !IsTrustedServerUrl(downloadUrl))
            {
                return null;
            }

            string normCurrent = NormalizeVersion(currentVersion);
            if (!IsNewerVersion(latest, normCurrent))
            {
                return null;
            }

            return new UpdateInfo(latest, normCurrent, changelog, downloadUrl, sha256, sizeBytes);
        }
        catch
        {
            return null;
        }
    }

    public async Task<string> DownloadUpdateAsync(
        UpdateInfo info,
        Action<UpdateProgress>? onProgress,
        CancellationToken ct = default)
    {
        if (!IsTrustedServerUrl(info.DownloadUrl))
        {
            throw new InvalidOperationException("Недоверенный адрес обновления");
        }

        Directory.CreateDirectory(_updatesDir);
        string safeVer = Regex.Replace(info.Version, "[^0-9.]", "");
        if (string.IsNullOrEmpty(safeVer)) safeVer = "latest";
        string targetPath = Path.Combine(_updatesDir, $"Notka-Setup-{safeVer}.msi");
        string partPath = targetPath + ".part";

        // Reuse already-verified MSI if present on disk
        if (File.Exists(targetPath) && !string.IsNullOrEmpty(info.Sha256))
        {
            string existingHash = ComputeFileSha256(targetPath);
            if (string.Equals(existingHash, info.Sha256, StringComparison.OrdinalIgnoreCase))
            {
                long len = new FileInfo(targetPath).Length;
                onProgress?.Invoke(new UpdateProgress("installing", 100, len, len, "Запуск установки…"));
                return targetPath;
            }
        }

        onProgress?.Invoke(new UpdateProgress("downloading", 0, 0, info.SizeBytes, "Подключение к серверу…"));

        try
        {
            if (File.Exists(partPath)) File.Delete(partPath);

            string sep = info.DownloadUrl.Contains('?') ? "&" : "?";
            string dlUrl = $"{info.DownloadUrl}{sep}t={DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}";

            using var req = new HttpRequestMessage(HttpMethod.Get, dlUrl);
            req.Headers.CacheControl = new CacheControlHeaderValue { NoCache = true };

            using var resp = await _http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct);
            if (!resp.IsSuccessStatusCode)
            {
                throw new InvalidOperationException($"Сервер вернул HTTP {(int)resp.StatusCode}");
            }

            long total = resp.Content.Headers.ContentLength ?? info.SizeBytes;
            long loaded = 0;
            var sw = Stopwatch.StartNew();
            long lastReportMs = -200;

            using var hasher = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
            await using (var netStream = await resp.Content.ReadAsStreamAsync(ct))
            await using (var fs = new FileStream(partPath, FileMode.Create, FileAccess.Write, FileShare.None, 65536, useAsync: true))
            {
                byte[] buffer = new byte[65536];
                int read;
                while ((read = await netStream.ReadAsync(buffer, ct)) > 0)
                {
                    await fs.WriteAsync(buffer.AsMemory(0, read), ct);
                    hasher.AppendData(buffer, 0, read);
                    loaded += read;

                    long nowMs = sw.ElapsedMilliseconds;
                    if (nowMs - lastReportMs >= 100 || (total > 0 && loaded >= total))
                    {
                        lastReportMs = nowMs;
                        int pct = total > 0 ? (int)Math.Min(100, (loaded * 100L) / total) : -1;
                        string label = pct >= 0 ? $"Загрузка… {pct}%" : "Загрузка…";
                        onProgress?.Invoke(new UpdateProgress("downloading", pct, loaded, total, label));
                    }
                }
                await fs.FlushAsync(ct);
            }

            if (loaded < 1024)
            {
                throw new InvalidOperationException("Файл обновления повреждён");
            }

            onProgress?.Invoke(new UpdateProgress("verifying", 100, loaded, loaded, "Проверка целостности…"));

            if (!string.IsNullOrEmpty(info.Sha256))
            {
                string actualHash = Convert.ToHexString(hasher.GetHashAndReset());
                if (!string.Equals(actualHash, info.Sha256, StringComparison.OrdinalIgnoreCase))
                {
                    throw new InvalidOperationException("Ошибка проверки SHA-256");
                }
            }

            File.Move(partPath, targetPath, overwrite: true);
            onProgress?.Invoke(new UpdateProgress("installing", 100, loaded, loaded, "Запуск установки…"));
            return targetPath;
        }
        catch
        {
            try { if (File.Exists(partPath)) File.Delete(partPath); } catch { }
            throw;
        }
    }

    public static void LaunchMsiUpgradeDetached(string msiPath, int currentPid)
    {
        string installedExe = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            "Notka",
            "Notka.exe"
        );
        string fallbackExe = Environment.ProcessPath ?? installedExe;

        // Escape single quotes for PowerShell single-quoted string literals
        string psMsi = msiPath.Replace("'", "''");
        string psInstalled = installedExe.Replace("'", "''");
        string psFallback = fallbackExe.Replace("'", "''");

        string script =
            $"$pidToWait = {currentPid}; " +
            "for ($i = 0; $i -lt 40; $i++) { if (-not (Get-Process -Id $pidToWait -ErrorAction SilentlyContinue)) { break }; Start-Sleep -Milliseconds 250 }; " +
            $"$p = Start-Process -FilePath 'msiexec.exe' -ArgumentList @('/i', '{psMsi}', '/qb') -Wait -PassThru; " +
            "if ($p -and ($p.ExitCode -eq 0 -or $p.ExitCode -eq 3010)) { " +
            $"  $exe = if (Test-Path '{psInstalled}') {{ '{psInstalled}' }} else {{ '{psFallback}' }}; " +
            "  if (Test-Path $exe) { Start-Process -FilePath $exe }; " +
            "}";

        string encoded = Convert.ToBase64String(Encoding.Unicode.GetBytes(script));
        Process.Start(new ProcessStartInfo
        {
            FileName = "powershell.exe",
            Arguments = $"-NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand {encoded}",
            UseShellExecute = false,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden
        });
    }

    public static bool IsTrustedServerUrl(string? url)
    {
        if (string.IsNullOrWhiteSpace(url)) return false;
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)) return false;
        return string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase)
            && string.Equals(uri.Host, TrustedHost, StringComparison.OrdinalIgnoreCase);
    }

    public static string NormalizeVersion(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return "0.0.0";
        int metaIdx = raw.IndexOfAny(['+', '-']);
        string core = metaIdx >= 0 ? raw[..metaIdx] : raw;
        string cleaned = Regex.Replace(core, "[^0-9.]", "");
        return string.IsNullOrEmpty(cleaned) ? "0.0.0" : cleaned;
    }

    public static bool IsNewerVersion(string? latest, string? current)
    {
        string lNorm = NormalizeVersion(latest);
        string cNorm = NormalizeVersion(current);
        var lParts = lNorm.Split('.', StringSplitOptions.RemoveEmptyEntries);
        var cParts = cNorm.Split('.', StringSplitOptions.RemoveEmptyEntries);
        int maxLen = Math.Max(lParts.Length, cParts.Length);
        for (int i = 0; i < maxLen; i++)
        {
            int l = i < lParts.Length && int.TryParse(lParts[i], out var lv) ? lv : 0;
            int c = i < cParts.Length && int.TryParse(cParts[i], out var cv) ? cv : 0;
            if (l > c) return true;
            if (l < c) return false;
        }
        return false;
    }

    private static string ComputeFileSha256(string path)
    {
        using var fs = File.OpenRead(path);
        return Convert.ToHexString(SHA256.HashData(fs));
    }

    private void CleanupStaleUpdates()
    {
        try
        {
            if (!Directory.Exists(_updatesDir)) return;
            foreach (var file in Directory.EnumerateFiles(_updatesDir))
            {
                try { File.Delete(file); } catch { }
            }
        }
        catch { }
    }

    public void Dispose()
    {
        if (_ownsClient) _http.Dispose();
    }
}
