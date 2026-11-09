import os
import subprocess
import sys
from PIL import Image

def test_assets():
    ico_path = os.path.join("desktop", "Assets", "notka.ico")
    assert os.path.exists(ico_path), f"Missing {ico_path}"
    assert os.path.getsize(ico_path) > 1000, "notka.ico is suspiciously small"
    
    with Image.open(ico_path) as img:
        assert img.format == "ICO", f"Expected ICO format, got {img.format}"

    png_path = os.path.join("desktop", "Assets", "notka-512.png")
    assert os.path.exists(png_path), f"Missing {png_path}"
    with Image.open(png_path) as img:
        assert img.size == (512, 512), f"Expected 512x512, got {img.size}"
    print("[OK] Assets test passed")

def test_bridge_script():
    bridge_path = os.path.join("desktop", "Bridge", "notka-bridge.js")
    assert os.path.exists(bridge_path), f"Missing {bridge_path}"
    with open(bridge_path, "r", encoding="utf-8") as f:
        content = f.read()
    assert "window.notkaMedia" in content, "Missing window.notkaMedia"
    assert "window.NotkaDesktop" in content, "Missing window.NotkaDesktop"
    assert "window.notkaDesktop" in content, "Missing window.notkaDesktop"
    assert "mediaSession" in content, "Missing mediaSession hooks"
    assert "playback_state" in content, "Missing playback_state event"
    assert "metadata" in content, "Missing metadata event"
    assert "notka_session_v1" in content, "Missing notka_session_v1 integration"
    assert "menu-login" in content, "Missing menu-login integration"
    print("[OK] Bridge script test passed")

def test_source_files():
    files = [
        os.path.join("desktop", "NotkaDesktop.csproj"),
        os.path.join("desktop", "Program.cs"),
        os.path.join("desktop", "Smtc", "SmtcInterop.cs"),
        os.path.join("desktop", "Smtc", "SmtcManager.cs"),
        os.path.join("desktop", "Discord", "DiscordRpcManager.cs"),
        os.path.join("desktop", "Tray", "TrayIconManager.cs"),
        os.path.join("desktop", "UI", "MainForm.cs"),
        os.path.join("desktop", "build.ps1"),
    ]
    for fp in files:
        assert os.path.exists(fp), f"Missing source file {fp}"
    print("[OK] Source files exist test passed")

def test_build():
    build_script = os.path.join("desktop", "build.ps1")
    cmd = ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", build_script]
    res = subprocess.run(cmd, capture_output=True, text=True)
    assert res.returncode == 0, f"build.ps1 failed:\n{res.stdout}\n{res.stderr}"
    
    exe_path = os.path.join("desktop", "bin", "publish", "Notka.exe")
    assert os.path.exists(exe_path), f"Missing {exe_path}"
    assert os.path.getsize(exe_path) > 50000, "Notka.exe is unexpectedly small"
    print("[OK] Build and publish test passed (Notka.exe built successfully)")

def test_msi_build():
    msi_path = os.path.join("desktop", "bin", "msi", "Notka-Setup.msi")
    assert os.path.exists(msi_path), f"Missing {msi_path}"
    assert os.path.getsize(msi_path) > 10_000_000, f"MSI file is too small: {os.path.getsize(msi_path)} bytes"
    print("[OK] MSI package test passed (Notka-Setup.msi verified)")

if __name__ == "__main__":
    test_assets()
    test_bridge_script()
    test_source_files()
    test_build()
    test_msi_build()
    print("All desktop tests passed successfully!")
