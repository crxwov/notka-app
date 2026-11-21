using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Notka.Desktop.Discord;
using Notka.Desktop.Smtc;
using Notka.Desktop.Tray;
using Notka.Desktop.Updater;

namespace Notka.Desktop.UI;

public sealed class MainForm : Form
{
    private const int DWMWA_USE_IMMERSIVE_DARK_MODE = 20;
    private const int WM_SETICON = 0x80;
    private const int ICON_SMALL = 0;
    private const int ICON_BIG = 1;

    [DllImport("dwmapi.dll", PreserveSig = true)]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);

    [DllImport("kernel32.dll", EntryPoint = "SetProcessWorkingSetSize", ExactSpelling = true, CharSet = CharSet.Ansi, SetLastError = true)]
    private static extern int SetProcessWorkingSetSize(IntPtr process, int minimumWorkingSetSize, int maximumWorkingSetSize);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    private static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);

    private readonly WebView2 _webView;
    private readonly SmtcManager _smtc;
    private readonly TrayIconManager _tray;
    private readonly DiscordRpcManager _discordRpc;
    private readonly CoverCache _coverCache;
    private readonly AppUpdater _updater;
    private readonly string _startUrl;
    private readonly string _settingsFilePath;
    private readonly string _authFilePath;
    private readonly string _sessionFilePath;
    private readonly string _appDataDir;

    private bool _isExiting;
    private bool _balloonShown;
    private bool _initialUpdateChecked;
    private bool _updateDownloading;
    private UpdateInfo? _pendingUpdate;
    private CancellationTokenSource? _updateDownloadCts;
    private string _currentTitle = "Notka";
    private string _currentArtist = "";
    private string _currentAlbum = "";
    private string _currentArtwork = "";
    private double _currentDuration;
    private double _currentPosition;
    private bool _isPlaying;

    public MainForm(string? startUrl = null)
    {
        // Window appearance
        Text = "Notka";
        Icon = LoadApplicationIcon();
        BackColor = Color.FromArgb(19, 8, 15);
        ForeColor = Color.White;
        StartPosition = FormStartPosition.CenterScreen;
        Size = new Size(1060, 740);
        MinimumSize = new Size(420, 580);
        DoubleBuffered = true;

        EnableDarkTitleBar();

        _startUrl = !string.IsNullOrWhiteSpace(startUrl)
            ? startUrl.Replace("notka.duckdns.org", "notka.site", StringComparison.OrdinalIgnoreCase)
            : "https://notka.site/app/?source=desktop";

        _appDataDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Notka"
        );
        Directory.CreateDirectory(_appDataDir);
        _coverCache = new CoverCache(_appDataDir);
        _updater = new AppUpdater(_appDataDir, AppUpdater.NormalizeVersion(Application.ProductVersion));
        _settingsFilePath = Path.Combine(_appDataDir, "window-settings.json");
        _authFilePath = Path.Combine(_appDataDir, "auth.json");
        _sessionFilePath = Path.Combine(_appDataDir, "session.json");

        Log($"=== Notka Desktop v{Application.ProductVersion} (PID {Process.GetCurrentProcess().Id}) Started ===");
        Log($"AppDataDir: {_appDataDir}");

        RestoreWindowSettings();

        // SMTC manager
        _smtc = new SmtcManager(Handle);
        _smtc.MediaCommandReceived += OnMediaCommand;

        // Discord RPC manager
        _discordRpc = new DiscordRpcManager(_appDataDir);

        // Tray icon manager
        _tray = new TrayIconManager(Icon);
        _tray.SetDiscordState(_discordRpc.IsEnabled);
        _tray.MediaCommandRequested += OnMediaCommand;
        _tray.RestoreWindowRequested += RestoreWindow;
        _tray.ToggleDiscordRequested += () =>
        {
            _discordRpc.IsEnabled = !_discordRpc.IsEnabled;
            _tray.SetDiscordState(_discordRpc.IsEnabled);
        };
        _tray.CheckUpdateRequested += () =>
        {
            RestoreWindow();
            _ = CheckForUpdatesAndPromptAsync(manual: true);
        };
        _tray.ExitRequested += ExitApplication;

        // WebView2 control
        _webView = new WebView2
        {
            Dock = DockStyle.Fill,
            DefaultBackgroundColor = Color.FromArgb(19, 8, 15)
        };
        Controls.Add(_webView);

        InitializeWebViewAsync(_appDataDir);
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        if (Icon != null)
        {
            try
            {
                SendMessage(Handle, WM_SETICON, (IntPtr)ICON_SMALL, Icon.Handle);
                SendMessage(Handle, WM_SETICON, (IntPtr)ICON_BIG, Icon.Handle);
            }
            catch { /* ignore */ }
        }
    }

    private Icon LoadApplicationIcon()
    {
        // 1. Load directly from embedded resource (always present in binary)
        try
        {
            var assembly = Assembly.GetExecutingAssembly();
            using var stream = assembly.GetManifestResourceStream("Notka.Desktop.Assets.notka.ico");
            if (stream != null)
            {
                return new Icon(stream);
            }
        }
        catch { /* fallback */ }

        // 2. Load from disk Assets directory
        try
        {
            string iconPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Assets", "notka.ico");
            if (File.Exists(iconPath))
            {
                return new Icon(iconPath);
            }
        }
        catch { /* fallback */ }

        // 3. Fallback to process executable icon
        try
        {
            string? procPath = Environment.ProcessPath;
            if (!string.IsNullOrEmpty(procPath) && File.Exists(procPath))
            {
                var exeIcon = Icon.ExtractAssociatedIcon(procPath);
                if (exeIcon != null) return exeIcon;
            }
        }
        catch { /* fallback */ }

        return SystemIcons.Application;
    }

    private void EnableDarkTitleBar()
    {
        try
        {
            int useDarkMode = 1;
            DwmSetWindowAttribute(Handle, DWMWA_USE_IMMERSIVE_DARK_MODE, ref useDarkMode, sizeof(int));
        }
        catch { /* ignored on older OS builds */ }
    }

    private async void InitializeWebViewAsync(string appDataDir)
    {
        try
        {
            Log("[WebView2] Initializing environment...");
            string userDataFolder = Path.Combine(appDataDir, "WebViewData");
            var envOptions = new CoreWebView2EnvironmentOptions(
                additionalBrowserArguments: "--disable-features=Translate,OptimizationHints,MediaRouter " +
                                            "--enable-features=HardwareMediaKeyHandling " +
                                            "--autoplay-policy=no-user-gesture-required " +
                                            "--disable-background-timer-throttling " +
                                            "--disable-renderer-backgrounding"
            );

            var env = await CoreWebView2Environment.CreateAsync(
                browserExecutableFolder: null,
                userDataFolder: userDataFolder,
                options: envOptions
            );

            await _webView.EnsureCoreWebView2Async(env);
            Log("[WebView2] CoreWebView2 initialized successfully");

            // Intercept image/cover requests with local high-speed cache
            _webView.CoreWebView2.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.Image);
            _webView.CoreWebView2.WebResourceRequested += OnWebResourceRequested;

            // Configure settings
            _webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
            _webView.CoreWebView2.Settings.AreDevToolsEnabled = true;
            _webView.CoreWebView2.Settings.IsSwipeNavigationEnabled = false;

            // Inject saved session before any script runs
            if (File.Exists(_sessionFilePath) || File.Exists(_authFilePath))
            {
                try
                {
                    string targetFile = File.Exists(_sessionFilePath) ? _sessionFilePath : _authFilePath;
                    string rawJson = File.ReadAllText(targetFile);
                    if (!string.IsNullOrWhiteSpace(rawJson))
                    {
                        Log("[WebView2] Injecting saved session on document created");
                        await _webView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(
                            $"try {{ " +
                            $"window.__NOTKA_SAVED_SESSION__ = {rawJson}; " +
                            $"var _sess = {rawJson}; " +
                            $"if (!localStorage.getItem('notka_session_v1')) localStorage.setItem('notka_session_v1', JSON.stringify(_sess)); " +
                            $"if (_sess && _sess.token) {{ " +
                            $"localStorage.setItem('notka_auth_token', _sess.token); " +
                            $"if (_sess.user) localStorage.setItem('notka_auth_user', JSON.stringify(_sess.user)); " +
                            $"window.Telegram = window.Telegram || {{}}; " +
                            $"window.Telegram.WebApp = window.Telegram.WebApp || {{}}; " +
                            $"window.Telegram.WebApp.initData = 'notka-session:' + _sess.token; " +
                            $"window.Telegram.WebApp.initDataUnsafe = {{ user: _sess.user || _sess }}; " +
                            $"}} " +
                            $"}} catch (e) {{}}"
                        );
                    }
                }
                catch (Exception ex)
                {
                    Log($"[MainForm] Session load error: {ex.Message}");
                }
            }

            // Load bridge script
            string bridgeScript = GetEmbeddedBridgeScript();
            if (!string.IsNullOrEmpty(bridgeScript))
            {
                Log($"[WebView2] Injected bridge script ({bridgeScript.Length} bytes)");
                await _webView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(bridgeScript);
            }
            else
            {
                Log("[WebView2] WARNING: Bridge script was empty or missing!");
            }

            // Web message handler
            _webView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;
            _webView.CoreWebView2.NavigationCompleted += (_, e) =>
            {
                string src = _webView.CoreWebView2?.Source ?? "";
                Log($"[WebView2] NavigationCompleted: success={e.IsSuccess}, httpStatus={e.HttpStatusCode}, url={src}");
                if (e.IsSuccess && !_initialUpdateChecked && src.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
                {
                    _initialUpdateChecked = true;
                    _ = CheckForUpdatesAndPromptAsync(manual: false);
                }
                else if (!e.IsSuccess && e.WebErrorStatus != CoreWebView2WebErrorStatus.OperationCanceled)
                {
                    try { _webView.CoreWebView2?.NavigateToString(BuildOfflineHtml()); } catch { }
                }
            };

            // Open external links in default browser
            _webView.CoreWebView2.NewWindowRequested += (_, e) =>
            {
                if (!string.IsNullOrWhiteSpace(e.Uri) &&
                    (e.Uri.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
                     e.Uri.StartsWith("https://", StringComparison.OrdinalIgnoreCase)))
                {
                    e.Handled = true;
                    OpenExternalUrl(e.Uri);
                }
            };

            // Navigate
            Log($"[WebView2] Navigating to {_startUrl}");
            _webView.CoreWebView2.Navigate(_startUrl);
        }
        catch (Exception ex)
        {
            Log($"[WebView2] Initialization error: {ex.Message}");
            MessageBox.Show(
                $"Ошибка инициализации компонента WebView2:\n{ex.Message}\n\nУбедитесь, что установлен Microsoft Edge WebView2 Runtime.",
                "Notka Desktop",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
        }
    }

    private static string GetEmbeddedBridgeScript()
    {
        try
        {
            var assembly = Assembly.GetExecutingAssembly();
            const string resourceName = "Notka.Desktop.Bridge.notka-bridge.js";
            using var stream = assembly.GetManifestResourceStream(resourceName);
            if (stream != null)
            {
                using var reader = new StreamReader(stream);
                return reader.ReadToEnd();
            }

            // Fallback: check file system if debugging
            string diskPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Bridge", "notka-bridge.js");
            if (File.Exists(diskPath))
            {
                return File.ReadAllText(diskPath);
            }
        }
        catch { /* ignore */ }

        return string.Empty;
    }

    public static void Log(string message)
    {
        try
        {
            string logPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Notka", "desktop.log");
            File.AppendAllText(logPath, $"{DateTime.Now:HH:mm:ss.fff} {message}{Environment.NewLine}");
        }
        catch { }
    }

    private void OnWebResourceRequested(object? sender, CoreWebView2WebResourceRequestedEventArgs e)
    {
        string uri = e.Request.Uri;
        if (_coverCache.IsCoverUrl(uri))
        {
            var deferral = e.GetDeferral();
            _ = Task.Run(async () =>
            {
                try
                {
                    byte[]? bytes = await _coverCache.GetCoverAsync(uri);
                    if (bytes != null && bytes.Length > 0)
                    {
                        string contentType = CoverCache.DetectContentType(bytes);
                        string headers = $"Content-Type: {contentType}\r\n" +
                                         "Access-Control-Allow-Origin: *\r\n" +
                                         "Access-Control-Allow-Methods: GET, OPTIONS\r\n" +
                                         "Cache-Control: public, max-age=31536000, immutable\r\n";

                        var stream = new MemoryStream(bytes);
                        var response = _webView.CoreWebView2.Environment.CreateWebResourceResponse(
                            stream, 200, "OK", headers
                        );

                        BeginInvoke(() =>
                        {
                            try { e.Response = response; } catch { }
                            deferral.Complete();
                        });
                        return;
                    }
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[MainForm] Cover interception error: {ex.Message}");
                }

                BeginInvoke(() =>
                {
                    try { deferral.Complete(); } catch { }
                });
            });
        }
    }

    private void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            using var doc = JsonDocument.Parse(e.WebMessageAsJson);
            var root = doc.RootElement;

            if (!root.TryGetProperty("type", out var typeProp)) return;
            string? type = typeProp.GetString();

            if (type == "metadata")
            {
                string title = root.TryGetProperty("title", out var t) ? t.GetString() ?? "" : "";
                string artist = root.TryGetProperty("artist", out var a) ? a.GetString() ?? "" : "";
                string album = root.TryGetProperty("album", out var al) ? al.GetString() ?? "" : "";
                string artwork = root.TryGetProperty("artwork", out var art) ? art.GetString() ?? "" : "";

                string trackTitle = string.IsNullOrWhiteSpace(title) ? "Notka" : title;
                _currentTitle = trackTitle;
                _currentArtist = artist;
                _currentAlbum = album;
                _currentArtwork = artwork;

                // Pre-cache cover to disk and memory in background
                if (!string.IsNullOrWhiteSpace(artwork))
                {
                    _coverCache.Prefetch(artwork);
                }

                BeginInvoke(() =>
                {
                    Text = string.IsNullOrWhiteSpace(artist)
                        ? trackTitle
                        : $"{artist} — {trackTitle}";

                    string? localThumb = _coverCache.GetDiskCachePath(artwork);
                    _smtc.UpdateMetadata(trackTitle, artist, album, artwork, localThumb);
                    _tray.UpdateTrack(trackTitle, artist, _isPlaying);
                    _discordRpc.UpdateTrack(trackTitle, artist, album, artwork, _isPlaying, _currentDuration, _currentPosition);
                });
            }
            else if (type == "playback_state")
            {
                bool isPlaying = root.TryGetProperty("isPlaying", out var p) && p.GetBoolean();
                _isPlaying = isPlaying;

                if (root.TryGetProperty("title", out var pt) && !string.IsNullOrWhiteSpace(pt.GetString()) && pt.GetString() != "Notka")
                {
                    _currentTitle = pt.GetString()!;
                }
                if (root.TryGetProperty("artist", out var pa) && !string.IsNullOrWhiteSpace(pa.GetString()))
                {
                    _currentArtist = pa.GetString()!;
                }
                if (root.TryGetProperty("album", out var pal) && !string.IsNullOrWhiteSpace(pal.GetString()))
                {
                    _currentAlbum = pal.GetString()!;
                }
                if (root.TryGetProperty("artwork", out var part) && !string.IsNullOrWhiteSpace(part.GetString()))
                {
                    _currentArtwork = part.GetString()!;
                }

                BeginInvoke(() =>
                {
                    Text = string.IsNullOrWhiteSpace(_currentArtist)
                        ? (string.IsNullOrWhiteSpace(_currentTitle) ? "Notka" : _currentTitle)
                        : $"{_currentArtist} — {_currentTitle}";

                    _smtc.UpdatePlaybackStatus(_isPlaying);
                    _tray.UpdateTrack(_currentTitle, _currentArtist, _isPlaying);
                    _discordRpc.UpdateTrack(_currentTitle, _currentArtist, _currentAlbum, _currentArtwork, _isPlaying, _currentDuration, _currentPosition);
                });
            }
            else if (type == "timeline")
            {
                double duration = root.TryGetProperty("duration", out var d) ? d.GetDouble() : 0;
                double position = root.TryGetProperty("position", out var pos) ? pos.GetDouble() : 0;
                _currentDuration = duration;
                _currentPosition = position;

                BeginInvoke(() =>
                {
                    _smtc.UpdateTimeline(duration, position);
                    _discordRpc.UpdateTimeline(duration, position);
                });
            }
            else if (type == "session_save")
            {
                try
                {
                    if (root.TryGetProperty("session", out var sessProp))
                    {
                        string json = sessProp.GetRawText();
                        File.WriteAllText(_sessionFilePath, json);
                    }
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[MainForm] Session save error: {ex.Message}");
                }
            }
            else if (type == "session_clear")
            {
                try
                {
                    if (File.Exists(_sessionFilePath)) File.Delete(_sessionFilePath);
                    if (File.Exists(_authFilePath)) File.Delete(_authFilePath);
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[MainForm] Session clear error: {ex.Message}");
                }
            }
            else if (type == "auth_save")
            {
                try
                {
                    string token = root.TryGetProperty("token", out var tProp) ? tProp.GetString() ?? "" : "";
                    if (root.TryGetProperty("user", out var uProp))
                    {
                        using var stream = new MemoryStream();
                        using (var writer = new Utf8JsonWriter(stream, new JsonWriterOptions { Indented = true }))
                        {
                            writer.WriteStartObject();
                            writer.WriteString("token", token);
                            writer.WritePropertyName("user");
                            uProp.WriteTo(writer);
                            writer.WriteEndObject();
                        }
                        string json = System.Text.Encoding.UTF8.GetString(stream.ToArray());
                        File.WriteAllText(_authFilePath, json);
                    }
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[MainForm] Auth save error: {ex.Message}");
                }
            }
            else if (type == "auth_logout")
            {
                try
                {
                    if (File.Exists(_authFilePath))
                    {
                        File.Delete(_authFilePath);
                    }
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[MainForm] Auth delete error: {ex.Message}");
                }
            }
            else if (type == "open_external")
            {
                string url = root.TryGetProperty("url", out var u) ? u.GetString() ?? "" : "";
                if (!string.IsNullOrWhiteSpace(url))
                {
                    OpenExternalUrl(url);
                }
            }
            else if (type == "update_start")
            {
                _ = StartDesktopUpdateDownloadAsync();
            }
            else if (type == "update_cancel" || type == "update_dismiss")
            {
                try { _updateDownloadCts?.Cancel(); } catch { }
            }
            else if (type == "update_check")
            {
                _ = CheckForUpdatesAndPromptAsync(manual: true);
            }
            else if (type == "retry_connect")
            {
                BeginInvoke(() =>
                {
                    try { _webView.CoreWebView2?.Navigate(_startUrl); } catch { }
                });
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[MainForm] WebMessage parse error: {ex.Message}");
        }
    }

    private void OnMediaCommand(string action)
    {
        if (IsDisposed || !IsHandleCreated) return;

        BeginInvoke(async () =>
        {
            try
            {
                if (_webView.CoreWebView2 != null)
                {
                    await _webView.CoreWebView2.ExecuteScriptAsync($"window.notkaMedia && window.notkaMedia('{action}');");
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[MainForm] Media command execute error: {ex.Message}");
            }
        });
    }

    private void RestoreWindow()
    {
        ShowInTaskbar = true;
        if (WindowState == FormWindowState.Minimized)
        {
            WindowState = FormWindowState.Normal;
        }

        Show();
        Activate();
        BringToFront();
    }

    private void ExitApplication()
    {
        _isExiting = true;
        SaveWindowSettings();
        Application.Exit();
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (!_isExiting && e.CloseReason == CloseReason.UserClosing)
        {
            // Minimize to tray instead of quitting so playback continues uninterrupted,
            // while preserving window handle so Discord process monitor continues detecting track
            e.Cancel = true;
            ShowInTaskbar = false;
            WindowState = FormWindowState.Minimized;

            // Trim working set to reduce memory footprint while minimized
            TrimMemory();

            if (!_balloonShown)
            {
                _balloonShown = true;
                _tray.ShowBalloon(
                    "Notka",
                    "Приложение свёрнуто в трей и продолжает играть. Для выхода нажмите «Выход» в меню трея.",
                    ToolTipIcon.Info
                );
            }
            return;
        }

        SaveWindowSettings();
        try { _updateDownloadCts?.Cancel(); _updateDownloadCts?.Dispose(); } catch { }
        _updater.Dispose();
        _coverCache.Dispose();
        _discordRpc.Dispose();
        _smtc.Dispose();
        _tray.Dispose();
        base.OnFormClosing(e);
    }

    private async Task CheckForUpdatesAndPromptAsync(bool manual)
    {
        try
        {
            if (!manual)
            {
                await Task.Delay(750);
            }

            var info = await _updater.CheckForUpdatesAsync();
            if (IsDisposed) return;

            if (info == null)
            {
                _pendingUpdate = null;
                if (manual)
                {
                    string msg = JsonSerializer.Serialize($"У вас последняя версия Нотки ({_updater.CurrentVersion})");
                    BeginInvoke(async () =>
                    {
                        try
                        {
                            if (_webView.CoreWebView2 != null)
                            {
                                await _webView.CoreWebView2.ExecuteScriptAsync($"window.__notkaShowToast && window.__notkaShowToast({msg});");
                            }
                        }
                        catch { }
                    });
                }
                return;
            }

            _pendingUpdate = info;
            Log($"[Updater] Update available: {info.CurrentVersion} -> {info.Version} ({info.DownloadUrl})");

            string payload = JsonSerializer.Serialize(new
            {
                version = info.Version,
                currentVersion = info.CurrentVersion,
                changelog = info.Changelog,
                size = info.SizeBytes
            });

            BeginInvoke(async () =>
            {
                try
                {
                    if (_webView.CoreWebView2 != null)
                    {
                        await _webView.CoreWebView2.ExecuteScriptAsync($"window.__notkaShowUpdateModal && window.__notkaShowUpdateModal({payload});");
                    }
                }
                catch (Exception ex)
                {
                    Log($"[Updater] Failed to open modal: {ex.Message}");
                }
            });
        }
        catch (Exception ex)
        {
            Log($"[Updater] Check error: {ex.Message}");
            if (manual && !IsDisposed)
            {
                string msg = JsonSerializer.Serialize("Не удалось проверить обновления");
                BeginInvoke(async () =>
                {
                    try
                    {
                        if (_webView.CoreWebView2 != null)
                        {
                            await _webView.CoreWebView2.ExecuteScriptAsync($"window.__notkaShowToast && window.__notkaShowToast({msg});");
                        }
                    }
                    catch { }
                });
            }
        }
    }

    private async Task StartDesktopUpdateDownloadAsync()
    {
        var info = _pendingUpdate;
        if (info == null || _updateDownloading) return;
        _updateDownloading = true;

        _updateDownloadCts?.Dispose();
        _updateDownloadCts = new CancellationTokenSource();
        var ct = _updateDownloadCts.Token;

        try
        {
            string msiPath = await _updater.DownloadUpdateAsync(
                info,
                progress => PushUpdateStateToWebView(progress),
                ct
            );

            Log($"[Updater] Verified MSI ready at {msiPath}, launching upgrade...");
            AppUpdater.LaunchMsiUpgradeDetached(msiPath, Environment.ProcessId);
            await Task.Delay(300);
            if (!IsDisposed)
            {
                BeginInvoke(ExitApplication);
            }
        }
        catch (OperationCanceledException)
        {
            PushUpdateStateToWebView(new UpdateProgress("idle", 0, 0, 0));
        }
        catch (Exception ex)
        {
            Log($"[Updater] Download failed: {ex.Message}");
            PushUpdateStateToWebView(new UpdateProgress("error", 0, 0, 0, Error: ex.Message));
        }
        finally
        {
            _updateDownloading = false;
        }
    }

    private void PushUpdateStateToWebView(UpdateProgress progress)
    {
        if (IsDisposed || !IsHandleCreated) return;
        string json = JsonSerializer.Serialize(new
        {
            phase = progress.Phase,
            percent = progress.Percent,
            loaded = progress.LoadedBytes,
            total = progress.TotalBytes,
            text = progress.Text,
            error = progress.Error
        });

        BeginInvoke(async () =>
        {
            try
            {
                if (_webView.CoreWebView2 != null)
                {
                    await _webView.CoreWebView2.ExecuteScriptAsync($"window.__notkaUpdateState && window.__notkaUpdateState({json});");
                }
            }
            catch { }
        });
    }

    private static string BuildOfflineHtml() => """
        <!DOCTYPE html>
        <html lang="ru">
        <head>
          <meta charset="UTF-8">
          <title>Нотка — Нет связи</title>
          <style>
            :root { --bg:#1A0B16; --ground:#13080F; --text:#FFF1EA; --text-2:rgba(255,241,234,0.66); --c-core:#FFE9DF; --c-warm:#FFA6B8; --c-mid:#FF4FA0; --c-deep:#44112F; --btn-light:linear-gradient(150deg,#FFFFFF 0%,#FFF4EE 45%,#FFD7DF 100%); }
            * { box-sizing:border-box; margin:0; padding:0; user-select:none; }
            body { background:radial-gradient(circle at 50% 24%,rgba(68,17,47,0.72) 0%,var(--ground) 64%); background-color:var(--ground); color:var(--text); font-family:"Onest",system-ui,-apple-system,"Segoe UI",sans-serif; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; text-align:center; }
            .card { width:100%; max-width:360px; padding:28px 22px 22px; border-radius:32px; background:linear-gradient(180deg,rgba(255,255,255,0.1),rgba(255,255,255,0.03) 40%),linear-gradient(135deg,rgba(64,34,52,0.62),rgba(24,14,24,0.86)); box-shadow:inset 0 1px 0.5px rgba(255,255,255,0.32),inset 0 0 0 0.5px rgba(255,255,255,0.14),0 30px 70px -20px rgba(0,0,0,0.75); display:flex; flex-direction:column; align-items:center; }
            .orb { width:68px; height:68px; border-radius:50%; background:radial-gradient(circle at 36% 30%,var(--c-core) 0 12%,var(--c-warm) 36%,var(--c-mid) 66%,var(--c-deep) 100%); display:flex; align-items:center; justify-content:center; margin-bottom:20px; box-shadow:0 10px 30px -8px rgba(255,79,160,0.45); }
            .orb svg { width:30px; height:30px; fill:none; stroke:var(--bg); stroke-width:2.2; stroke-linecap:round; stroke-linejoin:round; }
            h1 { font-size:22px; font-weight:700; letter-spacing:-0.02em; margin-bottom:8px; }
            p { font-size:15px; line-height:1.45; color:var(--text-2); margin-bottom:22px; }
            button { width:100%; height:50px; border-radius:999px; border:none; background:var(--btn-light); color:var(--bg); font:inherit; font-size:16px; font-weight:600; cursor:pointer; }
            button:active { transform:scale(0.97); }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="orb"><svg viewBox="0 0 24 24"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path><path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg></div>
            <h1>Нет подключения к сети</h1>
            <p>Проверьте интернет-соединение и попробуйте снова.</p>
            <button onclick="window.chrome&&window.chrome.webview&&window.chrome.webview.postMessage({type:'retry_connect'})">Повторить</button>
          </div>
        </body>
        </html>
        """;

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        if (WindowState == FormWindowState.Minimized)
        {
            TrimMemory();
        }
    }

    private static void TrimMemory()
    {
        try
        {
            GC.Collect(2, GCCollectionMode.Aggressive, blocking: true, compacting: true);
            GC.WaitForPendingFinalizers();
            SetProcessWorkingSetSize(Process.GetCurrentProcess().Handle, -1, -1);
        }
        catch { /* ignore */ }
    }

    private static void OpenExternalUrl(string url)
    {
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = url,
                UseShellExecute = true
            });
        }
        catch { /* ignore */ }
    }

    private void SaveWindowSettings()
    {
        try
        {
            var settings = new WindowSettings
            {
                X = Location.X,
                Y = Location.Y,
                Width = Width,
                Height = Height,
                IsMaximized = WindowState == FormWindowState.Maximized
            };
            string json = JsonSerializer.Serialize(settings);
            File.WriteAllText(_settingsFilePath, json);
        }
        catch { /* ignore */ }
    }

    private void RestoreWindowSettings()
    {
        try
        {
            if (File.Exists(_settingsFilePath))
            {
                string json = File.ReadAllText(_settingsFilePath);
                var settings = JsonSerializer.Deserialize<WindowSettings>(json);
                if (settings != null)
                {
                    if (settings.Width >= MinimumSize.Width && settings.Height >= MinimumSize.Height)
                    {
                        Size = new Size(settings.Width, settings.Height);
                    }

                    // Check if coordinates are within visible screen bounds
                    var rect = new Rectangle(settings.X, settings.Y, Width, Height);
                    if (Screen.FromRectangle(rect).WorkingArea.IntersectsWith(rect))
                    {
                        StartPosition = FormStartPosition.Manual;
                        Location = new Point(settings.X, settings.Y);
                    }

                    if (settings.IsMaximized)
                    {
                        WindowState = FormWindowState.Maximized;
                    }
                }
            }
        }
        catch { /* fallback to defaults */ }
    }

    private sealed class WindowSettings
    {
        public int X { get; set; }
        public int Y { get; set; }
        public int Width { get; set; }
        public int Height { get; set; }
        public bool IsMaximized { get; set; }
    }
}
