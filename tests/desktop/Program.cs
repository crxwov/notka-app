using Notka.Desktop.UI;
using System.Net;
using System.Net.Http;

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
