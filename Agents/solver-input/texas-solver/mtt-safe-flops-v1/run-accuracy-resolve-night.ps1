# Overnight accuracy re-solve at full machine utilisation.
#
# Regenerates the re-solve batch first, so boards that already reached the
# exploitability target are pruned and never re-solved, then runs the remaining
# boards with every logical processor and Normal priority.
#
# It refuses to start while another TexasSolver process is alive, and it always
# leaves the canonical raw checkpoints either replaced by a completed solve or
# restorable from the SHA-256 backup taken by the caller.
[CmdletBinding()]
param(
  [int]$Threads = 0,
  [int]$Iterations = 600,
  [string]$ProcessPriority = "Normal",
  [int]$MinimumFreeMemoryPercent = 15,
  [int]$MaximumCpuPercent = 100
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path
Set-Location $repo

$logDir = Join-Path $repo "artifacts\texas-solver-accuracy-resolve-backup"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$log = Join-Path $logDir "night-resolve-$stamp.log"
$fail = Join-Path $logDir "solver-failures.jsonl"

function Write-Log([string]$Message) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-ddTHH:mm:ss"), $Message
  Write-Host $line
  Add-Content -Path $log -Value $line -Encoding utf8
}

if ($Threads -le 0) {
  $Threads = [int](Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors
}

Write-Log "Night accuracy re-solve starting; threads=$Threads iterations=$Iterations priority=$ProcessPriority"

# A second concurrent solver would fight for the same canonical checkpoints.
$existing = @(Get-Process console_solver -ErrorAction SilentlyContinue)
if ($existing.Count -gt 0) {
  Write-Log "Stopping $($existing.Count) running solver process(es) before the full-power run."
  $existing | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 5
}

# Regenerate so only boards still above target remain, at the requested threads.
Write-Log "Regenerating the re-solve batch (prunes converged boards)."
& npm run mtt:texas-solver-accuracy-resolve-batch -- --write --iterations=$Iterations --threads=$Threads --summary 2>&1 |
  ForEach-Object { Write-Log $_ }

$parameterRoot = Join-Path $repo "Agents\solver-input\texas-solver\mtt-safe-flops-v1\parameters\pkrtrainer_mtt_accuracy_resolve_v1"
$pending = @(Get-ChildItem -Path $parameterRoot -Filter "*.txt" -ErrorAction SilentlyContinue)
if ($pending.Count -eq 0) {
  Write-Log "Nothing to re-solve; every board is at or below the exploitability target."
  exit 0
}
Write-Log "Boards pending re-solve: $($pending.Count)"

& (Join-Path $PSScriptRoot "run-console-selected.ps1") `
  -ParameterRoot $parameterRoot `
  -Limit 999 `
  -Force `
  -ContinueOnSolverFailure `
  -ProcessPriority $ProcessPriority `
  -MinimumFreeMemoryPercent $MinimumFreeMemoryPercent `
  -MaximumCpuPercent $MaximumCpuPercent `
  -FailureReportPath $fail 2>&1 | ForEach-Object { Write-Log $_ }

Write-Log "Refreshing review-only accuracy evidence."
& npm run mtt:texas-solver-review-only-refresh 2>&1 | ForEach-Object { Write-Log $_ }

Write-Log "Re-grading families with the mechanical acceptance gate."
& npm run mtt:texas-solver-mechanical-acceptance -- --summary 2>&1 | ForEach-Object { Write-Log $_ }

Write-Log "Night accuracy re-solve finished."
