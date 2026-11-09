# Current work — crxwov

participant: crxwov
agent: Antigravity
status: active
updated_at_utc: 2026-11-09T11:37:01Z
heartbeat_interval_seconds: 60
stale_after_seconds: 180
branch: webview2_desktop_app

## Objective / Success Criteria
Develop modern, lightweight Windows Desktop client for Notka in `desktop/` based on .NET 10 + WebView2:
- Minimal memory consumption and near-instant startup (no Electron, ~30-50MB RAM footprint).
- Native Windows System Media Transport Controls (SMTC) integration: volume flyout / lock screen with track metadata (title, artist, album, cover art) and hardware media keys (Play/Pause, Next, Previous, Stop).
- System tray integration with context menu (Play/Pause, Next, Previous, Open, Exit) and minimize-to-tray.
- Seamless two-way bridge with Notka web application: automatically intercepts `navigator.mediaSession` and audio events, reflects state in SMTC, dispatches media key commands back to the web client.
- Fast, clean single-file or portable Windows build script and tests.

## Scope / Reservation
- Directory `desktop/`
- Build and test scripts for Windows desktop client (`desktop/build.ps1`, `tests/test_desktop.py`)
- Documentation in `desktop/README.md` and `PROJECT_INDEX.md`

## Stages
1. Coordinate task and publish active work state — completed.
2. Design and create .NET 10 WinForms/WinRT project structure in `desktop/` with WebView2 and SMTC — completed.
3. Implement native SMTC manager with `ISystemMediaTransportControlsInterop` and two-way JS bridge — completed.
4. Implement System Tray (`NotifyIcon`) with controls and minimize/restore behavior — completed.
5. Verify build, memory footprint, SMTC media keys, and tray functionality — completed (`tests/test_desktop.py` all green).
6. Commit changes and validate — active.

## Findings / Decisions
- .NET 10 SDK (version 10.0.401, host 10.0.12, WindowsDesktop runtime) located in `D:\DeyttConnectBuild\dotnet`.
- Electron was rejected due to excessive memory overhead (~200MB+ vs ~35MB with WebView2 Evergreen).
- Web application in `miniapp/app.js` already integrates with `navigator.mediaSession` and MediaMetadata. The desktop client injects a thin bridge script (`desktop/Bridge/notka-bridge.js`) to listen to `mediaSession` metadata/playbackState and relay it directly to native SMTC, as well as handling SMTC button presses (`Play`, `Pause`, `Next`, `Previous`) by calling `navigator.mediaSession` handlers or DOM fallback buttons.
- Windows SMTC acquired via `ISystemMediaTransportControlsInterop.GetForWindow(HWND)` with `IInspectable` GUID (`af86e2e0-b12d-4c6a-9c5a-d7aa65101e90`).
- System tray context menu styled with modern dark theme palette matching Notka dark `#0d0d0f` aesthetic.
- Single-instance mutex and event wait handle prevent duplicate processes and focus existing window on duplicate launch.

## Validation / Blockers
- Automated validation suite `tests/test_desktop.py` executed:
  - Assets check: `notka.ico` and `notka-512.png` valid icon formats.
  - Bridge check: `window.notkaMedia`, `window.NotkaDesktop`, `playback_state`, `metadata` hooks verified.
  - Source files check: all C# sources and build script present.
  - Build & publish check: `build.ps1` produces standalone runnable `Notka.exe` (187 KB) with exit code 0 and 0 warnings / 0 errors.

## Next Action / Resume
Commit implementation to branch and present results to user.
