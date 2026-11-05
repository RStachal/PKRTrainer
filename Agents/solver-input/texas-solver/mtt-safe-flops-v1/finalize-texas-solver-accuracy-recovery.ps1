param(
  [switch]$Force,
  [switch]$DryRun,
  [string]$RecoveryReportPath = "",
  [string]$CompletionReportPath = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path
$ArtifactsDir = Join-Path $RepoRoot "artifacts\texas-solver-low-memory"
if ([string]::IsNullOrWhiteSpace($RecoveryReportPath)) {
  $RecoveryReportPath = Join-Path $ArtifactsDir "accuracy-recovery-latest.json"
}
if ([string]::IsNullOrWhiteSpace($CompletionReportPath)) {
  $CompletionReportPath = Join-Path $ArtifactsDir "accuracy-recovery-completion.json"
}
$ProtocolPacketDir = Join-Path $RepoRoot "artifacts\texas-solver-review-protocol\packet"
$ProtocolReportPath = Join-Path $RepoRoot "artifacts\texas-solver-review-protocol\report.json"
$ReadinessReportPath = Join-Path $RepoRoot "artifacts\texas-solver-review-readiness\report.json"
$ReadinessMarkdownPath = Join-Path $RepoRoot "artifacts\texas-solver-review-readiness\MECHANICAL_READINESS.md"
$ReviewRoot = Join-Path $RepoRoot "Agents\solver-input\gto-plus\sample-postflop-v1\output\texas-solver"
$ReviewWavesPath = Join-Path $ProtocolPacketDir "OWNER_REVIEW_WAVES.md"
$OwnerViewerPath = Join-Path $RepoRoot "artifacts\texas-solver-review-protocol\viewer\index.html"
$OwnerTemplatePath = Join-Path $RepoRoot "artifacts\texas-solver-review-protocol\owner-review-decisions.template.json"
$MutexName = "Local\PKRTrainerTexasSolverAccuracyHandoffV1"
$Npm = (Get-Command npm.cmd -ErrorAction Stop).Source

function Write-HandoffLog([string]$Message) {
  Write-Host ("[{0}] {1}" -f (Get-Date -Format "s"), $Message)
}

function Read-Json([string]$Path, [string]$Label) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "$Label is missing: $Path" }
  try { return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json }
  catch { throw "$Label is not valid JSON: $Path. $($_.Exception.Message)" }
}

function Invoke-NpmStep([string]$Label, [string[]]$Arguments, [switch]$AllowNonzero) {
  Write-HandoffLog "${Label}: npm $($Arguments -join ' ')"
  & $Npm @Arguments 2>&1 | ForEach-Object { Write-HandoffLog ([string]$_) }
  $exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { [int]$LASTEXITCODE }
  Write-HandoffLog "$Label exit code=$exitCode"
  if ($exitCode -ne 0 -and -not $AllowNonzero) { throw "$Label failed with exit code $exitCode." }
  return $exitCode
}

function Test-CurrentCompletion($Recovery) {
  if ($Force -or -not (Test-Path -LiteralPath $CompletionReportPath -PathType Leaf)) { return $false }
  try {
    $completion = Get-Content -LiteralPath $CompletionReportPath -Raw | ConvertFrom-Json
    if ($completion.valid -ne $true -or $completion.evidenceGeneratedAt -ne $Recovery.generatedAt) { return $false }
    if ([int]$completion.accuracy.parsedLogs -ne [int]$Recovery.counts.parsedLogs) { return $false }
    if ([int]$completion.accuracy.expectedLogs -ne [int]$Recovery.counts.expectedLogs) { return $false }
    foreach ($path in @($ReadinessReportPath, $ReadinessMarkdownPath, $OwnerViewerPath, $OwnerTemplatePath)) {
      if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return $false }
    }
    return $true
  } catch { return $false }
}

