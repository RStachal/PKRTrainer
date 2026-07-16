param(
  [Parameter(Mandatory = $true)]
  [string]$ParameterRoot,
  [string]$Manifest = "",
  [int]$Limit = 999,
  [string]$Family = "",
  [ValidateRange(0, 100)]
  [int]$MinimumFreeMemoryPercent = 10,
  [ValidateRange(1, 100)]
  [int]$MaximumCpuPercent = 100,
  [ValidateSet("Idle", "BelowNormal", "Normal", "AboveNormal")]
  [string]$ProcessPriority = "Normal",
  [switch]$ContinueOnSolverFailure,
  [string]$FailureReportPath = "",
  [ValidateRange(0, 50)]
  [int]$StopBelowFreeMemoryPercent = 0,
  [ValidateRange(1, 43200)]
  [int]$ResourceGuardMaxMinutes = 10080,
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
$ResourceGuard = Join-Path $PSScriptRoot "watch-texas-solver-resource-guard.ps1"
$ArtifactsDir = Join-Path $RepoRoot "artifacts\texas-solver-background"
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$SafeLogName = $LogName -replace '[^a-zA-Z0-9._-]', '-'
$RunScript = Join-Path $ArtifactsDir "$SafeLogName-$Stamp.run.ps1"
$OutLog = Join-Path $ArtifactsDir "$SafeLogName-$Stamp.out.log"
$ErrLog = Join-Path $ArtifactsDir "$SafeLogName-$Stamp.err.log"
$GuardLog = Join-Path $ArtifactsDir "$SafeLogName-$Stamp.resource-guard.log"

function Quote-PowerShellLiteral([string]$Value) {
  return "'" + ($Value -replace "'", "''") + "'"
}

if (-not (Test-Path -LiteralPath $Runner)) {
  throw "TexasSolver runner not found: $Runner"
}
if (-not (Test-Path -LiteralPath $ParameterRoot)) {
  throw "Parameter root not found: $ParameterRoot"
}
if ($StopBelowFreeMemoryPercent -gt 0 -and $StopBelowFreeMemoryPercent -lt 10) {
  throw "StopBelowFreeMemoryPercent must be 0 (disabled) or between 10 and 50."
}
if ($StopBelowFreeMemoryPercent -gt 0 -and -not (Test-Path -LiteralPath $ResourceGuard)) {
  throw "TexasSolver resource guard not found: $ResourceGuard"
}
if ($StartWatcher -and [string]::IsNullOrWhiteSpace($Manifest)) {
  throw "-StartWatcher requires -Manifest."
}
if (-not [string]::IsNullOrWhiteSpace($Manifest) -and -not (Test-Path -LiteralPath $Manifest)) {
  throw "Manifest not found: $Manifest"
}

New-Item -ItemType Directory -Force -Path $ArtifactsDir | Out-Null

if ($ContinueOnSolverFailure -and [string]::IsNullOrWhiteSpace($FailureReportPath)) {
  $FailureReportPath = Join-Path $ArtifactsDir "solver-failures.ndjson"
}

$runnerArgs = @(
  "-ParameterRoot", (Quote-PowerShellLiteral $ParameterRoot),
  "-Limit", $Limit,
  "-MinimumFreeMemoryPercent", $MinimumFreeMemoryPercent,
  "-MaximumCpuPercent", $MaximumCpuPercent,
  "-ProcessPriority", (Quote-PowerShellLiteral $ProcessPriority)
)
if (-not [string]::IsNullOrWhiteSpace($Family)) {
  $runnerArgs += @("-Family", (Quote-PowerShellLiteral $Family))
}
if ($Force) {
  $runnerArgs += "-Force"
}
if ($ContinueOnSolverFailure) {
  $runnerArgs += "-ContinueOnSolverFailure"
}
if (-not [string]::IsNullOrWhiteSpace($FailureReportPath)) {
  $runnerArgs += @("-FailureReportPath", (Quote-PowerShellLiteral $FailureReportPath))
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
  Write-Host "Start limits: CPU <= $MaximumCpuPercent%, free RAM >= $MinimumFreeMemoryPercent%"
  Write-Host "Process priority: $ProcessPriority"
  Write-Host "Continue on solver failure: $($ContinueOnSolverFailure.IsPresent)"
  if ($StopBelowFreeMemoryPercent -gt 0) {
    Write-Host "Emergency RAM guard: stop below $StopBelowFreeMemoryPercent% free RAM"
    Write-Host "Resource guard log: $GuardLog"
  } else {
    Write-Host "Emergency RAM guard: disabled"
  }
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

if ($StopBelowFreeMemoryPercent -gt 0) {
  $guardProcess = Start-Process `
    -FilePath "powershell.exe" `
    -ArgumentList @(
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      $ResourceGuard,
      "-OwnerProcessId",
      $solverProcess.Id,
      "-StopBelowFreeMemoryPercent",
      $StopBelowFreeMemoryPercent,
      "-MaxMinutes",
      $ResourceGuardMaxMinutes,
      "-LogPath",
      $GuardLog
    ) `
    -WorkingDirectory $RepoRoot `
    -WindowStyle Hidden `
    -PassThru
  Write-Host "Started TexasSolver resource guard."
  Write-Host "Resource guard ProcessId: $($guardProcess.Id)"
  Write-Host "Resource guard log: $GuardLog"
}

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
