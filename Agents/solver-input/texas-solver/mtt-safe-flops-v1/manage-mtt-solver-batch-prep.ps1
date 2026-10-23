param(
  [ValidateSet("Install", "Status", "Stop", "Uninstall")]
  [string]$Action = "Status",
  [switch]$StartNow,
  [switch]$DryRun,
  [string]$TaskName = "PKRTrainer-MTT-Solver-Batch-Prep"
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path
$Cycle = Join-Path $PSScriptRoot "run-mtt-solver-batch-prep-cycle.ps1"
$PowerShell = (Get-Command powershell.exe -ErrorAction Stop).Source
$CurrentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$PreparedWaves = @(
  [pscustomobject]@{
    Name = "beta-min"
    ManifestPath = Join-Path $PSScriptRoot "coverage-beta-min-board-review-v1-manifest.json"
    State = "APPROVED_WORKER_PHASE"
  },
  [pscustomobject]@{
    Name = "beta-depth"
    ManifestPath = Join-Path $PSScriptRoot "coverage-beta-depth-board-review-v1-manifest.json"
    State = "AUTHORIZED_REVIEW_ONLY_WORKER_PHASE"
  }
)

function Get-CycleProcesses {
  @(Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" | Where-Object {
    $_.CommandLine -and $_.CommandLine -like "*run-mtt-solver-batch-prep-cycle.ps1*"
  })
}

function Show-PreparedWaveStatus {
  foreach ($wave in $PreparedWaves) {
    if (-not (Test-Path -LiteralPath $wave.ManifestPath)) {
      Write-Host "source wave $($wave.Name): manifest missing, state=$($wave.State)"
      continue
    }
    try {
      $manifest = Get-Content -LiteralPath $wave.ManifestPath -Raw | ConvertFrom-Json
      $files = @($manifest.files)
      $present = @($files | Where-Object {
        $_.path -and (Test-Path -LiteralPath (Join-Path $RepoRoot (([string]$_.path) -replace '/', '\\')))
      }).Count
      Write-Host "source wave $($wave.Name): inputs $present/$($files.Count), state=$($wave.State)"
    } catch {
      Write-Host "source wave $($wave.Name): unreadable manifest, state=$($wave.State)"
    }
  }
}

function Show-TaskStatus {
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($null -eq $task) {
    Write-Host "MTT solver-batch prep task is not installed: $TaskName"
    Show-PreparedWaveStatus
    return
  }
  $info = $task | Get-ScheduledTaskInfo
  Write-Host "MTT solver-batch prep task"
  Write-Host "name: $TaskName"
  Write-Host "state: $($task.State)"
  Write-Host "last run: $($info.LastRunTime)"
  Write-Host ("last result: {0} (0x{1:X8})" -f $info.LastTaskResult, [uint32]$info.LastTaskResult)
  $pids = @(Get-CycleProcesses | ForEach-Object ProcessId)
  Write-Host ("prep PIDs: " + ($(if ($pids.Count) { $pids -join ', ' } else { 'none' })))
  Show-PreparedWaveStatus
}

if ($Action -eq "Status") { Show-TaskStatus; exit 0 }
if ($Action -eq "Stop") {
  if ($DryRun) { Write-Host "Dry run stop: task=$TaskName"; exit 0 }
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Get-CycleProcesses | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Write-Host "Stopped MTT solver-batch prep task and managed prep processes."
  exit 0
}
if ($Action -eq "Uninstall") {
  if ($DryRun) { Write-Host "Dry run uninstall: task=$TaskName"; exit 0 }
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Removed MTT solver-batch prep task: $TaskName"
  exit 0
}

if (-not (Test-Path -LiteralPath $Cycle)) { throw "MTT solver-batch prep script not found: $Cycle" }
$arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Cycle`""
if ($DryRun) {
  Write-Host "Dry run install: task=$TaskName"
  Write-Host "execute: $PowerShell"
  Write-Host "arguments: $arguments"
  exit 0
}
$taskAction = New-ScheduledTaskAction -Execute $PowerShell -Argument $arguments -WorkingDirectory $RepoRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $CurrentUser
$principal = New-ScheduledTaskPrincipal -UserId $CurrentUser -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$task = New-ScheduledTask -Action $taskAction -Trigger $trigger -Principal $principal -Settings $settings -Description "Prepares and audits the isolated 45-board beta-minimum and owner-authorized 83-board beta-depth TexasSolver review-only waves."
Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null
Write-Host "Installed MTT solver-batch prep task: $TaskName"
if ($StartNow) { Start-ScheduledTask -TaskName $TaskName; Start-Sleep -Seconds 2; Write-Host "Started MTT solver-batch prep task now." }
Show-TaskStatus
