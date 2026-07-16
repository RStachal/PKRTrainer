param(
  [string]$Manifest = ".\Agents\solver-input\texas-solver\mtt-safe-flops-v1\coverage-srp-facing-bet-v1-manifest.json",
  [string]$RepoRoot = "",
  [int]$IntervalSeconds = 300,
  [int]$MinimumFreeMemoryPercent = 10,
  [int]$MaxMinutes = 720,
  [switch]$Once
)

$ErrorActionPreference = "Stop"

if ($MinimumFreeMemoryPercent -lt 1 -or $MinimumFreeMemoryPercent -gt 100) {
  throw "MinimumFreeMemoryPercent must be between 1 and 100."
}

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
$MemorySafeReviewOnly = $false
try {
  $ManifestMetadata = Get-Content -LiteralPath $Manifest -Raw | ConvertFrom-Json
  $MemorySafeReviewOnly = [string]$ManifestMetadata.executionProfile.treeProfile -eq "MEMORY_SAFE_REVIEW_ONLY"
} catch {
  Write-Warning "Could not read manifest execution profile; retaining normal fail-closed watcher behavior."
}
$ArtifactsDir = Join-Path $RepoRoot "artifacts\texas-solver-background"
New-Item -ItemType Directory -Force -Path $ArtifactsDir | Out-Null

$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$StatusPath = Join-Path $ArtifactsDir "watch-ingest-status-$Stamp.json"
$LogPath = Join-Path $ArtifactsDir "watch-ingest-$Stamp.log"
$ReviewPacketDir = Join-Path $RepoRoot "artifacts\texas-solver-review-protocol\interim-packet"
$ReviewProtocolReportPath = Join-Path $RepoRoot "artifacts\texas-solver-review-protocol\report.json"
$PilotSuiteReportPath = Join-Path $RepoRoot "artifacts\mtt-postflop-pilot-suite\report.json"
$PartialCheckpointDir = Join-Path $RepoRoot "artifacts\texas-solver-partial-checkpoints"
$ManifestLabel = ([System.IO.Path]::GetFileNameWithoutExtension($Manifest) -replace "-manifest$", "")
$ScenarioAuditReportPath = Join-Path $RepoRoot ("artifacts\texas-solver-scenario-audit\{0}-report.json" -f $ManifestLabel)
$Deadline = (Get-Date).AddMinutes($MaxMinutes)
$LastProcessedCoverageSignature = ""
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

function Should-DeferForLowMemory {
  try {
    $os = Get-CimInstance Win32_OperatingSystem
    $computer = Get-CimInstance Win32_ComputerSystem
    $totalBytes = [double]$computer.TotalPhysicalMemory
    $freeBytes = [double]$os.FreePhysicalMemory * 1KB
    if ($totalBytes -le 0) { return $false }
    $freePercent = ($freeBytes / $totalBytes) * 100
    if ($freePercent -ge $MinimumFreeMemoryPercent) { return $false }
    Write-WatchLog ("Low physical memory ({0:N2}GB, {1:N1}% free; watcher threshold {2}%); deferring coverage polling without touching TexasSolver." -f ($freeBytes / 1GB), $freePercent, $MinimumFreeMemoryPercent) | Out-Null
    return $true
  } catch {
    Write-WatchLog "Could not inspect physical memory; continuing fail-closed coverage polling." | Out-Null
    return $false
  }
}

