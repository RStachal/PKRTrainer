param(
  [int]$Limit = 1,
  [switch]$Force,
  [switch]$ListOnly,
  [string]$Family = "",
  [string]$SolverRoot = "C:\Users\stachal\Downloads\TexasSolver-v0.2.0-Windows\TexasSolver-v0.2.0-Windows",
  [string]$ParameterRoot = "C:\Users\stachal\PKRTrainer\PKRTrainer\Agents\solver-input\texas-solver\mtt-safe-flops-v1\parameters\pkrtrainer_mtt_safe_flops_v1",
  [string]$OutputBase = "C:\Users\stachal\PKRTrainer\PKRTrainer\Agents\solver-input\gto-plus\sample-postflop-v1\output\texas-solver"
)

$ErrorActionPreference = "Stop"

$solverRoot = $SolverRoot
$parameterRoot = $ParameterRoot
$outputBase = $OutputBase

function Get-FamilyIdFromParameterFile($file) {
  $name = $file.BaseName -replace '^\d+_', ''
  $lastUnderscore = $name.LastIndexOf('_')
  if ($lastUnderscore -lt 1) {
    throw "Cannot infer family id from parameter file name: $($file.Name)"
  }
  return $name.Substring(0, $lastUnderscore)
}

function Get-DumpName($file) {
  $dumpName = Select-String -LiteralPath $file.FullName -Pattern "^dump_result\s+(.+)$" |
    Select-Object -First 1 |
    ForEach-Object { $_.Matches[0].Groups[1].Value.Trim() }
  if ([string]::IsNullOrWhiteSpace($dumpName)) {
    throw "Missing dump_result line in $($file.FullName)"
  }
  return $dumpName
}

if (-not (Test-Path (Join-Path $solverRoot "console_solver.exe"))) {
  throw "TexasSolver console_solver.exe not found: $solverRoot"
}

if (-not (Test-Path $parameterRoot)) {
  throw "Parameter root not found: $parameterRoot"
}

$files = Get-ChildItem -LiteralPath $parameterRoot -Filter "*.txt" | Sort-Object Name
if (-not [string]::IsNullOrWhiteSpace($Family)) {
  $files = $files | Where-Object { (Get-FamilyIdFromParameterFile $_) -eq $Family }
}
$files = $files | Select-Object -First $Limit
if ($files.Count -eq 0) {
  throw "No TexasSolver parameter files found in $parameterRoot for family filter '$Family'"
}

Write-Host "TexasSolver root: $solverRoot"
Write-Host "Parameter root: $parameterRoot"
Write-Host "Output base: $outputBase"
if (-not [string]::IsNullOrWhiteSpace($Family)) {
  Write-Host "Family filter: $Family"
}
Write-Host "Selected files: $($files.Count)"

if ($ListOnly) {
  foreach ($file in $files) {
    $familyId = Get-FamilyIdFromParameterFile $file
    $outputRoot = Join-Path $outputBase (Join-Path $familyId "raw")
    $dumpName = Get-DumpName $file
    $target = Join-Path $outputRoot $dumpName
    $state = if (Test-Path $target) { "EXISTS" } else { "PENDING" }
    Write-Host "$state [$familyId] $($file.Name) -> $target"
  }
  exit 0
}

Push-Location $solverRoot
try {
  foreach ($file in $files) {
    $familyId = Get-FamilyIdFromParameterFile $file
    $outputRoot = Join-Path $outputBase (Join-Path $familyId "raw")
    New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null
    $dumpName = Get-DumpName $file
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
