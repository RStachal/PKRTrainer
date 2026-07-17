param([switch]$DryRun)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path
$StopScript = Join-Path $PSScriptRoot "stop-texas-solver-all.ps1"
$BackgroundRunner = Join-Path $PSScriptRoot "start-background-solve.ps1"
$SourceParameterRoot = Join-Path $PSScriptRoot "parameters\pkrtrainer_mtt_low_memory_beta_depth_board_review_v1"
$RuntimeParameterRoot = Join-Path $RepoRoot "artifacts\texas-solver-manual-modes\night-100\parameters"
$LogicalProcessors = [Environment]::ProcessorCount
$ThreadCount = [Math]::Max(1, $LogicalProcessors)

if (-not (Test-Path -LiteralPath $SourceParameterRoot -PathType Container)) {
  throw "Night-mode source parameters are missing: $SourceParameterRoot"
}
if (-not (Test-Path -LiteralPath $BackgroundRunner -PathType Leaf)) {
  throw "TexasSolver background runner is missing: $BackgroundRunner"
}

Write-Host "TexasSolver night mode: $ThreadCount/$LogicalProcessors solver threads (100% logical CPU capacity)."
Write-Host "Priority: AboveNormal; power plan: High performance; free RAM >= 15%; emergency stop below 10% free RAM."
if ($DryRun) {
  Write-Host "Dry run only; no process or scheduled task was started."
  exit 0
}

& $StopScript -KeepPowerPlan -Quiet
& powercfg.exe /setactive SCHEME_MIN 2>$null
New-Item -ItemType Directory -Force -Path $RuntimeParameterRoot | Out-Null
foreach ($file in @(Get-ChildItem -LiteralPath $SourceParameterRoot -Filter "*.txt" -File)) {
  $content = Get-Content -LiteralPath $file.FullName -Raw
  if ($content -notmatch '(?m)^set_thread_num\s+\d+\s*$') {
    throw "Missing set_thread_num command in $($file.FullName)"
  }
  $runtimeContent = [regex]::Replace($content, '(?m)^set_thread_num\s+\d+\s*$', "set_thread_num $ThreadCount")
  [System.IO.File]::WriteAllText(
    (Join-Path $RuntimeParameterRoot $file.Name),
    ($runtimeContent.TrimEnd("`r", "`n") + "`n"),
    [System.Text.Encoding]::ASCII
  )
}

& $BackgroundRunner `
  -ParameterRoot $RuntimeParameterRoot `
  -Limit 999 `
  -MinimumFreeMemoryPercent 15 `
  -MaximumCpuPercent 100 `
  -ProcessPriority AboveNormal `
  -StopBelowFreeMemoryPercent 10 `
  -ContinueOnSolverFailure `
  -LogName "texas-solver-night-100"
