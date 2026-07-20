param(
  [string[]]$Manifest = @(
    ".\Agents\solver-input\texas-solver\mtt-safe-flops-v1\coverage-low-memory-flop-review-v1-manifest.json",
    ".\Agents\solver-input\texas-solver\mtt-safe-flops-v1\coverage-low-memory-followup-flop-review-v1-manifest.json",
    ".\Agents\solver-input\texas-solver\mtt-safe-flops-v1\coverage-low-memory-owner-depth-flop-review-v1-manifest.json",
    ".\Agents\solver-input\texas-solver\mtt-safe-flops-v1\coverage-low-memory-beta-min-board-review-v1-manifest.json",
    ".\Agents\solver-input\texas-solver\mtt-safe-flops-v1\coverage-low-memory-beta-depth-board-review-v1-manifest.json",
    ".\Agents\solver-input\texas-solver\mtt-safe-flops-v1\coverage-low-memory-growth-board-review-v1-manifest.json"
  ),
  [int]$IntervalMinutes = 10,
  [ValidateRange(20, 90)]
  [int]$MinimumFreeMemoryPercent = 35,
  [ValidateRange(1, 100)]
  [int]$MaximumCpuPercent = 40,
  [int]$MaxMinutes = 10080,
  [switch]$Once = $true
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path
$OptionalGeneratedManifestNames = @(
  "coverage-low-memory-flop-review-v1-manifest.json",
  "coverage-low-memory-followup-flop-review-v1-manifest.json",
  "coverage-low-memory-owner-depth-flop-review-v1-manifest.json",
  "coverage-low-memory-beta-min-board-review-v1-manifest.json",
  "coverage-low-memory-beta-depth-board-review-v1-manifest.json",
  "coverage-low-memory-growth-board-review-v1-manifest.json"
)
$ManifestPaths = @($Manifest | ForEach-Object {
  $candidate = if ([System.IO.Path]::IsPathRooted($_)) {
    $_
  } else {
    Join-Path $RepoRoot ($_ -replace '^[.][\\/]', '')
  }
  if (Test-Path -LiteralPath $candidate) {
    (Resolve-Path -LiteralPath $candidate).Path
  } elseif ($OptionalGeneratedManifestNames -notcontains [System.IO.Path]::GetFileName($candidate)) {
    throw "Coverage manifest does not exist: $candidate"
  }
})
if ($ManifestPaths.Count -eq 0) { throw "At least one coverage manifest is required." }
$ArtifactsDir = Join-Path $RepoRoot "artifacts\mtt-autonomous-cycle"
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$LogPath = Join-Path $ArtifactsDir "cycle-$Stamp.log"
$LatestSummaryPath = Join-Path $ArtifactsDir "latest-cycle-summary.json"
$LastCoverageSignaturePath = Join-Path $ArtifactsDir "last-coverage-signature.txt"
$P1ReadyValidationReportPath = Join-Path $ArtifactsDir "p1-ready-intake-$Stamp.json"
$CoreGateReportPath = Join-Path $ArtifactsDir "core-gate-latest.json"
$BoardCatalogReportPath = Join-Path $ArtifactsDir "board-catalog-latest.json"
$ReviewOnlyEvidenceDir = Join-Path $RepoRoot "artifacts\texas-solver-review-only-owner-depth"
$ReviewOnlyEvidenceReportsDir = Join-Path $ReviewOnlyEvidenceDir "reviews"
$ReviewOnlyEvidenceViewerPath = Join-Path $ReviewOnlyEvidenceDir "viewer\index.html"
$ReviewOnlyEvidenceRefreshReportPath = Join-Path $ReviewOnlyEvidenceDir "refresh-report.json"
$ReviewReadinessReportPath = Join-Path $RepoRoot "artifacts\texas-solver-review-readiness\report.json"
$ReviewReadinessMarkdownPath = Join-Path $RepoRoot "artifacts\texas-solver-review-readiness\MECHANICAL_READINESS.md"
$CanonicalReviewReportsDir = Join-Path $RepoRoot "Agents\solver-input\gto-plus\sample-postflop-v1\output\texas-solver"
$OwnerReviewWavesPath = Join-Path $RepoRoot "artifacts\texas-solver-review-protocol\packet\OWNER_REVIEW_WAVES.md"
$OwnerReviewViewerPath = Join-Path $RepoRoot "artifacts\texas-solver-review-protocol\viewer\index.html"
$MutexName = "Local\PKRTrainerMttAutonomousCycleV1"
$Deadline = (Get-Date).AddMinutes($MaxMinutes)
$LastCoverageSignature = if (Test-Path -LiteralPath $LastCoverageSignaturePath) {
  (Get-Content -LiteralPath $LastCoverageSignaturePath -Raw).Trim()
} else {
  ""
}
$Npm = (Get-Command npm.cmd -ErrorAction Stop).Source

New-Item -ItemType Directory -Force -Path $ArtifactsDir | Out-Null
Set-Content -LiteralPath $LogPath -Value @() -Encoding UTF8

function Write-CycleLog([string]$Message) {
  $Line = "[{0}] {1}" -f (Get-Date -Format "s"), $Message
  [System.IO.File]::AppendAllText($LogPath, "$Line`r`n", [System.Text.Encoding]::UTF8)
  Write-Output $Line
}

function Write-LatestCycleSummary($Statuses, [string]$CoverageSignature, $BoardCatalog, $P1, $Review, $ReviewOnlyEvidence, $ReviewReadiness, $CoreGate) {
  $summary = [ordered]@{
    schemaVersion = 1
    generatedAt = (Get-Date -Format "o")
    sourceSafe = $true
    coverageSignature = $CoverageSignature
    boardCatalog = $BoardCatalog
    p1 = $P1
    review = $Review
    reviewOnlyEvidence = $ReviewOnlyEvidence
    reviewReadiness = $ReviewReadiness
    coreGate = $CoreGate
    manifests = @($Statuses | Sort-Object packId | ForEach-Object {
      [ordered]@{
        packId = [string]$_.packId
        solvedBoards = [int]$_.counts.solvedBoards
        expectedBoards = [int]$_.counts.expectedBoards
        rawCompleteFamilies = [int]$_.counts.rawComplete
        totalFamilies = [int]$_.counts.families
        complete = [bool]$_.complete
        reviewOnlyTreeProfile = $_.reviewOnlyTreeProfile
      }
    })
  } | ConvertTo-Json -Depth 6
  [System.IO.File]::WriteAllText($LatestSummaryPath, "$summary`r`n", (New-Object System.Text.UTF8Encoding($false)))
}

function Get-BoardCatalogSummary([int]$ExitCode) {
  $summary = [ordered]@{
    exitCode = $ExitCode
    valid = $false
    coverageBasis = $null
    uniqueBoards = $null
    uniqueFamilyBoardPairs = $null
    families = $null
    declaredBetaShapeFamilies = $null
    cohorts = $null
    betaMinimumTarget = $null
    betaMinimumGap = $null
    betaDepthTarget = $null
    betaDepthGap = $null
  }
  if ($ExitCode -eq 0 -and (Test-Path -LiteralPath $BoardCatalogReportPath -PathType Leaf)) {
    try {
      $report = Get-Content -LiteralPath $BoardCatalogReportPath -Raw | ConvertFrom-Json
      $summary.valid = [bool]$report.valid
      $summary.coverageBasis = [string]$report.coverageBasis
      $summary.uniqueBoards = [int]$report.counts.uniqueBoards
      $summary.uniqueFamilyBoardPairs = [int]$report.counts.uniqueFamilyBoardPairs
      $summary.families = [int]$report.counts.families
      $summary.declaredBetaShapeFamilies = [int]$report.counts.declaredBetaShapeFamilies
      $summary.cohorts = [int]$report.counts.cohorts
      $summary.betaMinimumTarget = [int]$report.counts.betaMinimumTarget
      $summary.betaMinimumGap = [int]$report.counts.betaMinimumGap
      $summary.betaDepthTarget = [int]$report.counts.betaDepthTarget
      $summary.betaDepthGap = [int]$report.counts.betaDepthGap
    } catch { Write-CycleLog "Could not read canonical board catalog summary. $($_.Exception.Message)" | Out-Null }
  }
  return $summary
}

function Get-P1Summary([int]$PacketExitCode, [int]$ValidationExitCode) {
  $summary = [ordered]@{ packetExitCode = $PacketExitCode; validationExitCode = $ValidationExitCode; readyRows = $null; waitingRows = $null; missingNormalized = $null; missingPermission = $null }
  if ($ValidationExitCode -eq 0 -and (Test-Path -LiteralPath $P1ReadyValidationReportPath)) {
    try {
      $report = Get-Content -LiteralPath $P1ReadyValidationReportPath -Raw | ConvertFrom-Json
      $summary.readyRows = [int]$report.counts.readyRows
      $summary.waitingRows = [int]$report.counts.waitingRows
      $summary.missingNormalized = [int]$report.counts.missingNormalized
      $summary.missingPermission = [int]$report.counts.missingPermission
    } catch { Write-CycleLog "Could not read P1 validation summary. $($_.Exception.Message)" | Out-Null }
  }
  return $summary
}

function Get-ReviewSummary([int]$ExitCode, [int]$ViewerExitCode) {
  $summary = [ordered]@{
    exitCode = $ExitCode
    families = $null
    protocolReady = $null
    needsReview = $null
    blockers = $null
    warnings = $null
    viewerExitCode = $ViewerExitCode
    viewerReady = $false
    viewerPath = $OwnerReviewViewerPath
    viewerUpdatedAt = $null
  }
  $reportPath = Join-Path $RepoRoot "artifacts\texas-solver-review-protocol\report.json"
  if (Test-Path -LiteralPath $reportPath) {
    try {
      $report = Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
      $summary.families = [int]$report.counts.families
      $summary.protocolReady = [int]$report.counts.protocolReady
      $summary.needsReview = [int]$report.counts.needsReview
      $summary.blockers = [int]$report.counts.blockers
      $summary.warnings = [int]$report.counts.warnings
    } catch { Write-CycleLog "Could not read TexasSolver review summary. $($_.Exception.Message)" | Out-Null }
  }
  if (Test-Path -LiteralPath $OwnerReviewViewerPath -PathType Leaf) {
    $summary.viewerReady = $ViewerExitCode -eq 0
    $summary.viewerUpdatedAt = (Get-Item -LiteralPath $OwnerReviewViewerPath).LastWriteTimeUtc.ToString("o")
  }
  return $summary
}

function Get-ReviewReadinessSummary([int]$ExitCode) {
  $summary = [ordered]@{
    exitCode = $ExitCode
    valid = $false
    families = $null
    validEvidenceReports = $null
    evidenceReports = $null
    mechanicalShapeReady = $null
    needsMoreEvidence = $null
    ownerProtocolReady = $null
    productionEligible = $null
    reportPath = $ReviewReadinessReportPath
    markdownPath = $ReviewReadinessMarkdownPath
  }
  if (Test-Path -LiteralPath $ReviewReadinessReportPath) {
    try {
      $report = Get-Content -LiteralPath $ReviewReadinessReportPath -Raw | ConvertFrom-Json
      $summary.valid = [bool]$report.valid
      $summary.families = [int]$report.counts.families
      $summary.validEvidenceReports = [int]$report.counts.validEvidenceReports
      $summary.evidenceReports = [int]$report.counts.evidenceReports
      $summary.mechanicalShapeReady = [int]$report.counts.mechanicalShapeReady
      $summary.needsMoreEvidence = [int]$report.counts.needsMoreEvidence
      $summary.ownerProtocolReady = [int]$report.counts.ownerProtocolReady
      $summary.productionEligible = [int]$report.counts.productionEligible
    } catch { Write-CycleLog "Could not read mechanical review-readiness summary. $($_.Exception.Message)" | Out-Null }
  }
  return $summary
}

function Get-CoreSummary([bool]$Evaluated, $ExitCode, [bool]$SignaturePersisted) {
  $summary = [ordered]@{
    evaluated = $Evaluated
    exitCode = $ExitCode
    signaturePersisted = $SignaturePersisted
    actionEv = [ordered]@{
      comparisonReady = $null
      preflopCompleteDecisions = $null
      preflopTotalDecisions = $null
      preflopReadyPacks = $null
      postflopCompleteDecisions = $null
      postflopTotalDecisions = $null
      postflopReadyPacks = $null
    }
  }
  if (Test-Path -LiteralPath $CoreGateReportPath) {
    try {
      $report = Get-Content -LiteralPath $CoreGateReportPath -Raw | ConvertFrom-Json
      if ($null -eq $report.actionEv) { throw "Core report has no actionEv section." }
      $summary.actionEv.comparisonReady = [bool]$report.actionEv.comparisonReady
      $summary.actionEv.preflopCompleteDecisions = [int]$report.actionEv.preflopCompleteDecisions
      $summary.actionEv.preflopTotalDecisions = [int]$report.actionEv.preflopTotalDecisions
      $summary.actionEv.preflopReadyPacks = [int]$report.actionEv.preflopReadyPacks
      $summary.actionEv.postflopCompleteDecisions = [int]$report.actionEv.postflopCompleteDecisions
      $summary.actionEv.postflopTotalDecisions = [int]$report.actionEv.postflopTotalDecisions
      $summary.actionEv.postflopReadyPacks = [int]$report.actionEv.postflopReadyPacks
    } catch { Write-CycleLog "Could not read Core action-EV summary. $($_.Exception.Message)" | Out-Null }
  }
  return $summary
}

function Invoke-LoggedNpm([string]$Label, [string[]]$Arguments) {
  # Keep log output out of this function's success value. Callers compare the
  # result numerically, so leaking Write-CycleLog strings here makes a zero
  # native exit code look like a failed coverage check.
  Write-CycleLog "${Label}: npm $($Arguments -join ' ')" | Out-Null
  # Do not merge native stderr into PowerShell's error stream: vite-node can
  # legitimately return a nonzero state while the cycle must continue safely.
  & $Npm @Arguments | ForEach-Object { Write-CycleLog ([string]$_) | Out-Null }
  $exitCode = $LASTEXITCODE
  Write-CycleLog "${Label} exit code=$exitCode" | Out-Null
  return $exitCode
}

function Update-ReviewOnlyEvidence($Statuses) {
  if (@($Statuses).Count -ne $ManifestPaths.Count) {
    return [ordered]@{
      eligibleFamilies = 0
      evidenceBoards = 0
      reports = 0
      refreshed = 0
      plannedStagingRefresh = 0
      stagingRefreshed = 0
      accuracyEvidenceBoards = 0
      accuracyEvidenceFamilies = 0
      failures = 1
      viewerWritten = $false
      viewerPath = $ReviewOnlyEvidenceViewerPath
    }
  }
  $refreshArgs = @(
    "run", "mtt:texas-solver-review-only-refresh", "--",
    "--reports-dir=$ReviewOnlyEvidenceReportsDir",
    "--viewer-output=$ReviewOnlyEvidenceViewerPath",
    "--output=$ReviewOnlyEvidenceRefreshReportPath",
    "--summary"
  )
  foreach ($manifestPath in $ManifestPaths) { $refreshArgs += "--manifest=$manifestPath" }
  $refreshExit = Invoke-LoggedNpm "cumulative review-only evidence refresh" $refreshArgs
  if ($refreshExit -eq 0 -and (Test-Path -LiteralPath $ReviewOnlyEvidenceRefreshReportPath -PathType Leaf)) {
    try {
      return Get-Content -LiteralPath $ReviewOnlyEvidenceRefreshReportPath -Raw | ConvertFrom-Json
    } catch {
      Write-CycleLog "Review-only refresh report is unreadable; the next cycle will retry. $($_.Exception.Message)" | Out-Null
    }
  }
  if ($refreshExit -ne 0) {
    Write-CycleLog "Review-only refresh failed; ignoring any older successful refresh report and retrying next cycle." | Out-Null
  }
  return [ordered]@{
    eligibleFamilies = 0
    evidenceBoards = 0
    reports = @(Get-ChildItem -LiteralPath $ReviewOnlyEvidenceReportsDir -Filter "*.review.json" -File -ErrorAction SilentlyContinue).Count
    refreshed = 0
    plannedStagingRefresh = 0
    stagingRefreshed = 0
    accuracyEvidenceBoards = 0
    accuracyEvidenceFamilies = 0
    failures = $(if ($refreshExit -eq 0) { 0 } else { 1 })
    viewerWritten = $false
    viewerPath = $ReviewOnlyEvidenceViewerPath
  }
}

function Should-DeferForResourcePressure {
  try {
    $os = Get-CimInstance Win32_OperatingSystem
    $computer = Get-CimInstance Win32_ComputerSystem
    $totalBytes = [double]$computer.TotalPhysicalMemory
    $freeBytes = [double]$os.FreePhysicalMemory * 1KB
    if ($totalBytes -le 0) { throw "Could not read total physical memory." }
    $freePercent = ($freeBytes / $totalBytes) * 100
    $cpu = Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -ErrorAction Stop |
      Where-Object { $_.Name -eq "_Total" } |
      Select-Object -First 1
    if ($null -eq $cpu) { throw "Could not read total CPU utilization." }
    $cpuPercent = [double]$cpu.PercentProcessorTime
    if ($freePercent -ge $MinimumFreeMemoryPercent -and $cpuPercent -le $MaximumCpuPercent) { return $false }
    Write-CycleLog ("Resource pressure (CPU {0:N1}% / max {1}%, RAM {2:N2}GB free, {3:N1}% / min {4}%); deferring Node-based MTT work without touching TexasSolver." -f $cpuPercent, $MaximumCpuPercent, ($freeBytes / 1GB), $freePercent, $MinimumFreeMemoryPercent) | Out-Null
    return $true
  } catch {
    Write-CycleLog "Could not inspect CPU/RAM start limits; deferring this MTT cycle. $($_.Exception.Message)" | Out-Null
    return $true
  }
}

$mutex = New-Object System.Threading.Mutex($false, $MutexName)
$hasMutex = $false
try {
  try {
    # This is the scheduler preflight. A busy slot is deliberately not queued:
    # the next 10-minute Windows trigger gets the next opportunity instead.
    $hasMutex = $mutex.WaitOne(0, $false)
  } catch [System.Threading.AbandonedMutexException] {
    $hasMutex = $true
    Write-CycleLog "Recovered an abandoned MTT cycle mutex; continuing this iteration."
  }
  if (-not $hasMutex) {
    Write-CycleLog "Preflight found an active MTT autonomous cycle; deferring to the next scheduled 10-minute window."
    exit 0
  }

  Push-Location $RepoRoot
  try {
    do {
      if (Should-DeferForResourcePressure) {
        if ($Once) {
          Write-CycleLog "Once mode; cycle deferred for resource pressure."
          break
        }
        Start-Sleep -Seconds ([Math]::Max(60, $IntervalMinutes * 60))
        continue
      }
      $statuses = @()
      foreach ($coverageManifestPath in $ManifestPaths) {
        $statusPath = Join-Path $ArtifactsDir ("coverage-status-$Stamp-$([System.IO.Path]::GetFileNameWithoutExtension($coverageManifestPath)).json")
        $coverageExit = Invoke-LoggedNpm "coverage status $([System.IO.Path]::GetFileName($coverageManifestPath))" @(
          "run", "mtt:texas-solver-coverage-status", "--",
          "--manifest", $coverageManifestPath,
          "--json",
          "--output", $statusPath
        )
        if ($coverageExit -eq 0 -and (Test-Path -LiteralPath $statusPath)) {
          $statuses += Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json
        } else {
          Write-CycleLog "Coverage status failed for $coverageManifestPath; the next cycle will retry."
        }
      }
      if ($statuses.Count -eq $ManifestPaths.Count) {
        $LatestRawWrites = @($statuses | ForEach-Object {
          $packId = [string]$_.packId
          @($_.rows | Sort-Object familyId | ForEach-Object { "{0}:{1}:{2}" -f $packId, $_.familyId, $_.latestRawWrite })
        }) -join "|"
        $signature = @($statuses | Sort-Object packId | ForEach-Object {
          "{0}:{1}/{2}|complete={3}|raw-complete={4}" -f $_.packId, $_.counts.solvedBoards, $_.counts.expectedBoards, $_.complete, $_.counts.rawComplete
        }) -join "||"
        $signature = "$signature|latest=$LatestRawWrites"
        Write-CycleLog "coverage signature=$signature"

        # Reduced memory-safe trees are useful for visual frequency review but
        # are never eligible for normal review-notes or production promotion.
        # Aggregate every solved checkpoint across memory-safe phases and bind
        # extraction to the exact cumulative board allowlist for each family.
        $reviewOnlyEvidenceSummary = Update-ReviewOnlyEvidence $statuses

        # Board taxonomy is read-only here. The separate solver-batch prep task
        # is the sole writer and auditor of the beta-minimum parameter wave.
        $boardCatalogExit = Invoke-LoggedNpm "canonical board catalog" @(
          "run", "mtt:texas-solver-board-catalog", "--",
          "--output=$BoardCatalogReportPath"
        )

        # Keep the external-data intake packet fresh. A WAITING_FOR_FILES exit is
        # expected and is never treated as permission to manufacture range data.
        $p1PacketExit = Invoke-LoggedNpm "P1 intake packet" @("run", "mtt:p1-intake-packets")

        # If the owner drops an exact external export between cycles, validate it
        # immediately in dry-run mode. An empty intake is valid; malformed data is
        # recorded fail-closed without any runtime promotion.
        $p1ReadyExit = Invoke-LoggedNpm "P1 ready intake validation" @(
          "run", "mtt:validate-ready-intake", "--",
          "--priority=P1_PREFLOP_CHIP_EV",
          "--output=$P1ReadyValidationReportPath"
        )

        # Human review notes can change without a new raw export. Refresh their
        # source-safe packet independently; a nonzero review status is expected
        # until the owner has actually signed off every family.
        $reviewExit = Invoke-LoggedNpm "TexasSolver review packet" @(
          "run", "mtt:texas-solver-review-protocol", "--",
          "--packet-dir=artifacts/texas-solver-review-protocol/packet",
          "--output=artifacts/texas-solver-review-protocol/report.json",
          "--summary"
        )

        # Join board-diversity evidence to the separate owner protocol without
        # turning either signal into a poker verdict or a promotion command.
        $reviewReadinessExit = Invoke-LoggedNpm "TexasSolver mechanical review readiness" @(
          "run", "mtt:texas-solver-review-readiness", "--",
          "--output=$ReviewReadinessReportPath",
          "--markdown-output=$ReviewReadinessMarkdownPath",
          "--summary"
        )

        # Keep the human decision workbench separate from reduced-tree evidence.
        # Only canonical full-tree reports are selectable for owner approval;
        # mechanical readiness is displayed as read-only context after its
        # current snapshot has passed validation.
        $reviewViewerExit = -1
        if ($reviewReadinessExit -eq 0) {
          $reviewViewerExit = Invoke-LoggedNpm "TexasSolver owner review dashboard" @(
            "run", "mtt:texas-solver-viewer", "--",
            "--reviews-dir=$CanonicalReviewReportsDir",
            "--waves=$OwnerReviewWavesPath",
            "--readiness=$ReviewReadinessReportPath",
            "--output=$OwnerReviewViewerPath",
            "--title=TexasSolver owner review"
          )
        } else {
          Write-CycleLog "Mechanical readiness failed; canonical owner dashboard was not refreshed." | Out-Null
        }

        $coreGateEvaluated = $false
        $coreExit = $null
        $signaturePersisted = $signature -eq $LastCoverageSignature
        if ($signature -ne $LastCoverageSignature) {
          Write-CycleLog "Coverage changed; running the scoped Core gate. The ingest watcher owns review staging."
          $coreGateEvaluated = $true
          $coreExit = Invoke-LoggedNpm "MTT Core gate" @(
            "run", "mtt:core-release", "--",
            "--output=$CoreGateReportPath",
            "--summary"
          )
          if ($coreExit -eq 0) {
            [System.IO.File]::WriteAllText($LastCoverageSignaturePath, "$signature`r`n", (New-Object System.Text.UTF8Encoding($false)))
            $LastCoverageSignature = $signature
            $signaturePersisted = $true
            Write-CycleLog "Persisted successful coverage signature for the next scheduled cycle."
          } else {
            Write-CycleLog "Core gate failed; coverage signature was not persisted and will retry next cycle."
          }
        } else {
          Write-CycleLog "No coverage change since the last successful Core gate; watcher remains the sole ingest owner."
        }
        $p1Summary = Get-P1Summary $p1PacketExit $p1ReadyExit
        $boardCatalogSummary = Get-BoardCatalogSummary $boardCatalogExit
        $reviewSummary = Get-ReviewSummary $reviewExit $reviewViewerExit
        $reviewReadinessSummary = Get-ReviewReadinessSummary $reviewReadinessExit
        $coreSummary = Get-CoreSummary $coreGateEvaluated $coreExit $signaturePersisted
        Write-LatestCycleSummary $statuses $signature $boardCatalogSummary $p1Summary $reviewSummary $reviewOnlyEvidenceSummary $reviewReadinessSummary $coreSummary
      }

      if ($Once) {
        Write-CycleLog "Once mode; cycle finished."
        break
      }
      Start-Sleep -Seconds ([Math]::Max(60, $IntervalMinutes * 60))
    } while ((Get-Date) -lt $Deadline)

    if ((Get-Date) -ge $Deadline) {
      Write-CycleLog "Cycle deadline reached. Windows AtLogOn will start a new cycle after the next sign-in."
    }
  } finally {
    Pop-Location
  }
} finally {
  if ($hasMutex) {
    $mutex.ReleaseMutex()
  }
  $mutex.Dispose()
}
