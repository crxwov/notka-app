# Notka App — Agent Guidelines

This is the official open-source repository for **Notka** client applications (Android mobile and Desktop).

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

4. **Native Integrations Over Bloat**:
   - **STRICTLY NO ELECTRON**: We avoid heavy frameworks that consume 300+ MB of RAM.
   - Use native platform engines: Android WebView, Windows WebView2.
   - Implement deep native integration:
     - Media playback session & system notifications.
     - Lock screen controls & hardware media keys.
     - Native haptic feedback and vibrations.
     - Edge-to-edge safe area styling.
     - Proper window lifecycle and background audio persistence.

5. **Commit Discipline**:
   - Clear, descriptive commit messages.
   - Commit working changes after each milestone.
   - Test on physical devices or builds before pushing.
