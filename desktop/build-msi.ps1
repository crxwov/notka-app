[CmdletBinding()]
param(
    [string]$ProductVersion = '1.2.0',
    [string]$OutputDir = ''
)

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Ensure dotnet in PATH
if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    if (Test-Path "D:\DeyttConnectBuild\dotnet\dotnet.exe") {
        $env:DOTNET_ROOT = 'D:\DeyttConnectBuild\dotnet'
        $env:PATH = "$env:DOTNET_ROOT;$env:PATH"
    } elseif (Test-Path "C:\Program Files\dotnet\dotnet.exe") {
        $env:DOTNET_ROOT = 'C:\Program Files\dotnet'
        $env:PATH = "$env:DOTNET_ROOT;$env:PATH"
    } else {
        throw ".NET SDK not found. Install .NET 10 SDK or configure PATH."
    }
}

if (-not $env:NUGET_PACKAGES) {
    if (Test-Path 'D:\DeyttConnectBuild\cli-home\.nuget\packages') {
        $env:NUGET_PACKAGES = 'D:\DeyttConnectBuild\cli-home\.nuget\packages'
    }
}

Write-Host "=== 1. Building Notka Desktop application payload ===" -ForegroundColor Cyan
$desktopDir = $scriptDir
$publishDir = Join-Path $desktopDir "bin\publish"
$assetsDir = (Resolve-Path (Join-Path $desktopDir "Assets")).Path

# Build compressed self-contained single-file Notka.exe
if (Test-Path $publishDir) {
    Remove-Item -Recurse -Force $publishDir
}
New-Item -ItemType Directory -Path $publishDir -Force | Out-Null

$appProj = Join-Path $desktopDir "NotkaDesktop.csproj"
& dotnet publish $appProj -c Release -r win-x64 --self-contained true `
    -p:PublishSingleFile=true `
    -p:IncludeNativeLibrariesForSelfExtract=true `
    -p:EnableCompressionInSingleFile=true `
    -o $publishDir

if ($LASTEXITCODE -ne 0) {
    throw "Application publish failed with exit code $LASTEXITCODE"
}

# Remove any PDB or temporary files from publish dir
Get-ChildItem -Path $publishDir -Filter "*.pdb" -Recurse | Remove-Item -Force
Get-ChildItem -Path $publishDir -Filter "*.xml" -Recurse | Remove-Item -Force

Write-Host "`n=== 2. Building Notka Windows MSI Installer (WiX) ===" -ForegroundColor Cyan
if (-not $OutputDir) {
    $OutputDir = Join-Path $desktopDir "bin\msi"
}
if (Test-Path $OutputDir) {
    Remove-Item -Recurse -Force $OutputDir
}
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

$wixProj = Join-Path $desktopDir "installer\Notka.Installer.wixproj"
$publishDirAbs = (Resolve-Path $publishDir).Path

$wixArgs = @(
    "build",
    $wixProj,
    "-c", "Release",
    "-p:ProductVersion=$ProductVersion",
    "-p:PublishDir=$publishDirAbs",
    "-p:AssetsDir=$assetsDir",
    "-o", $OutputDir,
    "--nologo"
)

& dotnet @wixArgs
if ($LASTEXITCODE -ne 0) {
    throw "MSI build failed with exit code $LASTEXITCODE"
}

$msiFile = Join-Path $OutputDir "Notka-Setup.msi"
if (-not (Test-Path $msiFile)) {
    # Check if named after project or default
    $found = Get-ChildItem -Path $OutputDir -Filter "*.msi" | Select-Object -First 1
    if ($found) {
        $msiFile = $found.FullName
    } else {
        throw "MSI output file not found in $OutputDir"
    }
}

Write-Host "`n=== 3. Tuning MSI tables for Upgrade & Exit Checkboxes ===" -ForegroundColor Cyan
$tuneScript = Join-Path $desktopDir "installer\tune-msi.ps1"
if (Test-Path $tuneScript) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $tuneScript -MsiPath $msiFile
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Tuning script returned exit code $LASTEXITCODE"
    }
}

# Update local user binary for immediate testing
try {
    $localAppBinDir = Join-Path $env:LOCALAPPDATA "Programs\Notka"
    if (Test-Path $localAppBinDir) {
        $pubExe = Join-Path $publishDir "Notka.exe"
        if (Test-Path $pubExe) {
            Copy-Item -Path $pubExe -Destination (Join-Path $localAppBinDir "Notka.exe") -Force
            Write-Host "Updated local test binary at $localAppBinDir\Notka.exe" -ForegroundColor Green
        }
    }
} catch { }

$hash = (Get-FileHash -Path $msiFile -Algorithm SHA256).Hash
$sizeMb = [Math]::Round((Get-Item $msiFile).Length / 1MB, 2)

Write-Host "`n==================================================" -ForegroundColor Green
Write-Host " MSI INSTALLER CREATED SUCCESSFULLY!" -ForegroundColor Green
Write-Host " File:   $msiFile" -ForegroundColor Yellow
Write-Host " Size:   $sizeMb MB" -ForegroundColor Yellow
Write-Host " SHA256: $hash" -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Green

[pscustomobject]@{
    MsiPath = $msiFile
    SizeMB = $sizeMb
    SHA256 = $hash
}