function Write-PartialCoverageCheckpoints($Rows) {
  if ($MemorySafeReviewOnly) {
    Write-WatchLog "MEMORY_SAFE_REVIEW_ONLY manifest: partial checkpoints are disabled to avoid mixing reduced-tree and full-tree raw exports."
    return
  }
  $partialRows = @($Rows | Where-Object { $_.status -eq "RAW_PARTIAL" } | Sort-Object familyId)
  if ($partialRows.Count -eq 0) {
    return
  }

  New-Item -ItemType Directory -Force -Path $PartialCheckpointDir | Out-Null
  foreach ($row in $partialRows) {
    $familyId = [string]$row.familyId
    $checkpointPath = Join-Path $PartialCheckpointDir ("{0}.json" -f $familyId)
    Write-WatchLog ("Writing read-only partial checkpoint for {0} ({1}/{2} boards)." -f `
      $familyId, $row.solvedBoards, $row.expectedBoards)
    # Deliberately omit --write: checkpoints never create review notes, normalized drafts, or runtime data.
    npm run mtt:texas-solver-review -- "--family=$familyId" "--output=$checkpointPath" --summary 2>&1 |
      ForEach-Object { Write-WatchLog ([string]$_) }
    if ($LASTEXITCODE -ne 0) {
      Write-WatchLog "partial checkpoint exit code=$LASTEXITCODE for $familyId (raw coverage remains unchanged)."
    }
  }
}

Push-Location $RepoRoot
try {
  Write-WatchLog "Watching manifest: $Manifest"
  do {
    if (Should-DeferForLowMemory) {
      if ($Once) {
        Write-WatchLog "Once mode; watcher deferred for low memory."
        break
      }
      Start-Sleep -Seconds $IntervalSeconds
      continue
    }
    npm run mtt:texas-solver-coverage-status -- --manifest "$Manifest" --json --output "$StatusPath" | Out-Null
    $CoverageStatusExitCode = $LASTEXITCODE
    if ($CoverageStatusExitCode -ne 0 -or -not (Test-Path -LiteralPath $StatusPath)) {
      Write-WatchLog "coverage status exit code=$CoverageStatusExitCode or output missing; coverage will be retried."
      if ($Once) {
        break
      }
      Start-Sleep -Seconds $IntervalSeconds
      continue
    }
    $Status = Get-Content -LiteralPath $StatusPath -Raw | ConvertFrom-Json
    Write-WatchLog ("coverage solved={0}/{1} rawComplete={2}/{3} complete={4}" -f `
      $Status.counts.solvedBoards, `
      $Status.counts.expectedBoards, `
      $Status.counts.rawComplete, `
      $Status.counts.families, `
      $Status.complete)

    $LatestRawWrites = @($Status.rows |
      Sort-Object familyId |
      ForEach-Object { "{0}:{1}" -f $_.familyId, $_.latestRawWrite }) -join "|"
    $CoverageSignature = "{0}/{1}|complete={2}|raw-complete={3}|latest={4}" -f `
      $Status.counts.solvedBoards, `
      $Status.counts.expectedBoards, `
      $Status.complete, `
      $Status.counts.rawComplete, `
      $LatestRawWrites

    if ($CoverageSignature -eq $LastProcessedCoverageSignature) {
      Write-WatchLog "No coverage change; skipping redundant ingest and pilot refresh."
    } else {
      if ($MemorySafeReviewOnly) {
        Write-WatchLog "Coverage changed; recording MEMORY_SAFE_REVIEW_ONLY evidence without downstream staging or pilot refresh."
      } else {
        Write-WatchLog "Coverage changed; running source-safe ingest and review checks."
      }
      $ProcessingSucceeded = $true

      Write-PartialCoverageCheckpoints $Status.rows

      if ($Status.complete -eq $true) {
        # Re-audit the frozen parameter pack before final staging. A failed audit is
        # recorded fail-closed for review but does not discard raw solver checkpoints.
        npm run mtt:texas-solver-scenario-audit -- --manifest "$Manifest" --output "$ScenarioAuditReportPath" --summary 2>&1 |
          ForEach-Object { Write-WatchLog ([string]$_) }
        if ($LASTEXITCODE -ne 0) {
          Write-WatchLog "scenario audit exit code=$LASTEXITCODE (review remains fail-closed; safe ingestion continues)."
          $ProcessingSucceeded = $false
        } else {
          Write-WatchLog "scenario audit exit code=0."
        }
      }

      npm run mtt:texas-solver-ingest-completed -- --manifest "$Manifest" --summary 2>&1 |
        ForEach-Object { Write-WatchLog ([string]$_) }
      if ($LASTEXITCODE -ne 0) {
        Write-WatchLog "ingest exit code=$LASTEXITCODE (coverage will be retried)."
        $ProcessingSucceeded = $false
      }

      if ($MemorySafeReviewOnly) {
        Write-WatchLog "MEMORY_SAFE_REVIEW_ONLY evidence recorded; review protocol and pilot refresh are intentionally skipped for this reduced tree."
      } else {
        # Both checks are intentionally fail-closed until human poker review; record their
        # state without treating an expected downstream blocker as a failed raw ingest.
        npm run mtt:texas-solver-review-protocol -- "--packet-dir=$ReviewPacketDir" "--output=$ReviewProtocolReportPath" --summary 2>&1 |
          ForEach-Object { Write-WatchLog ([string]$_) }
        Write-WatchLog "review protocol exit code=$LASTEXITCODE (nonzero is expected before human review)."

        npm run mtt:postflop-pilot-suite -- --output "$PilotSuiteReportPath" --summary 2>&1 |
          ForEach-Object { Write-WatchLog ([string]$_) }
        if ($LASTEXITCODE -ne 0) {
          Write-WatchLog "pilot suite exit code=$LASTEXITCODE (candidate remains fail-closed; coverage checkpoint remains processed)."
        } else {
          Write-WatchLog "pilot suite exit code=0."
        }
      }
      if ($ProcessingSucceeded) {
        $LastProcessedCoverageSignature = $CoverageSignature
      } else {
        Write-WatchLog "Processing did not complete cleanly; coverage will be retried."
      }
    }

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
