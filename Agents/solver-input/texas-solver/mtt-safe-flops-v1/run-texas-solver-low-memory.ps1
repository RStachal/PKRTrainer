param(
  [int]$MinimumFreeMemoryPercent = 35,
  [ValidateRange(1, 100)]
  [int]$MaximumCpuPercent = 40,
  [int]$StopBelowFreeMemoryPercent = 25,
  [int]$ThreadCount = 2,
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
$Phases = @(
  [pscustomobject]@{
    Name = "next"
    SourceRoot = Join-Path $PSScriptRoot "parameters\pkrtrainer_mtt_next_flop_review_v1"
    ParameterRoot = Join-Path $PSScriptRoot "parameters\pkrtrainer_mtt_low_memory_review_v1"
    SourceManifestPath = Join-Path $PSScriptRoot "coverage-next-flop-review-v1-manifest.json"
    ManifestPath = Join-Path $PSScriptRoot "coverage-low-memory-flop-review-v1-manifest.json"
  },
  [pscustomobject]@{
    Name = "followup"
    SourceRoot = Join-Path $PSScriptRoot "parameters\pkrtrainer_mtt_followup_flop_review_v1"
    ParameterRoot = Join-Path $PSScriptRoot "parameters\pkrtrainer_mtt_low_memory_followup_review_v1"
    SourceManifestPath = Join-Path $PSScriptRoot "coverage-followup-flop-review-v1-manifest.json"
    ManifestPath = Join-Path $PSScriptRoot "coverage-low-memory-followup-flop-review-v1-manifest.json"
  }
)
$LowMemoryFamilies = @(
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
    Write-WorkerLog "Could not inspect phase '$($Phase.Name)' checkpoints; keeping it active. $($_.Exception.Message)"
    return $false
  }
}

function Select-Phase {
  foreach ($phase in $Phases) {
    if (-not (Test-PhaseRawComplete $phase)) { return $phase }
    Write-WorkerLog "Phase '$($phase.Name)' has all raw checkpoints; selecting the next phase."
  }
  return $Phases[-1]
}

$ActivePhase = Select-Phase
$SourceRoot = $ActivePhase.SourceRoot
$ParameterRoot = $ActivePhase.ParameterRoot
$SourceManifestPath = $ActivePhase.SourceManifestPath
$ManifestPath = $ActivePhase.ManifestPath

function Build-LowMemoryBatch {
  if (-not (Test-Path -LiteralPath $SourceRoot)) { throw "Missing source parameter root: $SourceRoot" }
  if (-not (Test-Path -LiteralPath $SourceManifestPath)) { throw "Missing source manifest: $SourceManifestPath" }
  $parameterDirRelative = ($ParameterRoot.Substring($RepoRoot.Length).TrimStart('\') -replace '\\', '/')
  $sourceManifest = Get-Content -LiteralPath $SourceManifestPath -Raw | ConvertFrom-Json
  $scenarios = @($sourceManifest.scenarios | Where-Object { $LowMemoryFamilies -contains [string]$_.familyId })
  if ($scenarios.Count -ne $LowMemoryFamilies.Count) { throw "Low-memory manifest is missing an expected next-review family." }
  $files = @(Get-ChildItem -LiteralPath $SourceRoot -Filter "*.txt" | Where-Object {
    $name = $_.BaseName -replace '^\d+_', ''
    $lastUnderscore = $name.LastIndexOf('_')
    $lastUnderscore -gt 0 -and $LowMemoryFamilies -contains $name.Substring(0, $lastUnderscore)
  } | Sort-Object Name)
  $expectedFileCount = @($scenarios | ForEach-Object { @($_.boards).Count } | Measure-Object -Sum).Sum
  if ($files.Count -ne $expectedFileCount) { throw "Expected $expectedFileCount resource-balanced parameter files, found $($files.Count)." }
  $manifestFiles = @($sourceManifest.files | Where-Object { $LowMemoryFamilies -contains [string]$_.familyId } | ForEach-Object {
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
    New-Item -ItemType Directory -Force -Path $ParameterRoot | Out-Null
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
        (Join-Path $ParameterRoot $file.Name),
        $normalized,
        [System.Text.Encoding]::ASCII
      )
    }
    $manifestJson = [ordered]@{
      packId = "pkrtrainer-mtt-texas-solver-low-memory-$($ActivePhase.Name)-flop-review-v1"
      generatedAt = (Get-Date -Format "yyyy-MM-dd")
      parameterDir = $parameterDirRelative
      outputBase = "Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver"
      scenarios = $scenarios
      files = $manifestFiles
      notes = @(
        "Owner-directed resource-balanced $($ActivePhase.Name) review batch. Generated from an isolated batch without changing the legacy queue.",
        "MEMORY_SAFE_REVIEW_ONLY tree: reduced sizing branches and iterations after the full tree exceeded the RAM guard. It is not comparable to a full-tree production solve.",
        "Review-only evidence: no raw export or derived draft is runtime strategy until the separate review protocol is complete."
      )
      commands = @(
        "npm run mtt:texas-solver-low-memory-status",
        "npm run mtt:texas-solver-coverage-status -- --manifest Agents/solver-input/texas-solver/mtt-safe-flops-v1/coverage-low-memory-flop-review-v1-manifest.json --summary"
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
    [System.IO.File]::WriteAllText($ManifestPath, $manifestJson, (New-Object System.Text.UTF8Encoding($false)))
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
  Write-WorkerLog "Started solver resource guard PID $($process.Id); emergency threshold $StopBelowFreeMemoryPercent% free RAM."
  return $process
}

if (-not (Test-Path -LiteralPath $Runner)) { throw "TexasSolver runner not found: $Runner" }
New-Item -ItemType Directory -Force -Path $ArtifactsDir | Out-Null
$mutex = New-Object System.Threading.Mutex($false, $MutexName)
$hasMutex = $false
try {
  $hasMutex = $mutex.WaitOne(0, $false)
  if (-not $hasMutex) { Write-WorkerLog "Low-memory worker already owns the mutex; exiting without duplication."; exit 0 }
  $count = Build-LowMemoryBatch
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
