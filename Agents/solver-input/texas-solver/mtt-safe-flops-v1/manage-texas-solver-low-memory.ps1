param(
  [ValidateSet("Install", "Status", "Stop", "Uninstall")]
  [string]$Action = "Status",
  [string]$TaskName = "PKRTrainer-TexasSolver-LowMemory",
  [int]$RepetitionMinutes = 15,
  [switch]$StartNow,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path
$Worker = Join-Path $PSScriptRoot "run-texas-solver-low-memory.ps1"
$CurrentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$PowerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Worker`""
$StatusMinimumFreeMemoryPercent = 35
$StatusMaximumCpuPercent = 40
$AccuracyRecoveryReportPath = Join-Path $RepoRoot "artifacts\texas-solver-low-memory\accuracy-recovery-latest.json"

function Get-Workers { return @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -ieq "powershell.exe" -and $_.CommandLine -match [regex]::Escape($Worker) }) }
function Get-ResourceSnapshot {
  $operatingSystem = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
  $processors = @(Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue)
  $solverProcesses = @(Get-Process -Name "console_solver" -ErrorAction SilentlyContinue)
  $cpuPercent = if ($processors.Count) {
    [math]::Round([double](($processors | Measure-Object -Property LoadPercentage -Average).Average), 1)
  } else { $null }
  $freeMemoryPercent = if ($null -ne $operatingSystem -and [double]$operatingSystem.TotalVisibleMemorySize -gt 0) {
    [math]::Round(100 * [double]$operatingSystem.FreePhysicalMemory / [double]$operatingSystem.TotalVisibleMemorySize, 1)
  } else { $null }
  return [pscustomobject]@{
    CpuPercent = $cpuPercent
    FreeMemoryPercent = $freeMemoryPercent
    SolverProcesses = $solverProcesses
  }
}
function Get-ExecutionState($Workers, $Resources, $TaskState) {
  if ($Resources.SolverProcesses.Count -gt 0) { return "SOLVING" }
  if ($Workers.Count -gt 0) {
    $blockedBy = @()
    if ($null -ne $Resources.CpuPercent -and $Resources.CpuPercent -gt $StatusMaximumCpuPercent) { $blockedBy += "CPU" }
    if ($null -ne $Resources.FreeMemoryPercent -and $Resources.FreeMemoryPercent -lt $StatusMinimumFreeMemoryPercent) { $blockedBy += "RAM" }
    if ($blockedBy.Count -gt 0) { return "WAITING_FOR_RESOURCES ($($blockedBy -join '+'))" }
    return "STARTING_OR_SCANNING_CHECKPOINTS"
  }
  if ($TaskState -eq "Running") { return "TASK_STARTING" }
  return "IDLE"
}
function Get-LatestSolverActivity {
  $artifactsDir = Join-Path $RepoRoot "artifacts\texas-solver-low-memory"
  if (-not (Test-Path -LiteralPath $artifactsDir)) { return $null }
  $log = Get-ChildItem -LiteralPath $artifactsDir -Filter "worker-*.log" -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($null -eq $log) { return $null }
  $begin = Get-Content -LiteralPath $log.FullName -Tail 2000 -ErrorAction SilentlyContinue |
    Where-Object { $_ -match "PKRTRAINER_SOLVER_BEGIN" } | Select-Object -Last 1
  return [pscustomobject]@{ Log = $log.FullName; Begin = $begin }
}
function Get-SolverFailureSummary {
  $failureReport = Join-Path $RepoRoot "artifacts\texas-solver-low-memory\solver-failures.ndjson"
  if (-not (Test-Path -LiteralPath $failureReport)) {
    return [pscustomobject]@{ Count = 0; Latest = $null }
  }
  $entries = @(
    Get-Content -LiteralPath $failureReport -ErrorAction SilentlyContinue |
      Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
      ForEach-Object {
        try { $_ | ConvertFrom-Json } catch { $null }
      } |
      Where-Object { $null -ne $_ -and -not [string]::IsNullOrWhiteSpace([string]$_.occurredAt) }
  )
  $latest = @($entries | Sort-Object { [datetime]$_.occurredAt } -Descending | Select-Object -First 1)[0]
  return [pscustomobject]@{ Count = $entries.Count; Latest = $latest }
}
function Show-AccuracyRecovery {
  if (-not (Test-Path -LiteralPath $AccuracyRecoveryReportPath)) {
    Write-Host "accuracy recovery: not prepared"
    return
  }
  try {
    $report = Get-Content -LiteralPath $AccuracyRecoveryReportPath -Raw | ConvertFrom-Json
    if ($report.recoveryOnly -ne $true -or $null -eq $report.counts) { throw "Unsupported recovery report." }
    Write-Host ("accuracy recovery: valid={0}, parsed={1}/{2}, pending={3}, families={4}, files={5}, generated={6}" -f `
      $report.valid, $report.counts.parsedLogs, $report.counts.expectedLogs, `
      $report.counts.pendingLogs, $report.counts.recoveryFamilies, `
      $report.counts.recoveryFiles, $report.generatedAt)
  } catch {
    Write-Host "accuracy recovery: unreadable ($($_.Exception.Message))"
  }
}
function Show-Status {
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  $workers = @(Get-Workers)
  if ($null -eq $task) { Write-Host "Low-memory TexasSolver task is not installed: $TaskName"; return $false }
  $info = Get-ScheduledTaskInfo -TaskName $TaskName
  $result = if ($task.State -eq "Running") {
    "RUNNING (raw task code $($info.LastTaskResult); repeated triggers are ignored while the worker owns the queue)"
  } elseif ($info.LastTaskResult -eq 0) {
    "SUCCESS (0)"
  } else {
    "$($info.LastTaskResult)"
  }
  $resources = Get-ResourceSnapshot
  $executionState = Get-ExecutionState $workers $resources $task.State
  Write-Host "Low-memory TexasSolver task"
  Write-Host "name: $TaskName"
  Write-Host "state: $($task.State)"
  Write-Host "last run: $($info.LastRunTime)"
  Write-Host "last result: $result"
  Write-Host "worker PIDs: $(if ($workers.Count) { $workers.ProcessId -join ',' } else { 'none' })"
  Write-Host "solver PIDs: $(if ($resources.SolverProcesses.Count) { $resources.SolverProcesses.Id -join ',' } else { 'none' })"
  Write-Host "resources: CPU $(if ($null -eq $resources.CpuPercent) { 'unknown' } else { "$($resources.CpuPercent)%" }) (start <= $StatusMaximumCpuPercent%); free RAM $(if ($null -eq $resources.FreeMemoryPercent) { 'unknown' } else { "$($resources.FreeMemoryPercent)%" }) (start >= $StatusMinimumFreeMemoryPercent%)"
  Write-Host "execution state: $executionState"
  Write-Host "worker: $Worker"
  Show-AccuracyRecovery
  $activity = Get-LatestSolverActivity
  if ($null -ne $activity) {
    Write-Host "latest worker log: $($activity.Log)"
    $activityLabel = if ($resources.SolverProcesses.Count -gt 0) { "active parameter" } else { "latest solver begin" }
    Write-Host "${activityLabel}: $(if ([string]::IsNullOrWhiteSpace($activity.Begin)) { 'none recorded in recent log tail' } else { $activity.Begin })"
  }
  $failures = Get-SolverFailureSummary
  if ($failures.Count -eq 0) {
    Write-Host "solver failures: none recorded"
  } else {
    $latest = $failures.Latest
    Write-Host "solver failures: $($failures.Count) recorded; latest $($latest.occurredAt) parameter=$($latest.parameter) family=$($latest.familyId) exit=$($latest.exitCode)"
  }
  return $true
}

