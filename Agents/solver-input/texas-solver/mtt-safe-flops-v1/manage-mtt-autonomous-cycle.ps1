param(
  [ValidateSet("Install", "Ensure", "Status", "Stop", "Uninstall")]
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
$CycleArtifactsDir = Join-Path $RepoRoot "artifacts\mtt-autonomous-cycle"
$LatestSummaryPath = Join-Path $CycleArtifactsDir "latest-cycle-summary.json"
$ReviewOnlyRefreshPath = Join-Path $RepoRoot "artifacts\texas-solver-review-only-owner-depth\refresh-report.json"
$ActionEvTemplateRefreshPath = Join-Path $RepoRoot "artifacts\mtt-action-ev-intake\refresh-report.json"
$SixMaxWorkbenchRefreshPath = Join-Path $RepoRoot "artifacts\mtt-sixmax-preflop-intake\workbench-refresh-report.json"
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
    $generatedAt = [DateTimeOffset]::Parse([string]$summary.generatedAt).ToUniversalTime()
    $ageMinutes = [Math]::Max(0, [Math]::Round(([DateTimeOffset]::UtcNow - $generatedAt).TotalMinutes, 1))
    $staleAfterMinutes = [Math]::Max(30, $RepetitionMinutes * 3)
    $freshness = if ($ageMinutes -gt $staleAfterMinutes) { "STALE" } else { "CURRENT" }
    $freshnessSuffix = if ($freshness -eq "STALE") { " (live checkpoints may be newer)" } else { "" }
    Write-Host ("snapshot freshness: {0} age={1}m threshold={2}m{3}" -f `
      $freshness, $ageMinutes, $staleAfterMinutes, $freshnessSuffix)
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
    if ($null -ne $summary.sixMaxWorkbench) {
      Write-Host ("Six-max preflop workbench: current={0}, action-EV columns={1}/4, blank={2}, nonblank={3}, refreshed blank={4}, protected stale={5}, exports ready/waiting/invalid={6}/{7}/{8}, generated values={9}, exit={10}" -f `
        $summary.sixMaxWorkbench.current, $summary.sixMaxWorkbench.actionEvReadyScaffolds, `
        $summary.sixMaxWorkbench.blankScaffolds, $summary.sixMaxWorkbench.nonBlankScaffolds, `
        $summary.sixMaxWorkbench.refreshedBlankScaffolds, $summary.sixMaxWorkbench.protectedStaleScaffolds, `
        $summary.sixMaxWorkbench.readyExports, $summary.sixMaxWorkbench.waitingExports, `
        $summary.sixMaxWorkbench.invalidExports, $summary.sixMaxWorkbench.strategyValuesGenerated, `
        $summary.sixMaxWorkbench.exitCode)
      if ($null -ne $summary.sixMaxWorkbench.measurableScaffolds) {
        Write-Host ("Six-max workbench progress: measurable/structural={0}/{1}/4, in progress={2}, rows={3}/{4}, touched={5}, strategy complete/partial={6}/{7}, action-EV complete/partial={8}/{9}, review complete/partial={10}/{11}, source refs={12}, notes edited={13}" -f `
          $summary.sixMaxWorkbench.measurableScaffolds, $summary.sixMaxWorkbench.structurallySafeScaffolds, `
          $summary.sixMaxWorkbench.inProgressScaffolds, $summary.sixMaxWorkbench.parsedRows, `
          $summary.sixMaxWorkbench.expectedRows, $summary.sixMaxWorkbench.contentTouchedRows, `
          $summary.sixMaxWorkbench.strategyCompleteRows, $summary.sixMaxWorkbench.strategyPartialRows, `
          $summary.sixMaxWorkbench.actionEvCompleteRows, $summary.sixMaxWorkbench.actionEvPartialRows, `
          $summary.sixMaxWorkbench.reviewCompleteRows, $summary.sixMaxWorkbench.reviewPartialRows, `
          $summary.sixMaxWorkbench.sourceReferenceRows, $summary.sixMaxWorkbench.notesEditedRows)
      }
    }
    if ($null -ne $summary.review) {
      Write-Host ("TexasSolver review: ready={0}/{1}, needs review={2}, blockers={3}, warnings={4}, exit={5}" -f `
        $summary.review.protocolReady, $summary.review.families, $summary.review.needsReview, `
        $summary.review.blockers, $summary.review.warnings, $summary.review.exitCode)
      Write-Host ("TexasSolver owner dashboard: ready={0}, updated={1}, exit={2}, path={3}" -f `
        $summary.review.viewerReady, $summary.review.viewerUpdatedAt, `
        $summary.review.viewerExitCode, $summary.review.viewerPath)
      Write-Host ("TexasSolver owner template: ready={0}, schema={1}, fingerprints={2}/{3}, selected={4}, updated={5}, exit={6}, path={7}" -f `
        $summary.review.templateReady, $summary.review.templateSchemaVersion, `
        $summary.review.templateFingerprints, $summary.review.templateFamilies, `
        $summary.review.templateSelectedDecisions, $summary.review.templateUpdatedAt, `
        $summary.review.templateExitCode, $summary.review.templatePath)
    }
    if ($null -ne $summary.reviewOnlyEvidence) {
      Write-Host ("Review-only evidence: eligible={0}, reports={1}, refreshed={2}, failures={3}, viewer={4}" -f `
        $summary.reviewOnlyEvidence.eligibleFamilies, $summary.reviewOnlyEvidence.reports, `
        $summary.reviewOnlyEvidence.refreshed, $summary.reviewOnlyEvidence.failures, `
        $summary.reviewOnlyEvidence.viewerPath)
    }
    if ($null -ne $summary.reviewReadiness) {
      Write-Host ("Mechanical readiness: shape={0}/{1}, evidence={2}/{3}, owner ready={4}, production eligible={5}, exit={6}" -f `
        $summary.reviewReadiness.mechanicalShapeReady, $summary.reviewReadiness.families, `
        $summary.reviewReadiness.validEvidenceReports, $summary.reviewReadiness.evidenceReports, `
        $summary.reviewReadiness.ownerProtocolReady, $summary.reviewReadiness.productionEligible, `
        $summary.reviewReadiness.exitCode)
    }
    if ($null -ne $summary.coreGate) {
      Write-Host ("Core gate: evaluated={0}, exit={1}, coverage signature persisted={2}" -f `
        $summary.coreGate.evaluated, $summary.coreGate.exitCode, $summary.coreGate.signaturePersisted)
    }
  } catch {
    Write-Host "coverage snapshot: unreadable ($($_.Exception.Message))"
  }
}

