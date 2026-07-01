param(
  [int]$Limit = 10,
  [switch]$RunSolve,
  [switch]$Force,
  [switch]$StageExisting,
  [switch]$ReviewTemplate
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")
$runner = Join-Path $PSScriptRoot "run-console-selected.ps1"
$families = @(
  "MTT9_50BB_BTN_BB_SRP",
  "MTT9_40BB_UTG_BB_SRP",
  "MTT9_35BB_CO_BTN_3BP"
)

function Invoke-Checked($FilePath, [string[]]$Arguments) {
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($Arguments -join ' ')"
  }
}

if (-not (Test-Path $runner)) {
  throw "Missing TexasSolver console runner: $runner"
}

Push-Location $repoRoot
try {
  Write-Host "PKRTrainer repo: $repoRoot"
  Write-Host "TexasSolver nightly verification preflight"

  Invoke-Checked "npm" @("run", "mtt:texas-solver-pack", "--", "--output=artifacts/texas-solver-parameter-pack/report.json")

  Write-Host ""
  Write-Host "Selected TexasSolver parameter files:"
  Invoke-Checked "powershell" @("-ExecutionPolicy", "Bypass", "-File", $runner, "-Limit", "$Limit", "-ListOnly")

  if (-not $RunSolve) {
    Write-Host ""
    Write-Host "Safe dry run only. Re-run with -RunSolve to execute console_solver.exe."
    if (-not $StageExisting) {
      Write-Host "Use -StageExisting to stage already completed raw JSON exports without solving."
      exit 0
    }
  }

  if ($RunSolve) {
    $solveArgs = @("-ExecutionPolicy", "Bypass", "-File", $runner, "-Limit", $Limit)
    if ($Force) {
      $solveArgs += "-Force"
    }
    Write-Host ""
    Write-Host "Running TexasSolver console batch..."
    Invoke-Checked "powershell" $solveArgs
  }

  Write-Host ""
  Write-Host "Staging TexasSolver raw exports for review..."
  foreach ($family in $families) {
    $stageArgs = @("run", "mtt:stage-texas-solver", "--", "--family=$family", "--write")
    if ($ReviewTemplate) {
      $stageArgs += "--review-template"
    }
    Invoke-Checked "npm" $stageArgs
  }

  Write-Host ""
  Write-Host "Refreshing TexasSolver solver-verification report..."
  Invoke-Checked "npm" @("run", "mtt:solver-verification", "--", "--solver=texas-solver", "--output=artifacts/mtt-solver-verification/report.json")
} finally {
  Pop-Location
}
