using System;
using System.Runtime.InteropServices;
using Windows.Media;

namespace Notka.Desktop.Smtc;

internal static class SmtcInterop
{
    private static readonly Guid IInspectableGuid = new("af86e2e0-b12d-4c6a-9c5a-d7aa65101e90");
    private static readonly Guid InteropGuid = new("ddb0472d-c911-4a1f-86d9-dc3d71a95f5a");

    [DllImport("api-ms-win-core-winrt-string-l1-1-0.dll", CallingConvention = CallingConvention.StdCall)]
    private static extern int WindowsCreateString(
        [MarshalAs(UnmanagedType.LPWStr)] string sourceString,
        int length,
        out IntPtr hstring);

    [DllImport("api-ms-win-core-winrt-string-l1-1-0.dll", CallingConvention = CallingConvention.StdCall)]
    private static extern int WindowsDeleteString(IntPtr hstring);

    [DllImport("api-ms-win-core-winrt-l1-1-0.dll", CallingConvention = CallingConvention.StdCall)]
    private static extern int RoGetActivationFactory(
        IntPtr activatableClassId,
        [In] ref Guid iid,
        out IntPtr factory);

    [ComImport]
    [Guid("ddb0472d-c911-4a1f-86d9-dc3d71a95f5a")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface ISystemMediaTransportControlsInterop
    {
        [PreserveSig] int GetIids(out uint iidCount, out IntPtr iids);
        [PreserveSig] int GetRuntimeClassName(out IntPtr className);
        [PreserveSig] int GetTrustLevel(out int trustLevel);
        [PreserveSig] int GetForWindow(IntPtr appWindow, [In] ref Guid riid, out IntPtr mediaTransportControl);
    }

    public static SystemMediaTransportControls? GetForWindow(IntPtr hwnd)
    {
        if (hwnd == IntPtr.Zero) return null;

        const string className = "Windows.Media.SystemMediaTransportControls";
        int hrCreate = WindowsCreateString(className, className.Length, out IntPtr hstring);
        if (hrCreate != 0 || hstring == IntPtr.Zero) return null;

        try
        {
            Guid interopGuid = InteropGuid;
            int hrFactory = RoGetActivationFactory(hstring, ref interopGuid, out IntPtr factoryPtr);
            if (hrFactory != 0 || factoryPtr == IntPtr.Zero) return null;

            try
            {
                var interop = (ISystemMediaTransportControlsInterop)Marshal.GetObjectForIUnknown(factoryPtr);
                Guid riid = IInspectableGuid;
                int hrGet = interop.GetForWindow(hwnd, ref riid, out IntPtr smtcPtr);
                if (hrGet != 0 || smtcPtr == IntPtr.Zero) return null;

                try
                {
                    return SystemMediaTransportControls.FromAbi(smtcPtr);
                }
                finally
                {
                    Marshal.Release(smtcPtr);
                }
            }
            finally
            {
                Marshal.Release(factoryPtr);
            }
        }
        finally
        {
            WindowsDeleteString(hstring);
        }
    }
}
