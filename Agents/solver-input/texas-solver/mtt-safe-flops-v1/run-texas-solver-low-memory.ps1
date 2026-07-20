param(
  [int]$MinimumFreeMemoryPercent = 35,
  [ValidateRange(1, 100)]
  [int]$MaximumCpuPercent = 40,
  [int]$StopBelowFreeMemoryPercent = 25,
  [int]$ThreadCount = 3,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path
$Runner = Join-Path $PSScriptRoot "run-console-selected.ps1"
$Watcher = Join-Path $PSScriptRoot "watch-ingest-completed.ps1"
$ResourceGuard = Join-Path $PSScriptRoot "watch-texas-solver-resource-guard.ps1"
$OutputBase = Join-Path $RepoRoot "Agents\solver-input\gto-plus\sample-postflop-v1\output\texas-solver"
$ArtifactsDir = Join-Path $RepoRoot "artifacts\texas-solver-low-memory"
$FailureReportPath = Join-Path $ArtifactsDir "solver-failures.ndjson"
$LogPath = Join-Path $ArtifactsDir ("worker-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
$MutexName = "Local\PKRTrainerTexasSolverLowMemoryV1"
$TreeProfile = "MEMORY_SAFE_REVIEW_ONLY"
$RootReviewFamilies = @(
  "MTT9_20BB_BTN_BB_SRP_LOWSPR",
  "MTT9_50BB_BTN_BB_SRP",
  "MTT9_80BB_BTN_BB_SRP_HIGHSPR",
  "MTT9_25BB_CO_BB_SRP_CBET_LOWSPR",
  "MTT9_50BB_CO_BB_SRP_CBET_MIDSPR",
  "MTT9_100BB_CO_BB_SRP_CBET_HIGHSPR",
  "MTT9_25BB_SB_BB_SRP_OOP_CBET_LOWSPR",
  "MTT9_50BB_SB_BB_SRP_OOP_CBET_MIDSPR",
  "MTT9_100BB_SB_BB_SRP_OOP_CBET_HIGHSPR",
  "MTT9_35BB_CO_BTN_3BP_REPAIR",
  "MTT9_80BB_CO_BTN_3BP_MIDSPR",
  "MTT9_150BB_CO_BTN_3BP_HIGHSPR"
)
$OwnerDepthFamilies = @(
  "MTT9_25BB_BTN_BB_SRP_FACING_LOWSPR",
  "MTT9_50BB_BTN_BB_SRP_FACING_MIDSPR",
  "MTT9_100BB_BTN_BB_SRP_FACING_HIGHSPR",
  "MTT9_40BB_UTG_BB_SRP",
  "MTT9_35BB_CO_BTN_3BP",
  "MTT9_45BB_CO_BTN_3BP_FACING_LOWSPR",
  "MTT9_70BB_CO_BTN_3BP_FACING_MIDSPR",
  "MTT9_110BB_CO_BTN_3BP_FACING_MIDHIGH"
)
$AllReviewFamilies = @($RootReviewFamilies + $OwnerDepthFamilies)
$Phases = @(
  [pscustomobject]@{
    Name = "next"
    SourceRoot = Join-Path $PSScriptRoot "parameters\pkrtrainer_mtt_next_flop_review_v1"
    ParameterRoot = Join-Path $ArtifactsDir "runtime\pkrtrainer_mtt_low_memory_review_v1"
    ManifestParameterRoot = Join-Path $PSScriptRoot "parameters\pkrtrainer_mtt_low_memory_review_v1"
    SourceManifestPath = Join-Path $PSScriptRoot "coverage-next-flop-review-v1-manifest.json"
    ManifestPath = Join-Path $PSScriptRoot "coverage-low-memory-flop-review-v1-manifest.json"
    Families = $RootReviewFamilies
  },
  [pscustomobject]@{
    Name = "followup"
    SourceRoot = Join-Path $PSScriptRoot "parameters\pkrtrainer_mtt_followup_flop_review_v1"
    ParameterRoot = Join-Path $ArtifactsDir "runtime\pkrtrainer_mtt_low_memory_followup_review_v1"
    ManifestParameterRoot = Join-Path $PSScriptRoot "parameters\pkrtrainer_mtt_low_memory_followup_review_v1"
    SourceManifestPath = Join-Path $PSScriptRoot "coverage-followup-flop-review-v1-manifest.json"
    ManifestPath = Join-Path $PSScriptRoot "coverage-low-memory-followup-flop-review-v1-manifest.json"
    Families = $RootReviewFamilies
  },
  [pscustomobject]@{
    Name = "owner-depth"
    SourceRoot = Join-Path $PSScriptRoot "parameters\pkrtrainer_mtt_owner_depth_review_v1"
    ParameterRoot = Join-Path $ArtifactsDir "runtime\pkrtrainer_mtt_low_memory_owner_depth_review_v1"
    ManifestParameterRoot = Join-Path $PSScriptRoot "parameters\pkrtrainer_mtt_low_memory_owner_depth_review_v1"
    SourceManifestPath = Join-Path $PSScriptRoot "coverage-owner-depth-flop-review-v1-manifest.json"
    ManifestPath = Join-Path $PSScriptRoot "coverage-low-memory-owner-depth-flop-review-v1-manifest.json"
    Families = $OwnerDepthFamilies
  },
  [pscustomobject]@{
    Name = "beta-min"
    SourceRoot = Join-Path $PSScriptRoot "parameters\pkrtrainer_mtt_beta_min_board_review_v1"
    ParameterRoot = Join-Path $ArtifactsDir "runtime\pkrtrainer_mtt_low_memory_beta_min_board_review_v1"
    ManifestParameterRoot = Join-Path $PSScriptRoot "parameters\pkrtrainer_mtt_low_memory_beta_min_board_review_v1"
    SourceManifestPath = Join-Path $PSScriptRoot "coverage-beta-min-board-review-v1-manifest.json"
    ManifestPath = Join-Path $PSScriptRoot "coverage-low-memory-beta-min-board-review-v1-manifest.json"
    Families = $AllReviewFamilies
  },
  [pscustomobject]@{
    Name = "beta-depth"
    SourceRoot = Join-Path $PSScriptRoot "parameters\pkrtrainer_mtt_beta_depth_board_review_v1"
    ParameterRoot = Join-Path $ArtifactsDir "runtime\pkrtrainer_mtt_low_memory_beta_depth_board_review_v1"
    ManifestParameterRoot = Join-Path $PSScriptRoot "parameters\pkrtrainer_mtt_low_memory_beta_depth_board_review_v1"
    SourceManifestPath = Join-Path $PSScriptRoot "coverage-beta-depth-board-review-v1-manifest.json"
    ManifestPath = Join-Path $PSScriptRoot "coverage-low-memory-beta-depth-board-review-v1-manifest.json"
    Families = $AllReviewFamilies
  }
)

if ($ThreadCount -lt 1 -or $ThreadCount -gt 4) {
  throw "ThreadCount must be between 1 and 4 for the low-memory worker."
}
if ($MinimumFreeMemoryPercent -lt 20 -or $MinimumFreeMemoryPercent -gt 90) {
  throw "MinimumFreeMemoryPercent must be between 20 and 90."
}
if ($StopBelowFreeMemoryPercent -lt 10 -or $StopBelowFreeMemoryPercent -ge $MinimumFreeMemoryPercent) {
  throw "StopBelowFreeMemoryPercent must be at least 10 and lower than MinimumFreeMemoryPercent."
}

function Write-WorkerLog([string]$Message) {
  $line = "[{0}] {1}" -f (Get-Date -Format "s"), $Message
  if (-not $DryRun) {
    [System.IO.File]::AppendAllText($LogPath, "$line`r`n", [System.Text.Encoding]::UTF8)
  }
  Write-Host $line
}

function Get-ConflictingSolverWorkers {
  return @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.ProcessId -ne $PID -and
    $_.Name -ieq "powershell.exe" -and
    -not [string]::IsNullOrWhiteSpace($_.CommandLine) -and
    (
      $_.CommandLine -match 'artifacts[\\/]texas-solver-background[\\/].+[.]run[.]ps1' -or
      $_.CommandLine -match 'resume-texas-solver-queue[.]ps1'
    )
  })
}

