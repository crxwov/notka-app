using System;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace Notka.Desktop.Discord;

public sealed class DiscordRpcManager : IDisposable
{
    // Default Discord Application ID for Notka Rich Presence
    public const string DefaultClientId = "463097721130188830";

    private readonly string _configFilePath;
    private readonly SemaphoreSlim _lock = new(1, 1);

    private NamedPipeClientStream? _pipe;
    private bool _isEnabled = true;
    private string _clientId = DefaultClientId;
    private bool _isConnected;
    private bool _isDisposed;

    private string _lastTitle = "";
    private string _lastArtist = "";
    private string _lastAlbum = "";
    private string _lastArtwork = "";
    private bool _lastIsPlaying;
    private double _lastDuration;
    private double _lastPosition;

    public bool IsEnabled
    {
        get => _isEnabled;
        set
        {
            if (_isEnabled == value) return;
            _isEnabled = value;
            SaveConfig();
            if (!_isEnabled)
            {
                _ = ClearActivityAsync();
                Disconnect();
            }
            else
            {
                _ = UpdateActivityInternalAsync();
            }
        }
    }

    public string ClientId
    {
        get => _clientId;
        set
        {
            if (string.IsNullOrWhiteSpace(value) || _clientId == value) return;
            _clientId = value.Trim();
            SaveConfig();
            Disconnect();
            if (_isEnabled)
            {
                _ = UpdateActivityInternalAsync();
            }
        }
    }

    public DiscordRpcManager(string appDataDir)
    {
        _configFilePath = Path.Combine(appDataDir, "discord.json");
        LoadConfig();
    }

    private void LoadConfig()
    {
        try
        {
            string? envId = Environment.GetEnvironmentVariable("NOTKA_DISCORD_CLIENT_ID");
            if (!string.IsNullOrWhiteSpace(envId))
            {
                _clientId = envId.Trim();
            }

            if (File.Exists(_configFilePath))
            {
                string json = File.ReadAllText(_configFilePath);
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;
                if (root.TryGetProperty("enabled", out var enProp))
                {
                    _isEnabled = enProp.GetBoolean();
                }
                if (root.TryGetProperty("clientId", out var idProp) && !string.IsNullOrWhiteSpace(idProp.GetString()))
                {
                    string loadedId = idProp.GetString()!.Trim();
                    if (loadedId != "1348325497240326194")
                    {
                        _clientId = loadedId;
                    }
                    else
                    {
                        _clientId = DefaultClientId;
                    }
                }
            }
        }
        catch { /* fallback to defaults */ }
    }

