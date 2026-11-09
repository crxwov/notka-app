using System;
using System.Threading;
using System.Windows.Forms;
using Notka.Desktop.UI;

namespace Notka.Desktop;

internal static class Program
{
    private const string MutexName = "NotkaDesktop_SingleInstance_Mutex";
    private const string WakeEventName = "NotkaDesktop_WakeUp_Event";

    [STAThread]
    private static void Main(string[] args)
    {
        // Single instance check
        using var mutex = new Mutex(true, MutexName, out bool isFirstInstance);
        if (!isFirstInstance)
        {
            // Signal the running instance to restore itself
            try
            {
                using var wakeEvent = EventWaitHandle.OpenExisting(WakeEventName);
                wakeEvent.Set();
            }
            catch { /* ignore */ }
            return;
        }

        using var wakeUpHandle = new EventWaitHandle(false, EventResetMode.AutoReset, WakeEventName);

        // Configure modern WinForms high-DPI rendering
        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        string? startUrl = args.Length > 0 ? args[0] : null;
        var mainForm = new MainForm(startUrl);

        // Listen for wake-up signal from secondary instances on a background thread
        var wakeThread = new Thread(() =>
        {
            while (true)
            {
                if (wakeUpHandle.WaitOne())
                {
                    if (mainForm.IsDisposed) break;
                    try
                    {
                        mainForm.BeginInvoke(() =>
                        {
                            if (mainForm.WindowState == FormWindowState.Minimized)
                            {
                                mainForm.WindowState = FormWindowState.Normal;
                            }
                            mainForm.Show();
                            mainForm.Activate();
                            mainForm.BringToFront();
                        });
                    }
                    catch { break; }
                }
            }
        })
        {
            IsBackground = true,
            Name = "WakeUpListener"
        };
        wakeThread.Start();

        Application.Run(mainForm);
    }
}