function Show-LatestReviewOnlyRefresh {
  if (-not (Test-Path -LiteralPath $ReviewOnlyRefreshPath)) {
    Write-Host "incremental review-only intake: not yet written"
    return
  }
  try {
    $report = Get-Content -LiteralPath $ReviewOnlyRefreshPath -Raw | ConvertFrom-Json
    if ($report.schemaVersion -ne 1 -or $null -eq $report.evidenceBoards) {
      throw "Unsupported refresh report format."
    }
    $generatedAt = [DateTimeOffset]::Parse([string]$report.generatedAt).ToUniversalTime()
    $ageMinutes = [Math]::Max(0, [Math]::Round(([DateTimeOffset]::UtcNow - $generatedAt).TotalMinutes, 1))
    $health = if ($report.valid -eq $true -and [int]$report.failures -eq 0) { "VALID" } else { "ATTENTION" }
    $latestRawAtScan = if ($null -ne $report.latestRawWriteAt) { $report.latestRawWriteAt } else { "none" }
    Write-Host ("incremental review-only intake: {0} evidence={1} boards, families={2}, reports={3}, refreshed={4}, failures={5}" -f `
      $health, $report.evidenceBoards, $report.eligibleFamilies, $report.reports, $report.refreshed, $report.failures)
    if ($null -ne $report.accuracyEvidenceBoards) {
      Write-Host ("incremental staged accuracy: evidence={0} boards across {1} families, staged refreshed={2}" -f `
        $report.accuracyEvidenceBoards, $report.accuracyEvidenceFamilies, $report.stagingRefreshed)
    }
    Write-Host ("incremental intake snapshot: generated={0}, age={1}m, latest raw at scan={2} (independent of full cycle snapshot)" -f `
      $report.generatedAt, $ageMinutes, $latestRawAtScan)
    foreach ($coverage in @($report.manifestCoverage)) {
      Write-Host ("incremental coverage: {0} {1}/{2}, raw-complete families {3}/{4}, complete={5}" -f `
        $coverage.packId, $coverage.solvedBoards, $coverage.expectedBoards, `
        $coverage.rawCompleteFamilies, $coverage.families, $coverage.complete)
    }
  } catch {
    Write-Host "incremental review-only intake: unreadable ($($_.Exception.Message))"
  }
}

function Show-LatestSixMaxWorkbenchRefresh {
  if (-not (Test-Path -LiteralPath $SixMaxWorkbenchRefreshPath -PathType Leaf)) {
    Write-Host "Six-max preflop workbench: not yet written"
    return
  }
  try {
    $report = Get-Content -LiteralPath $SixMaxWorkbenchRefreshPath -Raw | ConvertFrom-Json
    if ($null -eq $report.workbenchCounts -or $null -eq $report.counts) {
      throw "Unsupported six-max workbench report format."
    }
    $current = $report.valid -eq $true -and $report.workbenchCurrent -eq $true -and
      $report.strategyValuesGenerated -eq "none" -and
      [int]$report.workbenchCounts.currentScaffolds -eq 4 -and
      [int]$report.workbenchCounts.actionEvReadyScaffolds -eq 4 -and
      [int]$report.workbenchCounts.measurableScaffolds -eq 4 -and
      [int]$report.workbenchCounts.structurallySafeScaffolds -eq 4 -and
      [int]$report.workbenchCounts.parsedRows -eq [int]$report.workbenchCounts.expectedRows -and
      [int]$report.workbenchCounts.protectedStaleScaffolds -eq 0
    $updatedAt = (Get-Item -LiteralPath $SixMaxWorkbenchRefreshPath).LastWriteTimeUtc.ToString("o")
    Write-Host ("Six-max preflop workbench: current={0}, action-EV columns={1}/4, blank={2}, nonblank={3}, refreshed blank={4}, protected stale={5}, exports ready/waiting/invalid={6}/{7}/{8}, generated values={9}, updated={10}" -f `
      $current, $report.workbenchCounts.actionEvReadyScaffolds, $report.workbenchCounts.blankScaffolds, `
      $report.workbenchCounts.nonBlankScaffolds, $report.workbenchCounts.refreshedBlankScaffolds, `
      $report.workbenchCounts.protectedStaleScaffolds, $report.counts.ready, $report.counts.waiting, `
      $report.counts.invalid, $report.strategyValuesGenerated, $updatedAt)
    Write-Host ("Six-max workbench progress: measurable/structural={0}/{1}/4, in progress={2}, rows={3}/{4}, touched={5}, strategy complete/partial={6}/{7}, action-EV complete/partial={8}/{9}, review complete/partial={10}/{11}, source refs={12}, notes edited={13}" -f `
      $report.workbenchCounts.measurableScaffolds, $report.workbenchCounts.structurallySafeScaffolds, `
      $report.workbenchCounts.inProgressScaffolds, $report.workbenchCounts.parsedRows, `
      $report.workbenchCounts.expectedRows, $report.workbenchCounts.contentTouchedRows, `
      $report.workbenchCounts.strategyCompleteRows, $report.workbenchCounts.strategyPartialRows, `
      $report.workbenchCounts.actionEvCompleteRows, $report.workbenchCounts.actionEvPartialRows, `
      $report.workbenchCounts.reviewCompleteRows, $report.workbenchCounts.reviewPartialRows, `
      $report.workbenchCounts.sourceReferenceRows, $report.workbenchCounts.notesEditedRows)
  } catch {
    Write-Host "Six-max preflop workbench: unreadable ($($_.Exception.Message))"
  }
}

