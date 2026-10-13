<#
.SYNOPSIS
    Builds and signs the Notka Android APK, with optional auto-install and ADB reverse setup.
.PARAMETER Install
    If set, installs the APK onto the connected phone and launches the app.
#>
param(
    [switch]$Install
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }
$tools = "$root\tools"
$app = "$root\app\src\main"
$build = "$root\build"

# Detect Java
if (Get-Command java -ErrorAction SilentlyContinue) {
    $java = "java"
} elseif (Test-Path "C:\Users\hackov\AppData\Roaming\ModrinthApp\meta\java_versions\zulu21.52.203-ca-jre21.0.12.1-win_x64\bin\java.exe") {
    $java = "C:\Users\hackov\AppData\Roaming\ModrinthApp\meta\java_versions\zulu21.52.203-ca-jre21.0.12.1-win_x64\bin\java.exe"
} else {
    throw "Java (JDK/JRE) not found in PATH or standard location."
}

# Detect Android SDK / android.jar
$androidJar = $null
$sdkCandidates = @(
    "$env:ANDROID_HOME",
    "$env:ANDROID_SDK_ROOT",
    "$env:LOCALAPPDATA\Android\Sdk"
)
foreach ($sdk in $sdkCandidates) {
    if ($sdk -and (Test-Path $sdk)) {
        $foundJar = Get-ChildItem -Path "$sdk\platforms" -Filter "android.jar" -Recurse -ErrorAction SilentlyContinue | Select-Object -Last 1
        if ($foundJar) {
            $androidJar = $foundJar.FullName
            break
        }
    }
}
if (-not $androidJar -or -not (Test-Path $androidJar)) {
    $androidJar = "$env:LOCALAPPDATA\Android\Sdk\platforms\android-34\android.jar"
}

# Detect ADB
$adb = "adb"
if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
    $adbCandidate = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
    if (Test-Path $adbCandidate) { $adb = $adbCandidate }
}

$aapt2 = "$tools\aapt2.exe"
$ecj = "$tools\ecj.jar"
$r8 = "$tools\r8.jar"
$signer = "$tools\uber-apk-signer.jar"

Write-Host "=== Building Notka Android APK ===" -ForegroundColor Cyan

# 1. Prepare clean build directory
if (Test-Path $build) {
    Remove-Item -Recurse -Force $build | Out-Null
}
New-Item -ItemType Directory -Path "$build\gen", "$build\bin", "$build\dex", "$build\dist" -Force | Out-Null

# 2. Compile resources with AAPT2
Write-Host "[1/6] Compiling resources with aapt2..." -ForegroundColor Yellow
& $aapt2 compile --dir "$app\res" -o "$build\compiled_res.zip"
if ($LASTEXITCODE -ne 0) { throw "aapt2 compile failed with code $LASTEXITCODE" }

# 3. Link APK and generate R.java
Write-Host "[2/6] Linking APK and generating R.java..." -ForegroundColor Yellow
& $aapt2 link -I $androidJar `
    --manifest "$app\AndroidManifest.xml" `
    -o "$build\unaligned.apk" `
    --java "$build\gen" `
    --auto-add-overlay `
    "$build\compiled_res.zip"
if ($LASTEXITCODE -ne 0) { throw "aapt2 link failed with code $LASTEXITCODE" }

# 4. Compile Java sources with ECJ
Write-Host "[3/6] Compiling Java sources with ECJ..." -ForegroundColor Yellow
$javaSources = @()
$javaSources += (Get-ChildItem -Recurse -Path "$app\java" -Filter "*.java" | ForEach-Object { $_.FullName })
$javaSources += (Get-ChildItem -Recurse -Path "$build\gen" -Filter "*.java" | ForEach-Object { $_.FullName })

$ecjArgs = @(
    "-jar", $ecj,
    "-8",
    "-nowarn",
    "-cp", $androidJar,
    "-d", "$build\bin"
) + $javaSources

& $java @ecjArgs
if ($LASTEXITCODE -ne 0) { throw "ECJ compilation failed with code $LASTEXITCODE" }

# 5. Convert classes to DEX with D8
Write-Host "[4/6] Converting classes to DEX with D8..." -ForegroundColor Yellow
$classFiles = Get-ChildItem -Recurse -Path "$build\bin" -Filter "*.class" | ForEach-Object { $_.FullName }
$d8Args = @(
    "-cp", $r8,
    "com.android.tools.r8.D8",
    "--lib", $androidJar,
    "--min-api", "24",
    "--output", "$build\dex"
) + $classFiles

& $java @d8Args
if ($LASTEXITCODE -ne 0) { throw "D8 conversion failed with code $LASTEXITCODE" }

# 6. Add classes.dex and assets into unaligned.apk
Write-Host "[5/6] Packaging classes.dex and assets into APK..." -ForegroundColor Yellow
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open("$build\unaligned.apk", [System.IO.Compression.ZipArchiveMode]::Update)

# classes.dex
$dexFile = "$build\dex\classes.dex"
[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $dexFile, "classes.dex") | Out-Null

# assets with forward slashes
$assetsDir = (Resolve-Path "$app\assets").Path
$assetFiles = Get-ChildItem -Recurse -File -Path $assetsDir
foreach ($file in $assetFiles) {
    $rel = $file.FullName.Substring($assetsDir.Length + 1).Replace("\", "/")
    $entryName = "assets/" + $rel
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, $entryName) | Out-Null
}

$zip.Dispose()

# 7. Sign and zipalign APK
Write-Host "[6/6] Signing APK with uber-apk-signer (v1, v2, v3)..." -ForegroundColor Yellow
$signerArgs = @(
    "-jar", $signer,
    "--apks", "$build\unaligned.apk",
    "--out", "$build\dist"
)
& $java @signerArgs
if ($LASTEXITCODE -ne 0) { throw "APK signing failed with code $LASTEXITCODE" }

$outputApk = "$build\dist\notka.apk"
$signedCandidate = Get-ChildItem -Path "$build\dist" -Filter "*.apk" | Where-Object { $_.Name -like "*signed*" } | Select-Object -First 1
if ($signedCandidate) {
    Copy-Item $signedCandidate.FullName $outputApk -Force
}

$apkSizeMB = [math]::Round((Get-Item $outputApk).Length / 1MB, 2)
Write-Host "BUILD SUCCESSFUL! APK generated: $outputApk ($apkSizeMB MB)" -ForegroundColor Green

# Optional: Install to connected phone
if ($Install) {
    Write-Host "`n=== Deploying to connected Android device ===" -ForegroundColor Cyan
    Write-Host "Configuring ADB reverse port forwarding (tcp:8080 -> tcp:8080)..."
    & $adb reverse tcp:8080 tcp:8080
    
    Write-Host "Installing $outputApk..."
    & $adb install -r -d $outputApk
    if ($LASTEXITCODE -ne 0) { throw "adb install failed with code $LASTEXITCODE" }

    Write-Host "Launching Notka..."
    & $adb shell am start -n "space.notka.app/.MainActivity"
    Write-Host "Notka is now running on your phone!" -ForegroundColor Green
}