    private void SaveConfig()
    {
        try
        {
            var config = new
            {
                enabled = _isEnabled,
                clientId = _clientId
            };
            string json = JsonSerializer.Serialize(config, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(_configFilePath, json);
        }
        catch { /* ignore */ }
    }

    public void UpdateTrack(string title, string artist, string album, string artwork, bool isPlaying, double duration, double position)
    {
        if (_isDisposed) return;

        _lastTitle = title;
        _lastArtist = artist;
        _lastAlbum = album;
        _lastArtwork = artwork;
        _lastIsPlaying = isPlaying;
        _lastDuration = duration;
        _lastPosition = position;

        if (!_isEnabled) return;

        _ = UpdateActivityInternalAsync();
    }

    public void UpdatePlaybackState(bool isPlaying)
    {
        if (_isDisposed) return;
        _lastIsPlaying = isPlaying;
        if (!_isEnabled) return;
        _ = UpdateActivityInternalAsync();
    }

    public void UpdateTimeline(double duration, double position)
    {
        if (_isDisposed) return;
        _lastDuration = duration;
        _lastPosition = position;
        if (!_isEnabled) return;
        // Don't flood on every sub-second timeline tick if already playing;
        // Discord manages time progress interpolation on client side
    }

    private async Task UpdateActivityInternalAsync()
    {
        if (!_isEnabled || _isDisposed) return;

        UI.MainForm.Log($"[DiscordRpc] UpdateActivityInternal: isPlaying={_lastIsPlaying}, title='{_lastTitle}', artist='{_lastArtist}'");

        if (!_lastIsPlaying || string.IsNullOrWhiteSpace(_lastTitle) || _lastTitle == "Notka")
        {
            await ClearActivityAsync();
            return;
        }

        try
        {
            await _lock.WaitAsync();
            try
            {
                if (!await EnsureConnectedAsync()) return;

                long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                long start = (long)Math.Max(0, now - _lastPosition);
                long end = _lastDuration > 0 ? (long)(start + _lastDuration) : 0;

                string displayArtist = string.IsNullOrWhiteSpace(_lastArtist) ? "Нотка" : _lastArtist;
                string displayTitle = _lastTitle;

                string artworkUrl = !string.IsNullOrWhiteSpace(_lastArtwork) && _lastArtwork.StartsWith("http", StringComparison.OrdinalIgnoreCase)
                    ? _lastArtwork
                    : "https://notka.duckdns.org/app/icons/icon-512.png";

                var timestampsObj = end > start
                    ? (object)new { start = start, end = end }
                    : (object)new { start = start };

                string stateText = string.IsNullOrWhiteSpace(_lastArtist)
                    ? "В Нотке"
                    : $"{displayArtist} в Нотке";

                var activity = new
                {
                    cmd = "SET_ACTIVITY",
                    args = new
                    {
                        pid = Process.GetCurrentProcess().Id,
                        activity = new
                        {
                            name = displayArtist,
                            type = 2, // 2 = Listening to: renders as "Слушает <displayArtist>"
                            details = displayTitle,
                            state = stateText,
                            timestamps = timestampsObj,
                            assets = new
                            {
                                large_image = artworkUrl,
                                small_image = "https://notka.duckdns.org/app/icons/icon-512.png",
                                small_text = "Нотка — Музыка для души"
                            },
                            buttons = new[]
                            {
                                new
                                {
                                    label = "Слушать в Нотке",
                                    url = "https://notka.duckdns.org/app/"
                                }
                            }
                        }
                    },
                    nonce = Guid.NewGuid().ToString("N")
                };

                await SendPayloadAsync(1, activity);
                try { await ReadPayloadAsync(); } catch { }
            }
            finally
            {
                _lock.Release();
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[DiscordRpc] Error updating activity: {ex.Message}");
            Disconnect();
        }
    }

    public async Task ClearActivityAsync()
    {
        if (_isDisposed) return;

        try
        {
            await _lock.WaitAsync();
            try
            {
                if (!_isConnected || _pipe == null || !_pipe.IsConnected) return;

                var payload = new
                {
                    cmd = "SET_ACTIVITY",
                    args = new
                    {
                        pid = Process.GetCurrentProcess().Id,
                        activity = (object?)null
                    },
                    nonce = Guid.NewGuid().ToString("N")
                };

                await SendPayloadAsync(1, payload);
                try { await ReadPayloadAsync(); } catch { }
            }
            finally
            {
                _lock.Release();
            }
        }
        catch
        {
            Disconnect();
        }
    }

    private async Task<bool> EnsureConnectedAsync()
    {
        if (_isConnected && _pipe != null && _pipe.IsConnected) return true;

        Disconnect();

        for (int i = 0; i < 10; i++)
        {
            try
            {
                var pipe = new NamedPipeClientStream(".", $"discord-ipc-{i}", PipeDirection.InOut, PipeOptions.Asynchronous);
                await pipe.ConnectAsync(250);

                _pipe = pipe;

                // Send Handshake
                var handshake = new { v = 1, client_id = _clientId };
                await SendPayloadAsync(0, handshake);

                // Read Handshake response
                var (op, json) = await ReadPayloadAsync();
                UI.MainForm.Log($"[DiscordRpc] discord-ipc-{i} handshake op={op} json={json}");
                if (op == 1) // DISPATCH READY
                {
                    _isConnected = true;
                    UI.MainForm.Log($"[DiscordRpc] Connected to pipe discord-ipc-{i} successfully");
                    return true;
                }
                else
                {
                    UI.MainForm.Log($"[DiscordRpc] Handshake rejected: {json}");
                    Disconnect();
                    return false;
                }
            }
            catch (Exception)
            {
                // Pipe not open or failed
                Disconnect();
            }
        }

        UI.MainForm.Log("[DiscordRpc] Could not connect to any discord-ipc-0..9 pipe");

        return false;
    }

    private async Task SendPayloadAsync(int opcode, object data)
    {
        if (_pipe == null || !_pipe.IsConnected) throw new IOException("Pipe not connected");

        byte[] jsonBytes = JsonSerializer.SerializeToUtf8Bytes(data);
        byte[] header = new byte[8];
        BitConverter.TryWriteBytes(header.AsSpan(0, 4), opcode);
        BitConverter.TryWriteBytes(header.AsSpan(4, 4), jsonBytes.Length);

        await _pipe.WriteAsync(header.AsMemory(0, 8));
        await _pipe.WriteAsync(jsonBytes.AsMemory());
        await _pipe.FlushAsync();
    }

    private async Task<(int Opcode, string Json)> ReadPayloadAsync(CancellationToken cancellationToken = default)
    {
        if (_pipe == null || !_pipe.IsConnected) throw new IOException("Pipe not connected");

        using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        cts.CancelAfter(3000);

        byte[] header = new byte[8];
        int read = await _pipe.ReadAsync(header.AsMemory(0, 8), cts.Token);
        if (read < 8) throw new EndOfStreamException();

        int op = BitConverter.ToInt32(header, 0);
        int length = BitConverter.ToInt32(header, 4);

        byte[] body = new byte[length];
        int totalRead = 0;
        while (totalRead < length)
        {
            int chunk = await _pipe.ReadAsync(body.AsMemory(totalRead, length - totalRead), cts.Token);
            if (chunk == 0) throw new EndOfStreamException();
            totalRead += chunk;
        }

        string json = Encoding.UTF8.GetString(body);
        return (op, json);
    }

    private void Disconnect()
    {
        _isConnected = false;
        try
        {
            _pipe?.Dispose();
        }
        catch { /* ignore */ }
        _pipe = null;
    }

    public void Dispose()
    {
        if (_isDisposed) return;
        _isDisposed = true;
        _ = ClearActivityAsync();
        Disconnect();
        _lock.Dispose();
    }
}
