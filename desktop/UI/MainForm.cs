using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Notka.Desktop.Smtc;
using Notka.Desktop.Tray;

namespace Notka.Desktop.UI;

public sealed class MainForm : Form
{
    private const int DWMWA_USE_IMMERSIVE_DARK_MODE = 20;

    [DllImport("dwmapi.dll", PreserveSig = true)]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);

    [DllImport("kernel32.dll", EntryPoint = "SetProcessWorkingSetSize", ExactSpelling = true, CharSet = CharSet.Ansi, SetLastError = true)]
    private static extern int SetProcessWorkingSetSize(IntPtr process, int minimumWorkingSetSize, int maximumWorkingSetSize);

    private readonly WebView2 _webView;
    private readonly SmtcManager _smtc;
    private readonly TrayIconManager _tray;
    private readonly string _startUrl;
    private readonly string _settingsFilePath;
    private readonly string _authFilePath;

    private bool _isExiting;
    private bool _balloonShown;
    private string _currentTitle = "Notka";
    private string _currentArtist = "";
    private bool _isPlaying;

    public MainForm(string? startUrl = null)
    {
        // Window appearance
        Text = "Notka";
        Icon = LoadApplicationIcon();
        BackColor = Color.FromArgb(13, 13, 15);
        ForeColor = Color.White;
        StartPosition = FormStartPosition.CenterScreen;
        Size = new Size(1060, 740);
        MinimumSize = new Size(420, 580);
        DoubleBuffered = true;

        EnableDarkTitleBar();

        _startUrl = !string.IsNullOrWhiteSpace(startUrl)
            ? startUrl
            : "https://notka.duckdns.org/app/?source=desktop";

        string appDataDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Notka"
        );
        Directory.CreateDirectory(appDataDir);
        _settingsFilePath = Path.Combine(appDataDir, "window-settings.json");
        _authFilePath = Path.Combine(appDataDir, "auth.json");

        RestoreWindowSettings();

        // SMTC manager
        _smtc = new SmtcManager(Handle);
        _smtc.MediaCommandReceived += OnMediaCommand;

        // Tray icon manager
        _tray = new TrayIconManager(Icon);
        _tray.MediaCommandRequested += OnMediaCommand;
        _tray.RestoreWindowRequested += RestoreWindow;
        _tray.ExitRequested += ExitApplication;

        // WebView2 control
        _webView = new WebView2
        {
            Dock = DockStyle.Fill,
            DefaultBackgroundColor = Color.FromArgb(13, 13, 15)
        };
        Controls.Add(_webView);

        InitializeWebViewAsync(appDataDir);
    }

    private Icon LoadApplicationIcon()
    {
        try
        {
            string iconPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Assets", "notka.ico");
            if (File.Exists(iconPath))
            {
                return new Icon(iconPath);
            }
        }
        catch { /* fallback */ }

        try
        {
            var exeIcon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            if (exeIcon != null) return exeIcon;
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

            // Configure settings
            _webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
            _webView.CoreWebView2.Settings.AreDevToolsEnabled = true;
            _webView.CoreWebView2.Settings.IsSwipeNavigationEnabled = false;

            // Inject saved auth token and user before any script runs
            if (File.Exists(_authFilePath))
            {
                try
                {
                    string authJson = File.ReadAllText(_authFilePath);
                    if (!string.IsNullOrWhiteSpace(authJson))
                    {
                        await _webView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(
                            $"window.__NOTKA_SAVED_AUTH__ = {authJson};"
                        );
                    }
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[MainForm] Auth load error: {ex.Message}");
                }
            }

            // Load bridge script
            string bridgeScript = GetEmbeddedBridgeScript();
            if (!string.IsNullOrEmpty(bridgeScript))
            {
                await _webView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(bridgeScript);
            }

            // Web message handler
            _webView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;

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
            _webView.CoreWebView2.Navigate(_startUrl);
        }
        catch (Exception ex)
        {
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

    private void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            string raw = e.TryGetWebMessageAsString();
            if (string.IsNullOrEmpty(raw))
            {
                raw = e.WebMessageAsJson;
            }

            using var doc = JsonDocument.Parse(raw);
            var root = doc.RootElement;

            if (!root.TryGetProperty("type", out var typeProp)) return;
            string? type = typeProp.GetString();

            if (type == "metadata")
            {
                string title = root.TryGetProperty("title", out var t) ? t.GetString() ?? "" : "";
                string artist = root.TryGetProperty("artist", out var a) ? a.GetString() ?? "" : "";
                string album = root.TryGetProperty("album", out var al) ? al.GetString() ?? "" : "";
                string artwork = root.TryGetProperty("artwork", out var art) ? art.GetString() ?? "" : "";

                _currentTitle = string.IsNullOrWhiteSpace(title) ? "Notka" : title;
                _currentArtist = artist;

                BeginInvoke(() =>
                {
                    Text = string.IsNullOrWhiteSpace(_currentArtist)
                        ? $"Notka — {_currentTitle}"
                        : $"Notka — {_currentArtist} — {_currentTitle}";

                    _smtc.UpdateMetadata(_currentTitle, _currentArtist, album, artwork);
                    _tray.UpdateTrack(_currentTitle, _currentArtist, _isPlaying);
                });
            }
            else if (type == "playback_state")
            {
                bool isPlaying = root.TryGetProperty("isPlaying", out var p) && p.GetBoolean();
                _isPlaying = isPlaying;

                BeginInvoke(() =>
                {
                    _smtc.UpdatePlaybackStatus(_isPlaying);
                    _tray.UpdateTrack(_currentTitle, _currentArtist, _isPlaying);
                });
            }
            else if (type == "timeline")
            {
                double duration = root.TryGetProperty("duration", out var d) ? d.GetDouble() : 0;
                double position = root.TryGetProperty("position", out var pos) ? pos.GetDouble() : 0;

                BeginInvoke(() =>
                {
                    _smtc.UpdateTimeline(duration, position);
                });
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
            // Minimize to tray instead of quitting so playback continues uninterrupted
            e.Cancel = true;
            Hide();

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
        _smtc.Dispose();
        _tray.Dispose();
        base.OnFormClosing(e);
    }

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
