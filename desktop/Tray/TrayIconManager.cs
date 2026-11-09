using System;
using System.Drawing;
using System.Windows.Forms;

namespace Notka.Desktop.Tray;

public sealed class TrayIconManager : IDisposable
{
    private readonly NotifyIcon _notifyIcon;
    private readonly ContextMenuStrip _contextMenu;
    private readonly ToolStripMenuItem _itemTrackInfo;
    private readonly ToolStripMenuItem _itemPlayPause;
    private readonly ToolStripMenuItem _itemNext;
    private readonly ToolStripMenuItem _itemPrev;
    private readonly ToolStripMenuItem _itemShow;
    private readonly ToolStripMenuItem _itemExit;

    private bool _isPlaying;
    private bool _isDisposed;

    public event Action<string>? MediaCommandRequested;
    public event Action? RestoreWindowRequested;
    public event Action? ExitRequested;

    public TrayIconManager(Icon appIcon)
    {
        _contextMenu = new ContextMenuStrip
        {
            Renderer = new ToolStripProfessionalRenderer(new DarkColorTable()),
            ShowImageMargin = false
        };

        _itemTrackInfo = new ToolStripMenuItem("Notka")
        {
            Enabled = false,
            ForeColor = Color.FromArgb(170, 170, 175)
        };

        _itemPlayPause = new ToolStripMenuItem("▶  Воспроизведение", null, (_, _) => MediaCommandRequested?.Invoke("toggle"));
        _itemNext = new ToolStripMenuItem("⏭  Следующий трек", null, (_, _) => MediaCommandRequested?.Invoke("next"));
        _itemPrev = new ToolStripMenuItem("⏮  Предыдущий трек", null, (_, _) => MediaCommandRequested?.Invoke("prev"));

        _itemShow = new ToolStripMenuItem("Развернуть Notka", null, (_, _) => RestoreWindowRequested?.Invoke())
        {
            Font = new Font(_contextMenu.Font, FontStyle.Bold)
        };

        _itemExit = new ToolStripMenuItem("Выход", null, (_, _) => ExitRequested?.Invoke());

        _contextMenu.Items.Add(_itemTrackInfo);
        _contextMenu.Items.Add(new ToolStripSeparator());
        _contextMenu.Items.Add(_itemPlayPause);
        _contextMenu.Items.Add(_itemNext);
        _contextMenu.Items.Add(_itemPrev);
        _contextMenu.Items.Add(new ToolStripSeparator());
        _contextMenu.Items.Add(_itemShow);
        _contextMenu.Items.Add(new ToolStripSeparator());
        _contextMenu.Items.Add(_itemExit);

        _notifyIcon = new NotifyIcon
        {
            Icon = appIcon,
            Text = "Notka",
            ContextMenuStrip = _contextMenu,
            Visible = true
        };

        _notifyIcon.DoubleClick += (_, _) => RestoreWindowRequested?.Invoke();
        _notifyIcon.MouseClick += (_, e) =>
        {
            if (e.Button == MouseButtons.Left)
            {
                RestoreWindowRequested?.Invoke();
            }
        };
    }

    public void UpdateTrack(string title, string artist, bool isPlaying)
    {
        _isPlaying = isPlaying;
        _itemPlayPause.Text = isPlaying ? "⏸  Пауза" : "▶  Воспроизведение";

        string trackText = string.IsNullOrWhiteSpace(artist)
            ? (string.IsNullOrWhiteSpace(title) ? "Notka" : title)
            : $"{artist} — {title}";

        _itemTrackInfo.Text = trackText.Length > 40 ? trackText[..37] + "..." : trackText;

        string tooltip = $"Notka: {trackText}";
        if (tooltip.Length >= 64) tooltip = tooltip[..60] + "...";
        _notifyIcon.Text = tooltip;
    }

    public void ShowBalloon(string title, string message, ToolTipIcon icon = ToolTipIcon.Info)
    {
        try
        {
            _notifyIcon.ShowBalloonTip(3000, title, message, icon);
        }
        catch { /* ignore */ }
    }

    public void Dispose()
    {
        if (_isDisposed) return;
        _isDisposed = true;

        _notifyIcon.Visible = false;
        _notifyIcon.Dispose();
        _contextMenu.Dispose();
    }

    // Modern dark theme color palette for context menu
    private sealed class DarkColorTable : ProfessionalColorTable
    {
        public override Color MenuBorder => Color.FromArgb(40, 40, 48);
        public override Color ToolStripDropDownBackground => Color.FromArgb(20, 20, 24);
        public override Color MenuItemSelected => Color.FromArgb(45, 45, 55);
        public override Color MenuItemBorder => Color.Transparent;
        public override Color MenuItemSelectedGradientBegin => Color.FromArgb(45, 45, 55);
        public override Color MenuItemSelectedGradientEnd => Color.FromArgb(45, 45, 55);
        public override Color MenuItemPressedGradientBegin => Color.FromArgb(35, 35, 42);
        public override Color MenuItemPressedGradientEnd => Color.FromArgb(35, 35, 42);
        public override Color SeparatorDark => Color.FromArgb(40, 40, 48);
        public override Color SeparatorLight => Color.FromArgb(25, 25, 30);
        public override Color ImageMarginGradientBegin => Color.FromArgb(20, 20, 24);
        public override Color ImageMarginGradientMiddle => Color.FromArgb(20, 20, 24);
        public override Color ImageMarginGradientEnd => Color.FromArgb(20, 20, 24);
    }
}