function Show-LatestActionEvTemplateRefresh {
  if (-not (Test-Path -LiteralPath $ActionEvTemplateRefreshPath -PathType Leaf)) {
    Write-Host "Action-EV intake templates: not yet written"
    return
  }
  try {
    $report = Get-Content -LiteralPath $ActionEvTemplateRefreshPath -Raw | ConvertFrom-Json
    if ($report.mode -ne "TEMPLATE" -or $null -eq $report.counts) {
      throw "Unsupported action-EV template report format."
    }
    $ready = $report.valid -eq $true -and $report.strategyValues -eq "none" -and
      [int]$report.counts.pilots -gt 0 -and [int]$report.counts.staleTemplates -eq 0 -and
      [int]$report.counts.blankTemplates -eq [int]$report.counts.pilots -and
      [int]$report.counts.nonBlankTemplates -eq 0 -and
      [int]$report.counts.protectedStaleTemplates -eq 0
    $updatedAt = (Get-Item -LiteralPath $ActionEvTemplateRefreshPath).LastWriteTimeUtc.ToString("o")
    Write-Host ("Action-EV intake templates: ready={0}, pilots={1}, decisions={2}, action slots={3}, blank={4}/{5}, nonblank={6}, stale={7}, written={8}, refreshed blank={9}, protected stale={10}, generated values={11}, updated={12}" -f `
      $ready, $report.counts.pilots, $report.counts.decisions, $report.counts.actionValueSlots, `
      $report.counts.blankTemplates, $report.counts.pilots, $report.counts.nonBlankTemplates, `
      $report.counts.staleTemplates, $report.counts.writtenTemplates, `
      $report.counts.refreshedBlankTemplates, $report.counts.protectedStaleTemplates, `
      $report.strategyValues, $updatedAt)
  } catch {
    Write-Host "Action-EV intake templates: unreadable ($($_.Exception.Message))"
  }
}

function Show-LatestCycleOutcome {
  $latestLog = Get-ChildItem -LiteralPath $CycleArtifactsDir -Filter "cycle-*.log" -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1
  if ($null -eq $latestLog) {
    Write-Host "latest cycle outcome: no cycle log"
    return
  }
  $lastLine = Get-Content -LiteralPath $latestLog.FullName -Tail 50 |
    Where-Object { -not [string]::IsNullOrWhiteSpace($_) -and $_ -notmatch 'coverage signature=' } |
    Select-Object -Last 1
  if ($null -ne $lastLine -and $lastLine.Length -gt 360) {
    $lastLine = $lastLine.Substring(0, 357) + "..."
  }
  Write-Host "latest cycle log: $($latestLog.FullName)"
  Write-Host "latest cycle outcome: $(if ($null -ne $lastLine) { $lastLine } else { 'empty log' })"
}

function Show-TaskStatus {
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($null -eq $task) {
    Write-Host "MTT autonomous cycle task is not installed: $TaskName"
    return $false
  }
  $info = Get-ScheduledTaskInfo -TaskName $TaskName
  $processes = @(Get-CycleProcesses)
  $enabled = $task.State -ne "Disabled"
  $nextRun = if ($info.NextRunTime -gt [DateTime]::MinValue) { $info.NextRunTime } else { "none" }
  Write-Host "MTT autonomous cycle task"
  Write-Host "name: $TaskName"
  Write-Host "state: $($task.State)"
  Write-Host "enabled: $($enabled.ToString().ToLowerInvariant())"
  Write-Host "task health: $(if ($enabled) { 'ENABLED' } else { 'DISABLED (run npm run mtt:autonomous-cycle-ensure)' })"
  Write-Host "next run: $nextRun"
  Write-Host "last run: $($info.LastRunTime)"
  Write-Host "last result: $($info.LastTaskResult)"
  Write-Host "cycle PIDs: $(if ($processes.Count) { $processes.ProcessId -join ',' } else { 'none' })"
  Write-Host "cycle: $Cycle"
  Show-LatestCycleOutcome
  Show-LatestReviewOnlyRefresh
  Show-LatestSixMaxWorkbenchRefresh
  Show-LatestActionEvTemplateRefresh
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

if ($Action -eq "Ensure") {
  if ($DryRun) {
    Write-Host "Dry run ensure: task=$TaskName; enable an existing disabled task or install it when missing"
    exit 0
  }
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($null -ne $task) {
    if ($task.State -eq "Disabled") {
      Enable-ScheduledTask -TaskName $TaskName | Out-Null
      Write-Host "Enabled MTT autonomous cycle task: $TaskName"
      Start-Sleep -Milliseconds 250
    } else {
      Write-Host "MTT autonomous cycle task is already enabled: $TaskName"
    }
    $task = Get-ScheduledTask -TaskName $TaskName
    if ($StartNow -and $task.State -ne "Running") {
      Start-ScheduledTask -TaskName $TaskName
      Start-Sleep -Seconds 2
      Write-Host "Started MTT autonomous cycle task now."
    }
    Show-TaskStatus | Out-Null
    exit 0
  }
  Write-Host "MTT autonomous cycle task is missing; installing it: $TaskName"
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
