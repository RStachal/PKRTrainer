param(
  [ValidateSet("beta-depth", "growth")]
  [string]$Wave = "beta-depth",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path
$StopScript = Join-Path $PSScriptRoot "stop-texas-solver-all.ps1"
$BackgroundRunner = Join-Path $PSScriptRoot "start-background-solve.ps1"
$SourceDirectories = @{
  "beta-depth" = "parameters\pkrtrainer_mtt_beta_depth_board_review_v1"
  "growth" = "parameters\pkrtrainer_mtt_growth_board_review_v1"
}
$SourceParameterRoot = Join-Path $PSScriptRoot $SourceDirectories[$Wave]
$RuntimeParameterRoot = Join-Path $RepoRoot "artifacts\texas-solver-manual-modes\day-40\$Wave\parameters"
$LogicalProcessors = [Environment]::ProcessorCount
$ThreadCount = [Math]::Max(1, [Math]::Floor($LogicalProcessors * 0.40))

if (-not (Test-Path -LiteralPath $SourceParameterRoot -PathType Container)) {
  throw "Day-mode source parameters are missing: $SourceParameterRoot"
}
if (-not (Test-Path -LiteralPath $BackgroundRunner -PathType Leaf)) {
  throw "TexasSolver background runner is missing: $BackgroundRunner"
}

Write-Host "TexasSolver day mode ($Wave): $ThreadCount/$LogicalProcessors solver threads (at most 40% logical CPU capacity)."
Write-Host "Priority: BelowNormal; power plan: Balanced; start CPU <= 40%; free RAM >= 35%; emergency stop below 25% free RAM."
Write-Host "The runtime copies use MEMORY_SAFE_REVIEW_ONLY sizing and never create production strategy."
if ($DryRun) {
  Write-Host "Dry run only; no process or scheduled task was started."
  exit 0
}

& $StopScript -KeepPowerPlan -Quiet
& powercfg.exe /setactive SCHEME_BALANCED 2>$null
New-Item -ItemType Directory -Force -Path $RuntimeParameterRoot | Out-Null
foreach ($file in @(Get-ChildItem -LiteralPath $SourceParameterRoot -Filter "*.txt" -File)) {
  $content = Get-Content -LiteralPath $file.FullName -Raw
  if ($content -notmatch '(?m)^set_thread_num\s+\d+\s*$') {
    throw "Missing set_thread_num command in $($file.FullName)"
  }
  $runtimeContent = [regex]::Replace($content, '(?m)^set_thread_num\s+\d+\s*$', "set_thread_num $ThreadCount")
  $runtimeContent = [regex]::Replace($runtimeContent, '(?m)^set_bet_sizes (oop|ip),flop,bet,[^\r\n]+$', 'set_bet_sizes $1,flop,bet,33')
  $runtimeContent = [regex]::Replace($runtimeContent, '(?m)^set_bet_sizes (oop|ip),flop,raise,[^\r\n]+$', 'set_bet_sizes $1,flop,raise,75')
  $runtimeContent = [regex]::Replace($runtimeContent, '(?m)^set_bet_sizes (oop|ip),(turn|river),bet,[^\r\n]+$', 'set_bet_sizes $1,$2,bet,50')
  $runtimeContent = [regex]::Replace($runtimeContent, '(?m)^set_bet_sizes (oop|ip),(turn|river),(raise|donk|allin)[^\r\n]*\r?\n?', '')
  $runtimeContent = [regex]::Replace($runtimeContent, '(?m)^set_max_iteration\s+\d+\s*$', 'set_max_iteration 100')
  [System.IO.File]::WriteAllText(
    (Join-Path $RuntimeParameterRoot $file.Name),
    ($runtimeContent.TrimEnd("`r", "`n") + "`n"),
    [System.Text.Encoding]::ASCII
  )
}

& $BackgroundRunner `
  -ParameterRoot $RuntimeParameterRoot `
  -Limit 999 `
  -MinimumFreeMemoryPercent 35 `
  -MaximumCpuPercent 40 `
  -ProcessPriority BelowNormal `
  -StopBelowFreeMemoryPercent 25 `
  -ContinueOnSolverFailure `
  -LogName "texas-solver-day-40-$Wave"
