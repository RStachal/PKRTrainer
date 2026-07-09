param(
  [Parameter(Mandatory = $true)]
  [string]$ParameterRoot,
  [string]$Manifest = "",
  [int]$Limit = 999,
  [string]$Family = "",
  [switch]$Force,
  [switch]$StartWatcher,
  [int]$WatchIntervalSeconds = 300,
  [int]$WatchMaxMinutes = 720,
  [string]$LogName = "texas-solver-background",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path
$Runner = Join-Path $PSScriptRoot "run-console-selected.ps1"
$Watcher = Join-Path $PSScriptRoot "watch-ingest-completed.ps1"
$ArtifactsDir = Join-Path $RepoRoot "artifacts\texas-solver-background"
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$SafeLogName = $LogName -replace '[^a-zA-Z0-9._-]', '-'
$RunScript = Join-Path $ArtifactsDir "$SafeLogName-$Stamp.run.ps1"
$OutLog = Join-Path $ArtifactsDir "$SafeLogName-$Stamp.out.log"
$ErrLog = Join-Path $ArtifactsDir "$SafeLogName-$Stamp.err.log"

function Quote-PowerShellLiteral([string]$Value) {
  return "'" + ($Value -replace "'", "''") + "'"
}

if (-not (Test-Path -LiteralPath $Runner)) {
  throw "TexasSolver runner not found: $Runner"
}
if (-not (Test-Path -LiteralPath $ParameterRoot)) {
  throw "Parameter root not found: $ParameterRoot"
}
if ($StartWatcher -and [string]::IsNullOrWhiteSpace($Manifest)) {
  throw "-StartWatcher requires -Manifest."
}
if (-not [string]::IsNullOrWhiteSpace($Manifest) -and -not (Test-Path -LiteralPath $Manifest)) {
  throw "Manifest not found: $Manifest"
}

New-Item -ItemType Directory -Force -Path $ArtifactsDir | Out-Null

$runnerArgs = @(
  "-ParameterRoot", (Quote-PowerShellLiteral $ParameterRoot),
  "-Limit", $Limit
)
if (-not [string]::IsNullOrWhiteSpace($Family)) {
  $runnerArgs += @("-Family", (Quote-PowerShellLiteral $Family))
}
if ($Force) {
  $runnerArgs += "-Force"
}

$runScriptContent = @"
`$ErrorActionPreference = "Stop"
Set-Location $(Quote-PowerShellLiteral $RepoRoot)
try {
  & $(Quote-PowerShellLiteral $Runner) $($runnerArgs -join " ") *>&1 | Tee-Object -FilePath $(Quote-PowerShellLiteral $OutLog) -Append
} catch {
  `$_.Exception.Message | Tee-Object -FilePath $(Quote-PowerShellLiteral $ErrLog) -Append
  exit 1
}
"@

if ($DryRun) {
  Write-Host "Dry run only; no background process will be started."
  Write-Host "Repo root: $RepoRoot"
  Write-Host "Runner: $Runner"
  Write-Host "Parameter root: $ParameterRoot"
  Write-Host "Run script: $RunScript"
  Write-Host "Output log: $OutLog"
  Write-Host "Error log: $ErrLog"
  if ($StartWatcher) {
    Write-Host "Watcher manifest: $Manifest"
  }
  exit 0
}

Set-Content -LiteralPath $RunScript -Value $runScriptContent -Encoding UTF8

$solverProcess = Start-Process `
  -FilePath "powershell.exe" `
  -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $RunScript) `
  -WorkingDirectory $RepoRoot `
  -WindowStyle Hidden `
  -PassThru

Write-Host "Started TexasSolver background solve."
Write-Host "ProcessId: $($solverProcess.Id)"
Write-Host "Run script: $RunScript"
Write-Host "Output log: $OutLog"
Write-Host "Error log: $ErrLog"

if ($StartWatcher) {
  $watcherProcess = Start-Process `
    -FilePath "powershell.exe" `
    -ArgumentList @(
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      $Watcher,
      "-Manifest",
      $Manifest,
      "-IntervalSeconds",
      $WatchIntervalSeconds,
      "-MaxMinutes",
      $WatchMaxMinutes
    ) `
    -WorkingDirectory $RepoRoot `
    -WindowStyle Hidden `
    -PassThru
  Write-Host "Started TexasSolver ingest watcher."
  Write-Host "Watcher ProcessId: $($watcherProcess.Id)"
}

Write-Host "Status command:"
if ([string]::IsNullOrWhiteSpace($Manifest)) {
  Write-Host "npm run mtt:texas-solver-coverage-overview -- --summary"
} else {
  Write-Host "npm run mtt:texas-solver-background-status -- --manifest `"$Manifest`" --summary"
}
