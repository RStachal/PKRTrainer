param(
  [ValidateSet("Install", "Status", "Stop", "Uninstall")]
  [string]$Action = "Status",
  [string]$TaskName = "PKRTrainer-MTT-Task-Agent-10m",
  [ValidateRange(1, 1440)]
  [int]$RepetitionMinutes = 10,
  [ValidateRange(20, 90)]
  [int]$MinimumFreeMemoryPercent = 35,
  [ValidateRange(1, 100)]
  [int]$MaximumCpuPercent = 40,
  [switch]$StartNow,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path
$Cycle = Join-Path $PSScriptRoot "run-mtt-autonomous-cycle.ps1"
$LatestSummaryPath = Join-Path $RepoRoot "artifacts\mtt-autonomous-cycle\latest-cycle-summary.json"
$CurrentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$PowerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Cycle`" -Once -IntervalMinutes $RepetitionMinutes -MinimumFreeMemoryPercent $MinimumFreeMemoryPercent -MaximumCpuPercent $MaximumCpuPercent"
$PreviousTaskNames = @("PKRTrainer-MTT-Task-Agent-15m")

function Get-CycleProcesses {
  return @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -ieq "powershell.exe" -and
    -not [string]::IsNullOrWhiteSpace($_.CommandLine) -and
    $_.CommandLine -match [regex]::Escape($Cycle)
  })
}

function Show-LatestCycleSummary {
  if (-not (Test-Path -LiteralPath $LatestSummaryPath)) {
    Write-Host "coverage snapshot: not yet written"
    return
  }
  try {
    $summary = Get-Content -LiteralPath $LatestSummaryPath -Raw | ConvertFrom-Json
    if ($summary.schemaVersion -ne 1 -or $null -eq $summary.manifests) { throw "Unsupported summary format." }
    Write-Host "coverage snapshot: $($summary.generatedAt) source-safe=$($summary.sourceSafe)"
    foreach ($manifest in @($summary.manifests)) {
      Write-Host ("coverage: {0} {1}/{2}, raw-complete families {3}/{4}, complete={5}, profile={6}" -f `
        $manifest.packId, $manifest.solvedBoards, $manifest.expectedBoards, `
        $manifest.rawCompleteFamilies, $manifest.totalFamilies, $manifest.complete, $manifest.reviewOnlyTreeProfile)
    }
    if ($null -ne $summary.boardCatalog) {
      Write-Host ("Declared board catalog: valid={0}, boards={1}, family/board pairs={2}, family shape={3}/{4}, cohorts={5}, beta-min gap={6}/{7}, beta-depth gap={8}/{9}, exit={10}" -f `
        $summary.boardCatalog.valid, $summary.boardCatalog.uniqueBoards, `
        $summary.boardCatalog.uniqueFamilyBoardPairs, $summary.boardCatalog.declaredBetaShapeFamilies, `
        $summary.boardCatalog.families, $summary.boardCatalog.cohorts, `
        $summary.boardCatalog.betaMinimumGap, $summary.boardCatalog.betaMinimumTarget, `
        $summary.boardCatalog.betaDepthGap, $summary.boardCatalog.betaDepthTarget, `
        $summary.boardCatalog.exitCode)
    }
    if ($null -ne $summary.p1) {
      Write-Host ("P1 intake: ready={0}, waiting={1}, missing normalized={2}, missing permission={3}, validation exit={4}" -f `
        $summary.p1.readyRows, $summary.p1.waitingRows, $summary.p1.missingNormalized, `
        $summary.p1.missingPermission, $summary.p1.validationExitCode)
    }
    if ($null -ne $summary.review) {
      Write-Host ("TexasSolver review: ready={0}/{1}, needs review={2}, blockers={3}, warnings={4}, exit={5}" -f `
        $summary.review.protocolReady, $summary.review.families, $summary.review.needsReview, `
        $summary.review.blockers, $summary.review.warnings, $summary.review.exitCode)
    }
    if ($null -ne $summary.reviewOnlyEvidence) {
      Write-Host ("Review-only evidence: eligible={0}, reports={1}, refreshed={2}, failures={3}, viewer={4}" -f `
        $summary.reviewOnlyEvidence.eligibleFamilies, $summary.reviewOnlyEvidence.reports, `
        $summary.reviewOnlyEvidence.refreshed, $summary.reviewOnlyEvidence.failures, `
        $summary.reviewOnlyEvidence.viewerPath)
    }
    if ($null -ne $summary.coreGate) {
      Write-Host ("Core gate: evaluated={0}, exit={1}, coverage signature persisted={2}" -f `
        $summary.coreGate.evaluated, $summary.coreGate.exitCode, $summary.coreGate.signaturePersisted)
    }
  } catch {
    Write-Host "coverage snapshot: unreadable ($($_.Exception.Message))"
  }
}

function Show-TaskStatus {
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($null -eq $task) {
    Write-Host "MTT autonomous cycle task is not installed: $TaskName"
    return $false
  }
  $info = Get-ScheduledTaskInfo -TaskName $TaskName
  $processes = @(Get-CycleProcesses)
  Write-Host "MTT autonomous cycle task"
  Write-Host "name: $TaskName"
  Write-Host "state: $($task.State)"
  Write-Host "last run: $($info.LastRunTime)"
  Write-Host "last result: $($info.LastTaskResult)"
  Write-Host "cycle PIDs: $(if ($processes.Count) { $processes.ProcessId -join ',' } else { 'none' })"
  Write-Host "cycle: $Cycle"
  Show-LatestCycleSummary
  return $true
}

if (-not (Test-Path -LiteralPath $Cycle)) {
  throw "MTT autonomous cycle script not found: $Cycle"
}

if ($Action -eq "Status") {
  if ($DryRun) {
    Write-Host "Dry run status: task=$TaskName, cycle=$Cycle, user=$CurrentUser"
    exit 0
  }
  $exists = Show-TaskStatus
  exit $(if ($exists) { 0 } else { 1 })
}

if ($Action -eq "Stop") {
  if ($DryRun) {
    Write-Host "Dry run stop: task=$TaskName"
    exit 0
  }
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($null -ne $task -and $task.State -eq "Running") {
    Stop-ScheduledTask -TaskName $TaskName
  }
  foreach ($process in @(Get-CycleProcesses)) {
    Stop-Process -Id ([int]$process.ProcessId) -Force -ErrorAction SilentlyContinue
  }
  Write-Host "Stopped MTT autonomous cycle task and managed cycle processes."
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
  }
  Write-Host "Removed MTT autonomous cycle task: $TaskName"
  exit 0
}

$description = "Run safe PKRTrainer MTT coverage, canonical-board, review-only evidence, intake-packet and Core-gate cycles after Windows sign-in without VS Code."
if ($DryRun) {
  Write-Host "Dry run install: task=$TaskName"
  Write-Host "user: $CurrentUser"
  Write-Host "execute: $PowerShell"
  Write-Host "arguments: $Arguments"
  Write-Host "working directory: $RepoRoot"
  exit 0
}

$taskAction = New-ScheduledTaskAction -Execute $PowerShell -Argument $Arguments -WorkingDirectory $RepoRoot
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $CurrentUser
$recurringTrigger = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(1)) `
  -RepetitionInterval (New-TimeSpan -Minutes $RepetitionMinutes) `
  -RepetitionDuration (New-TimeSpan -Days 3650)
$principal = New-ScheduledTaskPrincipal -UserId $CurrentUser -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 5) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew
$task = New-ScheduledTask -Action $taskAction -Trigger @($logonTrigger, $recurringTrigger) -Principal $principal -Settings $settings -Description $description

# The renamed schedule replaces the previous 15-minute task. The worker mutex
# remains the authoritative preflight for a live iteration.
foreach ($previousTaskName in $PreviousTaskNames) {
  if ($previousTaskName -eq $TaskName) { continue }
  $previousTask = Get-ScheduledTask -TaskName $previousTaskName -ErrorAction SilentlyContinue
  if ($null -ne $previousTask) {
    if ($previousTask.State -eq "Running") {
      Stop-ScheduledTask -TaskName $previousTaskName -ErrorAction SilentlyContinue
    }
    Unregister-ScheduledTask -TaskName $previousTaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Removed superseded MTT task: $previousTaskName"
  }
}

Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null
Write-Host "Installed MTT autonomous cycle task: $TaskName"
if ($StartNow) {
  Start-ScheduledTask -TaskName $TaskName
  Start-Sleep -Seconds 2
  Write-Host "Started MTT autonomous cycle task now."
}
Show-TaskStatus | Out-Null
