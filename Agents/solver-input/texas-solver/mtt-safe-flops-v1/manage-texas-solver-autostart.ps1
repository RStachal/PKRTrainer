param(
  [ValidateSet("Install", "Status", "Stop", "Uninstall")]
  [string]$Action = "Status",
  [string]$TaskName = "PKRTrainer-TexasSolver-Autostart",
  [switch]$StartNow,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path
$Worker = Join-Path $PSScriptRoot "resume-texas-solver-queue.ps1"
$Watcher = Join-Path $PSScriptRoot "watch-ingest-completed.ps1"
$CurrentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$PowerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Worker`""

function Show-TaskStatus {
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($null -eq $task) {
    Write-Host "TexasSolver autostart task is not installed: $TaskName"
    return $false
  }
  $info = Get-ScheduledTaskInfo -TaskName $TaskName
  $result = if ($task.State -eq "Running") {
    "RUNNING (raw task code $($info.LastTaskResult); final result is written when the worker exits)"
  } elseif ($info.LastTaskResult -eq 0) {
    "SUCCESS (0)"
  } else {
    "$($info.LastTaskResult)"
  }
  Write-Host "TexasSolver autostart task"
  Write-Host "name: $TaskName"
  Write-Host "state: $($task.State)"
  Write-Host "user: $($task.Principal.UserId)"
  Write-Host "last run: $($info.LastRunTime)"
  Write-Host "last result: $result"
  Write-Host "next run: $($info.NextRunTime)"
  Write-Host "worker: $Worker"
  return $true
}

function Get-ManagedQueueWorkers {
  return @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -ieq "powershell.exe" -and
    -not [string]::IsNullOrWhiteSpace($_.CommandLine) -and
    $_.CommandLine -match [regex]::Escape($Worker)
  })
}

function Get-ManagedWatchers {
  return @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -ieq "powershell.exe" -and
    -not [string]::IsNullOrWhiteSpace($_.CommandLine) -and
    $_.CommandLine -match [regex]::Escape($Watcher)
  })
}

function Get-DescendantProcesses($Parents) {
  $allProcesses = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
  $knownPids = @{}
  foreach ($parent in @($Parents)) {
    $knownPids[[int]$parent.ProcessId] = $true
  }

  $descendants = @()
  $found = $true
  while ($found) {
    $found = $false
    foreach ($process in $allProcesses) {
      $processId = [int]$process.ProcessId
      $parentProcessId = [int]$process.ParentProcessId
      if ($knownPids.ContainsKey($parentProcessId) -and -not $knownPids.ContainsKey($processId)) {
        $knownPids[$processId] = $true
        $descendants += $process
        $found = $true
      }
    }
  }
  return @($descendants)
}

function Format-ManagedProcessIds($Processes) {
  $ids = @($Processes | ForEach-Object { [int]$_.ProcessId } | Sort-Object -Unique)
  if ($ids.Count -eq 0) {
    return "none"
  }
  return ($ids -join ",")
}

function Stop-ManagedQueue {
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  $workers = @(Get-ManagedQueueWorkers)
  $watchers = @(Get-ManagedWatchers)
  $descendants = @(Get-DescendantProcesses $workers)

  if ($DryRun) {
    Write-Host "Dry run stop: task=$TaskName"
    Write-Host "queue worker PIDs: $(Format-ManagedProcessIds $workers)"
    Write-Host "queue descendant PIDs: $(Format-ManagedProcessIds $descendants)"
    Write-Host "watcher PIDs: $(Format-ManagedProcessIds $watchers)"
    return
  }

  if ($null -ne $task -and $task.State -eq "Running") {
    Stop-ScheduledTask -TaskName $TaskName
    Write-Host "Stopped TexasSolver scheduled task: $TaskName"
  }

  # Stop only the known queue process tree and this repository's watcher. Raw
  # checkpoints are never removed, so the queue can resume safely later.
  foreach ($process in @($descendants)) {
    Stop-Process -Id ([int]$process.ProcessId) -Force -ErrorAction SilentlyContinue
  }
  foreach ($process in @($watchers)) {
    Stop-Process -Id ([int]$process.ProcessId) -Force -ErrorAction SilentlyContinue
  }
  foreach ($process in @($workers)) {
    Stop-Process -Id ([int]$process.ProcessId) -Force -ErrorAction SilentlyContinue
  }

  Write-Host "Stopped PKRTrainer queue workers: $(Format-ManagedProcessIds $workers)"
  Write-Host "Stopped PKRTrainer queue descendants: $(Format-ManagedProcessIds $descendants)"
  Write-Host "Stopped PKRTrainer watchers: $(Format-ManagedProcessIds $watchers)"
}

if (-not (Test-Path -LiteralPath $Worker)) {
  throw "TexasSolver queue worker not found: $Worker"
}

if ($Action -eq "Status") {
  if ($DryRun) {
    Write-Host "Dry run status: task=$TaskName, worker=$Worker, user=$CurrentUser"
    exit 0
  }
  $exists = Show-TaskStatus
  exit $(if ($exists) { 0 } else { 1 })
}

if ($Action -eq "Stop") {
  Stop-ManagedQueue
  exit 0
}

if ($Action -eq "Uninstall") {
  if ($DryRun) {
    Write-Host "Dry run uninstall: task=$TaskName"
    exit 0
  }
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($null -ne $task) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed TexasSolver autostart task: $TaskName"
  } else {
    Write-Host "TexasSolver autostart task was already absent: $TaskName"
  }
  exit 0
}

$description = "Resume the PKRTrainer TexasSolver review queue after Windows sign-in without VS Code."
$taskAction = New-ScheduledTaskAction -Execute $PowerShell -Argument $Arguments -WorkingDirectory $RepoRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $CurrentUser
$principal = New-ScheduledTaskPrincipal -UserId $CurrentUser -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 5) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew
$task = New-ScheduledTask -Action $taskAction -Trigger $trigger -Principal $principal -Settings $settings -Description $description

if ($DryRun) {
  Write-Host "Dry run install: task=$TaskName"
  Write-Host "user: $CurrentUser"
  Write-Host "execute: $PowerShell"
  Write-Host "arguments: $Arguments"
  Write-Host "working directory: $RepoRoot"
  exit 0
}

Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null
Write-Host "Installed TexasSolver autostart task: $TaskName"
if ($StartNow) {
  Start-ScheduledTask -TaskName $TaskName
  Start-Sleep -Seconds 2
  Write-Host "Started TexasSolver autostart task now."
}
Show-TaskStatus | Out-Null
