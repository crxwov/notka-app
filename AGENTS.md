# Notka App — Agent Guidelines

This is the official open-source repository for **Notka** client applications (Android mobile and Windows Desktop).

## Core Principles

1. **Dedicated Client App Repository**:
   - All client application development (Android, Windows Desktop, cross-platform) happens exclusively in this repository.
   - The main backend and web repository handles the core server, bot, API, and Mini App.
   - Client applications serve as native lightweight containers and system integrations for the Notka web experience.

2. **Open-Source Hygiene & Security**:
   - **Never hardcode secrets, tokens, cookies, private IPs, or internal endpoints.**
   - All network endpoints must default to public canonical domains (`https://notka.duckdns.org`) or be configurable at runtime.
   - Code must remain clean, well-commented, and safe for public inspection.

3. **Dynamic Web Updates (No-Rebuild Architecture)**:
   - Client applications load the web application interface dynamically from the live remote endpoint (`https://notka.duckdns.org/app/?source=...`).
   - Any updates or improvements made to the web interface are immediately visible in client apps upon reload, without requiring users to download a new APK or installer.
   - Native wrappers must always provide a styled, graceful **offline fallback** (`offline.html`) when network connectivity is unavailable.

4. **Native Image Caching (`CoverCache`)**:
   - All album and track covers are intercepted via `shouldInterceptRequest` and cached on disk + in RAM (16MB LRU).
   - Once loaded, covers render in 0 ms from local flash storage, bypassing carrier throttling and working offline.

5. **Release Mirroring (GitHub + Russian Server Node)**:
   - Releases must be uploaded **both** to GitHub Releases AND mirrored to the primary server in Russia (`ssh -p 6767 notka` at `/opt/notka/app/releases/` or web root).
   - Alongside the release APK, maintain `version.json` on the server:
     ```json
     {
       "versionCode": 26,
       "versionName": "2.5.1",
       "changelog": "• Список изменений...",
       "downloadUrl": "https://notka.duckdns.org/app/releases/notka.apk"
     }
     ```
   - On every launch, the app checks `https://notka.duckdns.org/app/version.json` in the background. If a newer version is found, it presents a changelog modal and one-click in-app background download & install.

6. **Unified Signing Keystore**:
   - ALL Android application builds must be signed with the single canonical project keystore located at:
     `android/keystore/notka-release.keystore`
     - **Alias**: `notka`
     - **Keystore / Key Password**: `notka2026`
     - **Validity**: 10,000 days (until 2054)
     - **Cert SHA256**: `7c6654e977296340df0a083cc35a4c62ba989b7489a52073ff4af21ea28217a2`
   - Both project developers (`crxwov` and `leksik`) must sign with this exact key so users can seamlessly update APKs without signature mismatch errors (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`).

7. **Strictly No Electron**:
   - For desktop (Windows), use native lightweight runtimes: Windows WebView2 (.NET 10 or Rust) with ~30-50 MB RAM footprint, system tray, and SMTC media key integration.
