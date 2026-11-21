# Current work — crxwov

participant: crxwov
agent: Antigravity
status: completed
updated_at_utc: 2026-11-21T16:09:00Z
heartbeat_interval_seconds: 60
stale_after_seconds: 180
branch: main

## Objective / Result
Migrate Notka Android and Windows desktop client applications to the new domain `notka.site` with backward compatibility and optimization.
- Switched default app URLs, API base URLs, version check URLs and image proxies from legacy `notka.duckdns.org` to `https://notka.site`.
- Added automatic migration of saved client preferences and cookies in Android WebView and Windows WebView2.
- Updated server trust lists in Android AppUpdater and Windows AppUpdater to trust `notka.site` (with fallback support for `notka.duckdns.org`).
- Updated desktop Discord RPC, CoverCache, SMTC, WiX installer and documentation.
- Bumped Android client to v2.6.3 (code 35) and Windows desktop client to v1.4.1.

## Scope
- `android/app/src/main/AndroidManifest.xml`
- `android/app/build.gradle.kts`
- `android/app/src/main/assets/offline.html`
- `android/app/src/main/java/space/notka/app/AppUpdater.java`
- `android/app/src/main/java/space/notka/app/CoverCache.java`
- `android/app/src/main/java/space/notka/app/MainActivity.java`
- `android/app/src/main/java/space/notka/app/WebAppInterface.java`
- `desktop/Bridge/notka-bridge.js`
- `desktop/Discord/DiscordRpcManager.cs`
- `desktop/NotkaDesktop.csproj`
- `desktop/README.md`
- `desktop/UI/CoverCache.cs`
- `desktop/UI/MainForm.cs`
- `desktop/Updater/AppUpdater.cs`
- `desktop/build-msi.ps1`
- `desktop/installer/Notka.Installer.wixproj`
- `desktop/installer/Package.wxs`
- `tests/desktop/Program.cs`
- `README.md`

## Validation
- Ran desktop smoke tests (`CoverCache` and `AppUpdater` unit & mock E2E download/verification): all assertions passed.
- Built and signed release Android APK (`android/build.ps1`): compilation, D8 conversion and uber-apk-signer succeeded (`notka.apk` generated).
- Built Windows application and tuned MSI installer (`desktop/build-msi.ps1`): publish, WiX build and MSI table tuning succeeded (`Notka-Setup.msi` 49.89 MB generated).