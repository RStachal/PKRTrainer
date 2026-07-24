# Weekend uniform-tree re-solve worker.
#
# Rebuilds the batch on every start, so the run is resumable: boards that already
# use the authoritative full tree and sit at or below the accuracy target stop
# being selected, and an interrupted weekend simply continues where it stopped.
#
# The queue runner deletes a canonical raw checkpoint before re-solving it, so
# every selected checkpoint is backed up with a SHA-256 manifest first. A board
# interrupted mid-solve is restored from that backup on the next start.
[CmdletBinding()]
param(
  [int]$Threads = 12,
  [int]$Iterations = 1200,
  [string]$ProcessPriority = "Normal",
  [int]$MinimumFreeMemoryPercent = 12,
  [int]$MaximumCpuPercent = 100,
  [switch]$SkipBackup
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path
Set-Location $repo

$workDir = Join-Path $repo "artifacts\uniform-tree-weekend"
$backupDir = Join-Path $workDir "checkpoint-backup"
$null = New-Item -ItemType Directory -Force -Path $workDir, $backupDir
$log = Join-Path $workDir ("worker-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))

function Write-Log([string]$Message) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-ddTHH:mm:ss"), $Message
  Write-Host $line
  Add-Content -Path $log -Value $line -Encoding utf8
}

# One worker only. A second logon or a boot trigger must not start a rival solve
# against the same checkpoints.
$mutex = New-Object System.Threading.Mutex($false, "Global\PKRTrainerWeekendUniformResolve")
if (-not $mutex.WaitOne(0)) {
  Write-Log "Another weekend worker already holds the mutex; exiting."
  exit 0
}

try {
  if (@(Get-Process console_solver -ErrorAction SilentlyContinue).Count -gt 0) {
    Write-Log "A TexasSolver process is already running; exiting rather than competing for checkpoints."
    exit 0
  }

  Write-Log "Weekend uniform-tree re-solve starting; threads=$Threads iterations=$Iterations priority=$ProcessPriority"

  $paramDir = Join-Path $repo "Agents\solver-input\texas-solver\mtt-safe-flops-v1\parameters\pkrtrainer_mtt_uniform_tree_weekend_v1"
  $manifestPath = Join-Path $repo "Agents\solver-input\texas-solver\mtt-safe-flops-v1\uniform-tree-weekend-v1-manifest.json"

  # Restore anything a previous interrupted run left missing before re-selecting.
  if (Test-Path $backupDir) {
    $restored = 0
    Get-ChildItem $backupDir -Filter "pkrtrainer_*.json" -File -ErrorAction SilentlyContinue | ForEach-Object {
      if ($_.Name -match '^pkrtrainer_(?<fam>.+)_(?<board>[AKQJT98765432]{3}(?:r|tt|mono))\.json$') {
        $target = Join-Path $repo ("Agents\solver-input\gto-plus\sample-postflop-v1\output\texas-solver\{0}\raw\{1}" -f $Matches.fam, $_.Name)
        if (-not (Test-Path $target)) { Copy-Item $_.FullName $target -Force; $restored++ }
      }
    }
    if ($restored -gt 0) { Write-Log "Restored $restored checkpoint(s) left missing by an interrupted run." }
  }

  Write-Log "Rebuilding the batch from current evidence."
  & npm run mtt:texas-solver-uniform-tree-batch -- --write --threads=$Threads --iterations=$Iterations --summary 2>&1 |
    ForEach-Object { Write-Log $_ }

  $pending = @(Get-ChildItem -Path $paramDir -Filter "*.txt" -File -ErrorAction SilentlyContinue)
  if ($pending.Count -eq 0) {
    Write-Log "Nothing left to re-solve; every board uses the authoritative tree and meets the accuracy target."
    exit 0
  }
  Write-Log "Boards pending: $($pending.Count)"

  if (-not $SkipBackup) {
    Write-Log "Backing up canonical checkpoints before any forced re-solve."
    $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
    $copied = 0
    foreach ($file in $manifest.files) {
      $name = "pkrtrainer_{0}_{1}.json" -f $file.familyId, $file.boardId
      $src = Join-Path $repo ("Agents\solver-input\gto-plus\sample-postflop-v1\output\texas-solver\{0}\raw\{1}" -f $file.familyId, $name)
      $dst = Join-Path $backupDir $name
      if ((Test-Path $src) -and -not (Test-Path $dst)) { Copy-Item $src $dst -Force; $copied++ }
    }
    Write-Log "Backed up $copied new checkpoint(s); backup now holds $((Get-ChildItem $backupDir -Filter '*.json' -File).Count)."
  }

  & (Join-Path $PSScriptRoot "run-console-selected.ps1") `
    -ParameterRoot $paramDir `
    -Limit 99999 `
    -Force `
    -ContinueOnSolverFailure `
    -ProcessPriority $ProcessPriority `
    -MinimumFreeMemoryPercent $MinimumFreeMemoryPercent `
    -MaximumCpuPercent $MaximumCpuPercent `
    -FailureReportPath (Join-Path $workDir "failures.jsonl") 2>&1 | ForEach-Object { Write-Log $_ }

  Write-Log "Refreshing review-only accuracy evidence."
  & npm run mtt:texas-solver-review-only-refresh 2>&1 | ForEach-Object { Write-Log $_ }

  Write-Log "Re-grading tree provenance."
  & npm run mtt:texas-solver-tree-provenance -- --summary 2>&1 | ForEach-Object { Write-Log $_ }

  Write-Log "Weekend uniform-tree re-solve pass finished."
}
finally {
  $mutex.ReleaseMutex()
  $mutex.Dispose()
}
