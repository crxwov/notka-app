[CmdletBinding()]
param(
    [ValidateSet('Debug', 'Release')]
    [string]$Configuration = 'Release',
    [switch]$SingleFile,
    [switch]$SelfContained
)

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Locate dotnet if not in current PATH
if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    if (Test-Path "D:\DeyttConnectBuild\dotnet\dotnet.exe") {
        $env:PATH = "D:\DeyttConnectBuild\dotnet;" + $env:PATH
    } elseif (Test-Path "C:\Program Files\dotnet\dotnet.exe") {
        $env:PATH = "C:\Program Files\dotnet;" + $env:PATH
    } else {
        throw ".NET SDK not found. Please install .NET 10 SDK or add dotnet to PATH."
    }
}

Write-Host "Building Notka Desktop (.NET 10 + WebView2)..." -ForegroundColor Cyan

$publishDir = Join-Path $scriptDir "bin\publish"
if (Test-Path $publishDir) {
    Remove-Item -Recurse -Force $publishDir
}

$publishArgs = @(
    "publish",
    (Join-Path $scriptDir "NotkaDesktop.csproj"),
    "-c", $Configuration,
    "-r", "win-x64",
    "-o", $publishDir
)

if ($SelfContained) {
    $publishArgs += "--self-contained", "true"
} else {
    $publishArgs += "--self-contained", "false"
}

if ($SingleFile) {
    $publishArgs += "-p:PublishSingleFile=true", "-p:IncludeNativeLibrariesForSelfExtract=true"
}

& dotnet @publishArgs
if ($LASTEXITCODE -ne 0) {
    throw "Build failed with exit code $LASTEXITCODE"
}

Write-Host "`nBuild successful! Published to: $publishDir" -ForegroundColor Green
Get-ChildItem -Path $publishDir | Select-Object Name, Length
