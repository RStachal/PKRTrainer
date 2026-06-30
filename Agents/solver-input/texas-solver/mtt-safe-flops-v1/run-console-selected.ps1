param(
  [int]$Limit = 1,
  [switch]$Force,
  [switch]$ListOnly
)

$ErrorActionPreference = "Stop"

$solverRoot = "C:\Users\stachal\Downloads\TexasSolver-v0.2.0-Windows\TexasSolver-v0.2.0-Windows"
$parameterRoot = "C:\Users\stachal\PKRTrainer\PKRTrainer\Agents\solver-input\texas-solver\mtt-safe-flops-v1\parameters\pkrtrainer_mtt_safe_flops_v1"
$outputRoot = "C:\Users\stachal\PKRTrainer\PKRTrainer\Agents\solver-input\gto-plus\sample-postflop-v1\output\texas-solver\MTT9_50BB_BTN_BB_SRP\raw"

if (-not (Test-Path (Join-Path $solverRoot "console_solver.exe"))) {
  throw "TexasSolver console_solver.exe not found: $solverRoot"
}

if (-not (Test-Path $parameterRoot)) {
  throw "Parameter root not found: $parameterRoot"
}

New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null

$files = Get-ChildItem -LiteralPath $parameterRoot -Filter "*.txt" | Sort-Object Name | Select-Object -First $Limit
if ($files.Count -eq 0) {
  throw "No TexasSolver parameter files found in $parameterRoot"
}

Write-Host "TexasSolver root: $solverRoot"
Write-Host "Parameter root: $parameterRoot"
Write-Host "Output root: $outputRoot"
Write-Host "Selected files: $($files.Count)"

if ($ListOnly) {
  foreach ($file in $files) {
    $dumpName = Select-String -LiteralPath $file.FullName -Pattern "^dump_result\s+(.+)$" |
      Select-Object -First 1 |
      ForEach-Object { $_.Matches[0].Groups[1].Value.Trim() }
    if ([string]::IsNullOrWhiteSpace($dumpName)) {
      $dumpName = "$($file.BaseName).json"
    }
    $target = Join-Path $outputRoot $dumpName
    $state = if (Test-Path $target) { "EXISTS" } else { "PENDING" }
    Write-Host "$state $($file.Name) -> $target"
  }
  exit 0
}

Push-Location $solverRoot
try {
  foreach ($file in $files) {
    $dumpName = Select-String -LiteralPath $file.FullName -Pattern "^dump_result\s+(.+)$" |
      Select-Object -First 1 |
      ForEach-Object { $_.Matches[0].Groups[1].Value.Trim() }
    if ([string]::IsNullOrWhiteSpace($dumpName)) {
      throw "Missing dump_result line in $($file.FullName)"
    }
    $target = Join-Path $outputRoot $dumpName
    if ((Test-Path $target) -and -not $Force) {
      Write-Host "Skipping $($file.Name); output already exists: $target"
      continue
    }
    if ((Test-Path $target) -and $Force) {
      Remove-Item -LiteralPath $target -Force
    }

    Write-Host "Solving $($file.Name)..."
    .\console_solver.exe -i $file.FullName
    $source = Join-Path $solverRoot $dumpName
    if (-not (Test-Path $source)) {
      throw "Solve finished but expected dump was not found: $source"
    }
    Move-Item -LiteralPath $source -Destination $target -Force
    Write-Host "Moved $dumpName to $outputRoot"
  }
} finally {
  Pop-Location
}
