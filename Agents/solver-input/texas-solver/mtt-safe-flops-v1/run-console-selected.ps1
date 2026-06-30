param(
  [int]$Limit = 1
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

Push-Location $solverRoot
try {
  foreach ($file in $files) {
    Write-Host "Solving $($file.Name)..."
    $before = Get-ChildItem -LiteralPath $solverRoot -Filter "pkrtrainer_*.json" -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty FullName
    .\console_solver.exe -i $file.FullName
    $after = Get-ChildItem -LiteralPath $solverRoot -Filter "pkrtrainer_*.json" -ErrorAction SilentlyContinue
    foreach ($json in $after) {
      if ($before -notcontains $json.FullName) {
        Move-Item -LiteralPath $json.FullName -Destination (Join-Path $outputRoot $json.Name) -Force
        Write-Host "Moved $($json.Name) to $outputRoot"
      }
    }
  }
} finally {
  Pop-Location
}
