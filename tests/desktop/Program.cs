using Notka.Desktop.UI;
using Notka.Desktop.Updater;
using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;

var tempDir = Path.Combine(Path.GetTempPath(), "notka-cover-cache-test-" + Guid.NewGuid().ToString("N"));
try
{
    const int concurrentCalls = 8;
    var handler = new CountingHandler(concurrentCalls);
    using var cache = new CoverCache(tempDir, handler);
    Require(cache.IsCoverUrl("https://notka.duckdns.org/img?u=https%3A%2F%2Fyt3.googleusercontent.com%2Fcover.jpg"), "Notka artwork proxy");
    Require(cache.IsCoverUrl("https://i.ytimg.com/vi/test/hqdefault.jpg"), "YouTube artwork CDN");
    Require(!cache.IsCoverUrl("https://ytimg.com.evil.example/cover.jpg"), "lookalike CDN host");
    Require(!cache.IsCoverUrl("http://127.0.0.1/artwork?url=https%3A%2F%2Fytimg.com%2Fx"), "local HTTP endpoint");
    Require(!cache.IsCoverUrl("file:///C:/artwork/cover.jpg"), "non-HTTP scheme");
    Require(await cache.GetCoverAsync("https://ytimg.com.evil.example/cover.jpg") is null, "lookalike cover must not be fetched");
    Require(handler.RequestCount == 0, "invalid cover URL must not reach the network");

    const string imageUrl = "https://i.ytimg.com/vi/test/hqdefault.jpg";
    var tasks = Enumerable.Range(0, concurrentCalls)
        .Select(_ => Task.Factory.StartNew(
            () => cache.GetCoverAsync(imageUrl),
            CancellationToken.None,
            TaskCreationOptions.LongRunning,
            TaskScheduler.Default).Unwrap())
        .ToArray();
    var results = await Task.WhenAll(tasks);
    Require(handler.RequestCount == 1, $"concurrent identical covers should fetch once, got {handler.RequestCount}");
    Require(results.All(data => data is { Length: 4 }), "all concurrent callers should receive the image");
    Console.WriteLine("CoverCache URL checks passed.");

    // AppUpdater unit & E2E download/SHA-256 verification tests
    Require(AppUpdater.IsNewerVersion("1.4.0", "1.3.0+9a1fd56b"), "1.4.0 > 1.3.0+hash");
    Require(AppUpdater.IsNewerVersion("1.10.0", "1.9.9"), "1.10.0 > 1.9.9");
    Require(!AppUpdater.IsNewerVersion("1.4.0", "1.4.0+abc123"), "same version must not prompt");
    Require(!AppUpdater.IsNewerVersion("1.3.9", "1.4.0"), "downgrade must not prompt");
    Require(AppUpdater.IsTrustedServerUrl("https://notka.duckdns.org/app/releases/Notka-Setup.msi"), "trusted server MSI");
    Require(!AppUpdater.IsTrustedServerUrl("https://github.com/crxwov/notka-app/releases/download/v1.4.0/Notka-Setup.msi"), "GitHub rejected");
    Require(!AppUpdater.IsTrustedServerUrl("http://notka.duckdns.org/app/releases/Notka-Setup.msi"), "HTTP rejected");
    Require(!AppUpdater.IsTrustedServerUrl("https://notka.duckdns.org.evil.example/Notka-Setup.msi"), "lookalike rejected");

    byte[] fakeMsi = new byte[4096];
    Random.Shared.NextBytes(fakeMsi);
    string expectedSha = Convert.ToHexString(SHA256.HashData(fakeMsi)).ToLowerInvariant();
    string manifestJson = $$"""
    {
      "versionCode": 32,
      "versionName": "2.6.0",
      "downloadUrl": "https://notka.duckdns.org/app/releases/notka.apk",
      "windows": {
        "version": "1.4.0",
        "changelog": "• Автообновление с сервера Нотки",
        "downloadUrl": "https://notka.duckdns.org/app/releases/Notka-Setup.msi",
        "sha256": "{{expectedSha}}",
        "size": {{fakeMsi.Length}}
      }
    }
    """;

    var updHandler = new MockUpdaterHandler(manifestJson, fakeMsi);
    using var updater = new AppUpdater(tempDir, "1.3.0+commit", updHandler);
    var updateInfo = await updater.CheckForUpdatesAsync();
    Require(updateInfo is not null, "update should be detected for 1.3.0 -> 1.4.0");
    Require(updateInfo!.Version == "1.4.0", "parsed version 1.4.0");

    var phases = new List<string>();
    string msiPath = await updater.DownloadUpdateAsync(updateInfo, p => phases.Add(p.Phase));
    Require(File.Exists(msiPath), "downloaded MSI file exists");
    Require(phases.Contains("downloading") && phases.Contains("verifying") && phases.Contains("installing"), "progress phases emitted");

    // Verify already-cached valid MSI is reused without another network download
    int dlBefore = updHandler.DownloadCount;
    string cachedPath = await updater.DownloadUpdateAsync(updateInfo, null);
    Require(cachedPath == msiPath && updHandler.DownloadCount == dlBefore, "verified MSI reused from cache");

    // Verify SHA-256 mismatch rejects corrupted payload
    var badInfo = updateInfo with { Version = "1.4.1", Sha256 = new string('0', 64) };
    bool threwHashError = false;
    try { await updater.DownloadUpdateAsync(badInfo, null); }
    catch (InvalidOperationException ex) when (ex.Message.Contains("SHA-256")) { threwHashError = true; }
    Require(threwHashError, "corrupted MSI rejected on SHA-256 mismatch");

    // Verify up-to-date client gets null
    using var upToDate = new AppUpdater(tempDir, "1.4.0+commit", updHandler);
    Require(await upToDate.CheckForUpdatesAsync() is null, "1.4.0 client sees no update");

    Console.WriteLine("AppUpdater checks passed.");
}
finally
{
    if (Directory.Exists(tempDir)) Directory.Delete(tempDir, true);
}

static void Require(bool condition, string name)
{
    if (!condition) throw new InvalidOperationException($"Unexpected cover URL decision: {name}");
}

sealed class CountingHandler : HttpMessageHandler
{
    private readonly CountdownEvent _arrived;
    private int _requestCount;
    public int RequestCount => Volatile.Read(ref _requestCount);

    public CountingHandler(int concurrentCalls) => _arrived = new CountdownEvent(concurrentCalls);

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        Interlocked.Increment(ref _requestCount);
        _arrived.Signal();
        _arrived.Wait(TimeSpan.FromMilliseconds(500), cancellationToken);
        await Task.Delay(20, cancellationToken);
        return new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new ByteArrayContent([0xFF, 0xD8, 0, 0])
        };
    }
}

sealed class MockUpdaterHandler : HttpMessageHandler
{
    private readonly string _manifest;
    private readonly byte[] _msiBytes;
    public int DownloadCount { get; private set; }

    public MockUpdaterHandler(string manifest, byte[] msiBytes)
    {
        _manifest = manifest;
        _msiBytes = msiBytes;
    }

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        string url = request.RequestUri?.ToString() ?? "";
        if (url.Contains("/app/version.json", StringComparison.OrdinalIgnoreCase))
        {
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(_manifest, Encoding.UTF8, "application/json")
            });
        }
        if (url.Contains("/app/releases/Notka-Setup.msi", StringComparison.OrdinalIgnoreCase))
        {
            DownloadCount++;
            var content = new ByteArrayContent(_msiBytes);
            content.Headers.ContentLength = _msiBytes.Length;
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = content });
        }
        return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound));
    }
}
