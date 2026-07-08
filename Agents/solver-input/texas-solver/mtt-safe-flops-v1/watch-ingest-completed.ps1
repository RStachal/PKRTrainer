param(
  [string]$Manifest = ".\Agents\solver-input\texas-solver\mtt-safe-flops-v1\coverage-srp-facing-bet-v1-manifest.json",
  [string]$RepoRoot = "",
  [int]$IntervalSeconds = 300,
  [int]$MaxMinutes = 720,
  [switch]$Once
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path
} else {
  $RepoRoot = (Resolve-Path $RepoRoot).Path
}

if ([System.IO.Path]::IsPathRooted($Manifest)) {
  $ManifestPath = $Manifest
} else {
  $RelativeManifest = $Manifest -replace '^[.][\\/]', ''
  $ManifestPath = Join-Path $RepoRoot $RelativeManifest
}
$Manifest = (Resolve-Path -LiteralPath $ManifestPath).Path
$ArtifactsDir = Join-Path $RepoRoot "artifacts\texas-solver-background"
New-Item -ItemType Directory -Force -Path $ArtifactsDir | Out-Null

$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$StatusPath = Join-Path $ArtifactsDir "watch-ingest-status-$Stamp.json"
$LogPath = Join-Path $ArtifactsDir "watch-ingest-$Stamp.log"
$Deadline = (Get-Date).AddMinutes($MaxMinutes)
Set-Content -LiteralPath $LogPath -Value @() -Encoding UTF8

function Write-WatchLog($Message) {
  if ($null -eq $Message) {
    return
  }
  $Text = ($Message | Out-String).TrimEnd()
  if ([string]::IsNullOrWhiteSpace($Text)) {
    return
  }
  $Line = "[{0}] {1}" -f (Get-Date -Format "s"), $Text
  [System.IO.File]::AppendAllText($LogPath, "$Line`r`n", [System.Text.Encoding]::UTF8)
  Write-Output $Line
}

Push-Location $RepoRoot
try {
  Write-WatchLog "Watching manifest: $Manifest"
  do {
    npm run mtt:texas-solver-coverage-status -- --manifest "$Manifest" --json --output "$StatusPath" | Out-Null
    $Status = Get-Content -LiteralPath $StatusPath -Raw | ConvertFrom-Json
    Write-WatchLog ("coverage solved={0}/{1} rawComplete={2}/{3} complete={4}" -f `
      $Status.counts.solvedBoards, `
      $Status.counts.expectedBoards, `
      $Status.counts.rawComplete, `
      $Status.counts.families, `
      $Status.complete)

    npm run mtt:texas-solver-ingest-completed -- --manifest "$Manifest" --summary 2>&1 |
      ForEach-Object { Write-WatchLog ([string]$_) }

    if ($Status.complete -eq $true) {
      Write-WatchLog "Coverage complete; watcher finished."
      break
    }
    if ($Once) {
      Write-WatchLog "Once mode; watcher finished."
      break
    }
    Start-Sleep -Seconds $IntervalSeconds
  } while ((Get-Date) -lt $Deadline)

  if ((Get-Date) -ge $Deadline) {
    Write-WatchLog "Watcher deadline reached before complete coverage."
  }
} finally {
  Pop-Location
}
