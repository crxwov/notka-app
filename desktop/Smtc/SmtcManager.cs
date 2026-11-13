using System;
using Windows.Media;
using Windows.Storage.Streams;

namespace Notka.Desktop.Smtc;

public sealed class SmtcManager : IDisposable
{
    private readonly SystemMediaTransportControls? _smtc;
    private readonly SystemMediaTransportControlsTimelineProperties _timelineProperties = new();
    private readonly object _metadataUpdateLock = new();
    private bool _isDisposed;
    private int _metadataGeneration;

    private string _lastTitle = "";
    private string _lastArtist = "";
    private string _lastAlbum = "";
    private string _lastArtwork = "";

    public event Action<string>? MediaCommandReceived;

    public SmtcManager(IntPtr hwnd)
    {
        try
        {
            _smtc = SmtcInterop.GetForWindow(hwnd);
            if (_smtc != null)
            {
                _smtc.IsEnabled = true;
                _smtc.IsPlayEnabled = true;
                _smtc.IsPauseEnabled = true;
                _smtc.IsNextEnabled = true;
                _smtc.IsPreviousEnabled = true;
                _smtc.IsStopEnabled = true;
                _smtc.PlaybackStatus = MediaPlaybackStatus.Closed;

                _smtc.ButtonPressed += OnSmtcButtonPressed;
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[SMTC] Failed to initialize: {ex}");
        }
    }

    public bool IsAvailable => _smtc != null;

    private void OnSmtcButtonPressed(SystemMediaTransportControls sender, SystemMediaTransportControlsButtonPressedEventArgs args)
    {
        string? action = args.Button switch
        {
            SystemMediaTransportControlsButton.Play => "play",
            SystemMediaTransportControlsButton.Pause => "pause",
            SystemMediaTransportControlsButton.Next => "next",
            SystemMediaTransportControlsButton.Previous => "prev",
            SystemMediaTransportControlsButton.Stop => "stop",
            _ => null
        };

        if (action != null)
        {
            MediaCommandReceived?.Invoke(action);
        }
    }

    public void UpdateMetadata(string title, string artist, string album, string? artworkUrl, string? localThumbnailPath = null)
    {
        if (_smtc == null) return;

        title = string.IsNullOrWhiteSpace(title) ? "Notka" : title;
        artist = artist ?? string.Empty;
        album = album ?? string.Empty;
        artworkUrl = artworkUrl ?? string.Empty;

        if (title == _lastTitle && artist == _lastArtist && album == _lastAlbum && artworkUrl == _lastArtwork)
        {
            return;
        }

        _lastTitle = title;
        _lastArtist = artist;
        _lastAlbum = album;
        _lastArtwork = artworkUrl;
        int generation = System.Threading.Interlocked.Increment(ref _metadataGeneration);

        _ = System.Threading.Tasks.Task.Run(async () =>
        {
            try
            {
                RandomAccessStreamReference? thumbnail = null;

                if (!string.IsNullOrWhiteSpace(localThumbnailPath) && System.IO.File.Exists(localThumbnailPath))
                {
                    try
                    {
                        var storageFile = await Windows.Storage.StorageFile.GetFileFromPathAsync(localThumbnailPath);
                        thumbnail = RandomAccessStreamReference.CreateFromFile(storageFile);
                    }
                    catch { }
                }
                if (thumbnail == null && !string.IsNullOrWhiteSpace(artworkUrl) &&
                    (artworkUrl.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
                     artworkUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase)))
                {
                    try
                    {
                        thumbnail = RandomAccessStreamReference.CreateFromUri(new Uri(artworkUrl));
                    }
                    catch { }
                }

                lock (_metadataUpdateLock)
                {
                    if (_isDisposed || generation != System.Threading.Volatile.Read(ref _metadataGeneration)) return;

                    var updater = _smtc.DisplayUpdater;
                    updater.Type = MediaPlaybackType.Music;
                    updater.MusicProperties.Title = title;
                    updater.MusicProperties.Artist = artist;
                    updater.MusicProperties.AlbumTitle = album;
                    updater.Thumbnail = thumbnail;
                    updater.Update();
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[SMTC] UpdateMetadata failed: {ex.Message}");
            }
        });
    }

    public void UpdatePlaybackStatus(bool isPlaying)
    {
        if (_smtc == null) return;

        try
        {
            _smtc.PlaybackStatus = isPlaying ? MediaPlaybackStatus.Playing : MediaPlaybackStatus.Paused;
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[SMTC] UpdatePlaybackStatus failed: {ex.Message}");
        }
    }

    public void UpdateTimeline(double durationSeconds, double positionSeconds)
    {
        if (_smtc == null || durationSeconds <= 0) return;

        try
        {
            _timelineProperties.StartTime = TimeSpan.Zero;
            _timelineProperties.MinSeekTime = TimeSpan.Zero;
            _timelineProperties.EndTime = TimeSpan.FromSeconds(durationSeconds);
            _timelineProperties.MaxSeekTime = TimeSpan.FromSeconds(durationSeconds);
            _timelineProperties.Position = TimeSpan.FromSeconds(Math.Min(positionSeconds, durationSeconds));

            _smtc.UpdateTimelineProperties(_timelineProperties);
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[SMTC] UpdateTimeline failed: {ex.Message}");
        }
    }

    public void Dispose()
    {
        if (_isDisposed) return;
        _isDisposed = true;
        System.Threading.Interlocked.Increment(ref _metadataGeneration);

        if (_smtc != null)
        {
            try
            {
                _smtc.ButtonPressed -= OnSmtcButtonPressed;
                _smtc.PlaybackStatus = MediaPlaybackStatus.Closed;
                _smtc.IsEnabled = false;
            }
            catch { /* ignore */ }
        }
    }
}