New-Item -ItemType Directory -Force -Path $ArtifactsDir | Out-Null
$mutex = New-Object System.Threading.Mutex($false, $MutexName)
$hasMutex = $false
try {
  $hasMutex = $mutex.WaitOne(0, $false)
  if (-not $hasMutex) {
    Write-HandoffLog "Another accuracy handoff owns the mutex; exiting without duplication."
    exit 0
  }
  $activeSolver = @(Get-Process -Name "console_solver" -ErrorAction SilentlyContinue)
  if ($activeSolver.Count -gt 0 -and -not $DryRun) {
    Write-HandoffLog "TexasSolver is active (PID $($activeSolver.Id -join ',')); deferring owner handoff until recovery is idle."
    exit 0
  }

  Push-Location $RepoRoot
  try {
    if (-not $DryRun) {
      Invoke-NpmStep "accuracy completion check" @(
        "run", "mtt:texas-solver-accuracy-recovery", "--",
        "--summary", "--output=$RecoveryReportPath"
      ) | Out-Null
    }
    $recovery = Read-Json $RecoveryReportPath "Accuracy recovery report"
    if ($recovery.valid -ne $true -or $recovery.recoveryOnly -ne $true -or $null -eq $recovery.counts) {
      throw "Accuracy recovery report is not valid recovery-only evidence."
    }
    $parsed = [int]$recovery.counts.parsedLogs
    $expected = [int]$recovery.counts.expectedLogs
    $pending = [int]$recovery.counts.pendingLogs
    if ($parsed + $pending -ne $expected) { throw "Accuracy recovery counts do not reconcile ($parsed + $pending != $expected)." }
    if ($pending -gt 0) {
      Write-HandoffLog "Owner handoff is waiting for accuracy recovery: $parsed/$expected parsed, $pending pending."
      exit 0
    }
    if (Test-CurrentCompletion $recovery) {
      Write-HandoffLog "Owner handoff is already current for complete $parsed/$expected accuracy evidence."
      exit 0
    }
    if ($DryRun) {
      Write-HandoffLog "Dry run: complete $parsed/$expected evidence would refresh protocol, readiness, owner dashboard and blank template."
      exit 0
    }

    $protocolStartedAt = (Get-Date).ToUniversalTime()
    $protocolExit = Invoke-NpmStep "review protocol refresh" @(
      "run", "mtt:texas-solver-review-protocol", "--",
      "--packet-dir=$ProtocolPacketDir", "--output=$ProtocolReportPath", "--summary"
    ) -AllowNonzero
    $protocol = Read-Json $ProtocolReportPath "Review protocol report"
    $protocolWrite = (Get-Item -LiteralPath $ProtocolReportPath).LastWriteTimeUtc
    if ($protocolWrite -lt $protocolStartedAt.AddSeconds(-2)) { throw "Review protocol report was not refreshed by this handoff." }
    $protocolRows = @($protocol.rows)
    if ($null -eq $protocol.counts -or [int]$protocol.counts.families -lt 1 -or $protocolRows.Count -ne [int]$protocol.counts.families) {
      throw "Review protocol report has an invalid family inventory."
    }

    Invoke-NpmStep "mechanical review readiness" @(
      "run", "mtt:texas-solver-review-readiness", "--",
      "--output=$ReadinessReportPath", "--markdown-output=$ReadinessMarkdownPath", "--summary"
    ) | Out-Null
    $readiness = Read-Json $ReadinessReportPath "Mechanical readiness report"
    if ($readiness.valid -ne $true -or [int]$readiness.counts.families -ne $protocolRows.Count) {
      throw "Mechanical readiness does not cover the refreshed protocol families."
    }

    Invoke-NpmStep "owner review dashboard" @(
      "run", "mtt:texas-solver-viewer", "--",
      "--reviews-dir=$ReviewRoot", "--waves=$ReviewWavesPath",
      "--readiness=$ReadinessReportPath", "--output=$OwnerViewerPath",
      "--title=TexasSolver owner review"
    ) | Out-Null
    Invoke-NpmStep "blank owner decision template" @(
      "run", "mtt:texas-solver-owner-review-batch", "--",
      "--write-template", "--out=$OwnerTemplatePath"
    ) | Out-Null

    $template = Read-Json $OwnerTemplatePath "Owner decision template"
    $decisions = @($template.decisions)
    $fingerprints = @($decisions | Where-Object { [string]$_.evidenceFingerprint -cmatch '^sha256:[a-f0-9]{64}$' }).Count
    $selected = @($decisions | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_.decision) }).Count
    if ($template.schemaVersion -ne "pkrtrainer-texas-solver-owner-decisions-v2" -or
        $decisions.Count -ne $protocolRows.Count -or $fingerprints -ne $decisions.Count -or $selected -ne 0) {
      throw "Owner decision template is not a complete blank v2 fingerprint handoff."
    }

    $completion = [ordered]@{
      schemaVersion = 1
      valid = $true
      completedAt = (Get-Date -Format "o")
      evidenceGeneratedAt = [string]$recovery.generatedAt
      accuracy = [ordered]@{ parsedLogs = $parsed; expectedLogs = $expected; pendingLogs = $pending }
      review = [ordered]@{
        protocolExitCode = [int]$protocolExit
        families = $protocolRows.Count
        protocolReady = [int]$protocol.counts.protocolReady
        needsReview = [int]$protocol.counts.needsReview
        readinessValid = [bool]$readiness.valid
        ownerTemplateSchema = [string]$template.schemaVersion
        ownerTemplateFingerprints = $fingerprints
        ownerTemplateSelectedDecisions = $selected
      }
      files = [ordered]@{
        protocolReport = $ProtocolReportPath
        readinessReport = $ReadinessReportPath
        readinessMarkdown = $ReadinessMarkdownPath
        ownerViewer = $OwnerViewerPath
        ownerTemplate = $OwnerTemplatePath
      }
      boundaries = @(
        "This handoff records no poker verdict and writes no normalized strategy, action EV or production approval.",
        "The owner template is blank and every decision remains a human gate."
      )
    } | ConvertTo-Json -Depth 6
    [System.IO.File]::WriteAllText($CompletionReportPath, "$completion`r`n", (New-Object System.Text.UTF8Encoding($false)))
    Write-HandoffLog "Accuracy recovery owner handoff completed for $parsed/$expected evidence; owner decisions remain $selected/$($decisions.Count)."
  } finally {
    Pop-Location
  }
} catch {
  Write-HandoffLog "ERROR: $($_.Exception.Message)"
  exit 1
} finally {
  if ($hasMutex) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
