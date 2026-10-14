[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('leksik', 'crxwov')]
    [string]$Participant,
    [string]$RepoPath = '',
    [switch]$NoTimestampRefresh,
    [switch]$Watch,
    [ValidateRange(1, 10)]
    [int]$LeaseMinutes = 5
)

# Publish one coordination file on top of current remote main. Never use the
# developer's working index/branch: unfinished application code stays local.
$ErrorActionPreference = 'Stop'
if (-not $RepoPath) {
    $RepoPath = Split-Path $PSScriptRoot -Parent
}
$taskRoot = (Resolve-Path -LiteralPath $RepoPath).Path
$taskFile = "already-work-$Participant.md"
$taskPath = Join-Path $taskRoot $taskFile
if (-not (Test-Path -LiteralPath $taskPath -PathType Leaf)) {
    throw "Missing work-state file: $taskFile"
}
if ($Watch) {
    # A bounded lease avoids claiming that an abandoned agent is alive forever.
    # The working agent must renew this loop while its task actually continues.
    $taskDeadline = [DateTime]::UtcNow.AddMinutes($LeaseMinutes)
    while ([DateTime]::UtcNow -lt $taskDeadline) {
        $taskWatchText = [System.IO.File]::ReadAllText($taskPath)
        if ($taskWatchText -notmatch '(?m)^status: active\s*$') { return }
        & $PSCommandPath -Participant $Participant -RepoPath $taskRoot
        Start-Sleep -Seconds 60
    }
    Write-Output 'Heartbeat lease ended; renew only if the agent is still working.'
    return
}
$taskText = [System.IO.File]::ReadAllText($taskPath)
if ($taskText -notmatch "(?m)^participant: $Participant\s*$") {
    throw 'Participant field does not match the requested publisher.'
}
if ($taskText -notmatch '(?m)^status: (active|paused|blocked|idle|completed|unknown)\s*$') {
    throw 'Missing or unsupported status.'
}
if (-not $NoTimestampRefresh) {
    if ($taskText -notmatch '(?m)^updated_at_utc: .+$') {
        throw 'Missing updated_at_utc field.'
    }
    $taskStamp = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
    $taskText = [regex]::Replace($taskText, '(?m)^updated_at_utc: [^\r\n]+', "updated_at_utc: $taskStamp")
    [System.IO.File]::WriteAllText($taskPath, $taskText, [System.Text.UTF8Encoding]::new($false))
}

function Invoke-WorkGit {
    param([string[]]$GitArguments)
    $taskResult = & git -C $taskRoot @GitArguments
    if ($LASTEXITCODE -ne 0) {
        throw "Git step failed: $($GitArguments[0]). Publication not confirmed."
    }
    return $taskResult
}

$taskId = [Guid]::NewGuid().ToString('N')
$taskRef = "refs/notka-work-state/$taskId"
$taskIndex = Join-Path ([System.IO.Path]::GetTempPath()) "notka-work-state-$taskId.index"
$taskPreviousIndex = [Environment]::GetEnvironmentVariable('GIT_INDEX_FILE', 'Process')
try {
    $env:GIT_INDEX_FILE = $taskIndex
    for ($taskAttempt = 1; $taskAttempt -le 3; $taskAttempt++) {
        Invoke-WorkGit @('fetch', '--no-tags', 'origin', "refs/heads/main:$taskRef") | Out-Null
        $taskBase = (Invoke-WorkGit @('rev-parse', $taskRef)).Trim()
        Invoke-WorkGit @('read-tree', $taskBase) | Out-Null
        $taskBlob = (Invoke-WorkGit @('hash-object', '-w', "--path=$taskFile", '--', $taskPath)).Trim()
        Invoke-WorkGit @('update-index', '--add', '--cacheinfo', '100644', $taskBlob, $taskFile) | Out-Null
        $taskTree = (Invoke-WorkGit @('write-tree')).Trim()
        $taskBaseTree = (Invoke-WorkGit @('rev-parse', "$taskBase`^{tree}")).Trim()
        if ($taskTree -eq $taskBaseTree) {
            Write-Output "Work state already published: $taskBase"
            return
        }
        $taskCommit = (Invoke-WorkGit @('commit-tree', $taskTree, '-p', $taskBase, '-m', "coordination: update $Participant work state")).Trim()
        & git -C $taskRoot push origin "${taskCommit}:refs/heads/main"
        if ($LASTEXITCODE -eq 0) {
            Write-Output "Published $taskFile to main: $taskCommit"
            return
        }
        # A concurrent normal push may win. Rebase the one-file snapshot onto
        # the newest remote tree; never force-push or replay application files.
    }
    throw 'Publication failed after three attempts. Warn the user and suspend overlapping work until coordination is visible.'
}
finally {
    [Environment]::SetEnvironmentVariable('GIT_INDEX_FILE', $taskPreviousIndex, 'Process')
    & git -C $taskRoot update-ref -d $taskRef 2>$null
    if (Test-Path -LiteralPath $taskIndex) {
        Remove-Item -LiteralPath $taskIndex -Force
    }
    if (Test-Path -LiteralPath "$taskIndex.lock") {
        Remove-Item -LiteralPath "$taskIndex.lock" -Force
    }
}