function Test-PhaseRawComplete($Phase) {
  if (-not (Test-Path -LiteralPath $Phase.SourceManifestPath)) { return $false }
  try {
    $sourceManifest = Get-Content -LiteralPath $Phase.SourceManifestPath -Raw | ConvertFrom-Json
    $files = @($sourceManifest.files)
    if ($files.Count -eq 0) { return $false }
    foreach ($file in $files) {
      $parameterPath = Join-Path $RepoRoot (([string]$file.path) -replace '/', '\\')
      if (-not (Test-Path -LiteralPath $parameterPath)) { return $false }
      $dumpName = Select-String -LiteralPath $parameterPath -Pattern "^dump_result\s+(.+)$" | Select-Object -First 1 |
        ForEach-Object { $_.Matches[0].Groups[1].Value.Trim() }
      if ([string]::IsNullOrWhiteSpace($dumpName)) { return $false }
      $rawPath = Join-Path $OutputBase (Join-Path ([string]$file.familyId) (Join-Path "raw" $dumpName))
      if (-not (Test-Path -LiteralPath $rawPath)) { return $false }
    }
    return $true
  } catch {
    Write-WorkerLog "Could not inspect phase '$($Phase.Name)' checkpoints; keeping it active. $($_.Exception.Message)" | Out-Null
    return $false
  }
}