if (-not (Test-Path -LiteralPath $Worker)) { throw "Low-memory TexasSolver worker not found: $Worker" }
if ($Action -eq "Status") { if ($DryRun) { Write-Host "Dry run status: task=$TaskName, worker=$Worker"; exit 0 }; exit $(if (Show-Status) { 0 } else { 1 }) }
if ($Action -eq "Stop") {
  if ($DryRun) { Write-Host "Dry run stop: task=$TaskName"; exit 0 }
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($null -ne $task -and $task.State -eq "Running") { Stop-ScheduledTask -TaskName $TaskName }
  foreach ($worker in @(Get-Workers)) { Stop-Process -Id ([int]$worker.ProcessId) -Force -ErrorAction SilentlyContinue }
  Write-Host "Stopped low-memory TexasSolver task and worker."
  exit 0
}
if ($Action -eq "Uninstall") {
  if ($DryRun) { Write-Host "Dry run uninstall: task=$TaskName"; exit 0 }
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($null -ne $task) { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false }
  Write-Host "Removed low-memory TexasSolver task: $TaskName"
  exit 0
}

$taskAction = New-ScheduledTaskAction -Execute $PowerShell -Argument $Arguments -WorkingDirectory $RepoRoot
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $CurrentUser
$recurringTrigger = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(1)) `
  -RepetitionInterval (New-TimeSpan -Minutes $RepetitionMinutes) `
  -RepetitionDuration (New-TimeSpan -Days 3650)
$principal = New-ScheduledTaskPrincipal -UserId $CurrentUser -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$task = New-ScheduledTask -Action $taskAction -Trigger @($logonTrigger, $recurringTrigger) -Principal $principal -Settings $settings -Description "Run the PKRTrainer resource-balanced TexasSolver LOW/MID-SPR review batch at sign-in and every 15 minutes."
if ($DryRun) { Write-Host "Dry run install: task=$TaskName"; Write-Host "arguments: $Arguments"; Write-Host "repeat every: $RepetitionMinutes minutes"; exit 0 }
Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null
Write-Host "Installed low-memory TexasSolver task: $TaskName"
if ($StartNow) { Start-ScheduledTask -TaskName $TaskName; Start-Sleep -Seconds 2; Write-Host "Started low-memory TexasSolver task now." }
Show-Status | Out-Null