function Select-Phase {
  foreach ($phase in $Phases) {
    if (-not (Test-PhaseRawComplete $phase)) { return $phase }
    Write-WorkerLog "Phase '$($phase.Name)' has all raw checkpoints; selecting the next phase." | Out-Null
  }
  return $Phases[-1]
}

$ActivePhase = Select-Phase
$SourceRoot = $ActivePhase.SourceRoot
$ParameterRoot = $ActivePhase.ParameterRoot
$SourceManifestPath = $ActivePhase.SourceManifestPath
$ManifestPath = $ActivePhase.ManifestPath
$ActiveFamilies = @($ActivePhase.Families)

function Build-LowMemoryBatch($Phase) {
  $phaseSourceRoot = $Phase.SourceRoot
  $phaseParameterRoot = $Phase.ParameterRoot
  $phaseSourceManifestPath = $Phase.SourceManifestPath
  $phaseManifestPath = $Phase.ManifestPath
  $phaseFamilies = @($Phase.Families)
  if (-not (Test-Path -LiteralPath $phaseSourceRoot)) { throw "Missing source parameter root: $phaseSourceRoot" }
  if (-not (Test-Path -LiteralPath $phaseSourceManifestPath)) { throw "Missing source manifest: $phaseSourceManifestPath" }
  $manifestParameterRoot = $Phase.ManifestParameterRoot
  $parameterDirRelative = ($manifestParameterRoot.Substring($RepoRoot.Length).TrimStart('\') -replace '\\', '/')
  $manifestRelative = ($phaseManifestPath.Substring($RepoRoot.Length).TrimStart('\') -replace '\\', '/')
  $sourceManifest = Get-Content -LiteralPath $phaseSourceManifestPath -Raw | ConvertFrom-Json
  $sourceGeneratedAt = [string]$sourceManifest.generatedAt
  if ([string]::IsNullOrWhiteSpace($sourceGeneratedAt)) { throw "Low-memory phase '$($Phase.Name)' source manifest has no generatedAt date." }
  $scenarios = @($sourceManifest.scenarios | Where-Object { $phaseFamilies -contains [string]$_.familyId })
  if ($scenarios.Count -ne $phaseFamilies.Count) { throw "Low-memory phase '$($Phase.Name)' is missing an expected family." }
  $files = @(Get-ChildItem -LiteralPath $phaseSourceRoot -Filter "*.txt" | Where-Object {
    $name = $_.BaseName -replace '^\d+_', ''
    $lastUnderscore = $name.LastIndexOf('_')
    $lastUnderscore -gt 0 -and $phaseFamilies -contains $name.Substring(0, $lastUnderscore)
  } | Sort-Object Name)
  $expectedFileCount = @($scenarios | ForEach-Object { @($_.boards).Count } | Measure-Object -Sum).Sum
  if ($files.Count -ne $expectedFileCount) { throw "Expected $expectedFileCount resource-balanced parameter files for '$($Phase.Name)', found $($files.Count)." }
  $manifestFiles = @($sourceManifest.files | Where-Object { $phaseFamilies -contains [string]$_.familyId } | ForEach-Object {
    [ordered]@{
      fileName = [string]$_.fileName
      path = "$parameterDirRelative/$($_.fileName)"
      familyId = [string]$_.familyId
      boardId = [string]$_.boardId
      written = $true
    }
  })
  if ($manifestFiles.Count -ne $files.Count) { throw "Low-memory manifest files do not match the generated parameter count." }
  if (-not $DryRun) {
    New-Item -ItemType Directory -Force -Path $phaseParameterRoot | Out-Null
    foreach ($file in $files) {
      $content = Get-Content -LiteralPath $file.FullName -Raw
      $updated = [regex]::Replace($content, '(?m)^set_thread_num\s+\d+\s*$', "set_thread_num $ThreadCount")
      if ($updated -eq $content) { throw "Missing set_thread_num command in $($file.Name)" }
      # Full multi-street sizing trees exceeded the machine's RAM guard even at two threads.
      # Keep these exact outputs review-only; they are not a substitute for the full tree.
      $updated = [regex]::Replace($updated, '(?m)^set_bet_sizes (oop|ip),flop,bet,[^\r\n]+$', 'set_bet_sizes $1,flop,bet,33')
      $updated = [regex]::Replace($updated, '(?m)^set_bet_sizes (oop|ip),flop,raise,[^\r\n]+$', 'set_bet_sizes $1,flop,raise,75')
      $updated = [regex]::Replace($updated, '(?m)^set_bet_sizes (oop|ip),(turn|river),bet,[^\r\n]+$', 'set_bet_sizes $1,$2,bet,50')
      $updated = [regex]::Replace($updated, '(?m)^set_bet_sizes (oop|ip),(turn|river),(raise|donk|allin)[^\r\n]*\r?\n?', '')
      $updated = [regex]::Replace($updated, '(?m)^set_max_iteration\s+\d+\s*$', 'set_max_iteration 100')
      $normalized = $updated.TrimEnd("`r", "`n") + "`n"
      [System.IO.File]::WriteAllText(
        (Join-Path $phaseParameterRoot $file.Name),
        $normalized,
        [System.Text.Encoding]::ASCII
      )
    }
    $manifestJson = [ordered]@{
      packId = "pkrtrainer-mtt-texas-solver-low-memory-$($Phase.Name)-flop-review-v1"
      generatedAt = $sourceGeneratedAt
      parameterDir = $parameterDirRelative
      outputBase = "Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver"
      scenarios = $scenarios
      files = $manifestFiles
      notes = @(
        "Owner-directed resource-balanced $($Phase.Name) review batch. Generated from an isolated batch without changing the legacy queue.",
        "MEMORY_SAFE_REVIEW_ONLY tree: reduced sizing branches and iterations after the full tree exceeded the RAM guard. It is not comparable to a full-tree production solve.",
        "Review-only evidence: no raw export or derived draft is runtime strategy until the separate review protocol is complete."
      )
      commands = @(
        "npm run mtt:texas-solver-low-memory-status",
        "npm run mtt:texas-solver-coverage-status -- --manifest $manifestRelative --summary"
      )
      executionProfile = [ordered]@{
        threads = $ThreadCount
        treeProfile = $TreeProfile
        minimumFreeMemoryPercent = $MinimumFreeMemoryPercent
        maximumCpuPercent = $MaximumCpuPercent
        stopBelowFreeMemoryPercent = $StopBelowFreeMemoryPercent
        processPriority = "BelowNormal"
      }
    } | ConvertTo-Json -Depth 12
    [System.IO.File]::WriteAllText($phaseManifestPath, $manifestJson, (New-Object System.Text.UTF8Encoding($false)))
  }
  return $files.Count
}

function Start-IngestWatcher {
  $running = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -ieq "powershell.exe" -and $_.CommandLine -match [regex]::Escape($ManifestPath)
  })
  if ($running.Count -gt 0) {
    Write-WorkerLog "Incremental ingest watcher already active for the low-memory manifest."
    return
  }
  $process = Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", $Watcher,
    "-Manifest", $ManifestPath, "-MinimumFreeMemoryPercent", "$MinimumFreeMemoryPercent",
    "-IntervalSeconds", "300", "-MaxMinutes", "10080"
  ) -WorkingDirectory $RepoRoot -WindowStyle Hidden -PassThru
  Write-WorkerLog "Started low-memory incremental ingest watcher PID $($process.Id)."
}

function Start-ResourceGuard {
  if (-not (Test-Path -LiteralPath $ResourceGuard)) {
    throw "TexasSolver resource guard not found: $ResourceGuard"
  }
  $guardLogPath = Join-Path $ArtifactsDir ("resource-guard-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
  $process = Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", $ResourceGuard,
    "-OwnerProcessId", "$PID",
    "-StopBelowFreeMemoryPercent", "$StopBelowFreeMemoryPercent",
    "-LogPath", $guardLogPath
  ) -WorkingDirectory $RepoRoot -WindowStyle Hidden -PassThru
  Write-WorkerLog "Started solver resource guard PID $($process.Id); emergency threshold $StopBelowFreeMemoryPercent% free RAM." | Out-Null
  return $process
}

if (-not (Test-Path -LiteralPath $Runner)) { throw "TexasSolver runner not found: $Runner" }
New-Item -ItemType Directory -Force -Path $ArtifactsDir | Out-Null
$mutex = New-Object System.Threading.Mutex($false, $MutexName)
$hasMutex = $false
try {
  $hasMutex = $mutex.WaitOne(0, $false)
  if (-not $hasMutex) { Write-WorkerLog "Low-memory worker already owns the mutex; exiting without duplication."; exit 0 }
  $conflictingWorkers = @(Get-ConflictingSolverWorkers)
  if ($conflictingWorkers.Count -gt 0) {
    Write-WorkerLog "Another TexasSolver queue worker is active (PID $($conflictingWorkers.ProcessId -join ',')). Deferring this worker without touching it."
    exit 0
  }
  $phaseCounts = @{}
  foreach ($phase in $Phases) {
    $phaseCounts[$phase.Name] = Build-LowMemoryBatch $phase
  }
  $count = [int]$phaseCounts[$ActivePhase.Name]
  Write-WorkerLog "Resource-balanced $($ActivePhase.Name) batch ready: $count boards, $ThreadCount threads, tree profile $TreeProfile, start limits CPU <= $MaximumCpuPercent% and RAM >= $MinimumFreeMemoryPercent% free; emergency threshold $StopBelowFreeMemoryPercent% free memory."
  $activeSolver = @(Get-Process -Name "console_solver" -ErrorAction SilentlyContinue)
  if ($activeSolver.Count -gt 0) { Write-WorkerLog "A TexasSolver process is already active (PID $($activeSolver.Id -join ',')). Leaving it untouched."; exit 0 }
  if ($DryRun) { exit 0 }
  Start-IngestWatcher
  $guardProcess = Start-ResourceGuard
  try {
  & $Runner -ParameterRoot $ParameterRoot -OutputBase $OutputBase -Limit $count `
      -MinimumFreeMemoryPercent $MinimumFreeMemoryPercent -MaximumCpuPercent $MaximumCpuPercent `
      -ProcessPriority BelowNormal -ContinueOnSolverFailure -FailureReportPath $FailureReportPath 2>&1 |
      ForEach-Object { Write-WorkerLog ([string]$_) }
  } finally {
    if ($null -ne $guardProcess -and -not $guardProcess.HasExited) {
      Stop-Process -Id $guardProcess.Id -Force -ErrorAction SilentlyContinue
    }
  }
  # A PowerShell script with only checkpoint skips can leave LASTEXITCODE unset.
  # Treat that as its normal zero exit, while preserving a real native failure.
  $runnerExitCode = if ($null -eq $LASTEXITCODE) { 0 } else { [int]$LASTEXITCODE }
  if ($runnerExitCode -ne 0) { throw "Low-memory TexasSolver runner failed with exit code $runnerExitCode." }
  Write-WorkerLog "Low-memory batch run completed; watcher owns source-safe ingest and review refresh."
} catch {
  Write-WorkerLog "ERROR: $($_.Exception.Message)"
  exit 1
} finally {
  if ($hasMutex) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
