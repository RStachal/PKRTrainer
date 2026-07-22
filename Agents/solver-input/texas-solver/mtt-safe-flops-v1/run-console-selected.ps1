param(
  [int]$Limit = 1,
  [switch]$Force,
  [switch]$AccuracyOnly,
  [switch]$ListOnly,
  [string]$Family = "",
  [int]$MinimumFreeMemoryPercent = 10,
  [ValidateRange(1, 100)]
  [int]$MaximumCpuPercent = 100,
  [ValidateSet("Idle", "BelowNormal", "Normal", "AboveNormal")]
  [string]$ProcessPriority = "Normal",
  [switch]$ContinueOnSolverFailure,
  [string]$FailureReportPath = "",
  [string]$ResourceStopReportPath = "",
  [string]$SolverRoot = "C:\Users\stachal\PKRTrainer\tools\TexasSolver-v0.2.0-Windows\TexasSolver-v0.2.0-Windows",
  [string]$ParameterRoot = "C:\Users\stachal\PKRTrainer\PKRTrainer\Agents\solver-input\texas-solver\mtt-safe-flops-v1\parameters\pkrtrainer_mtt_safe_flops_v1",
  [string]$OutputBase = "C:\Users\stachal\PKRTrainer\PKRTrainer\Agents\solver-input\gto-plus\sample-postflop-v1\output\texas-solver"
)

$ErrorActionPreference = "Stop"

$solverRoot = if (-not [string]::IsNullOrWhiteSpace($env:PKRTRAINER_TEXAS_SOLVER_ROOT)) {
  $env:PKRTRAINER_TEXAS_SOLVER_ROOT
} else {
  $SolverRoot
}
$parameterRoot = $ParameterRoot
$outputBase = $OutputBase

if ($MinimumFreeMemoryPercent -lt 0 -or $MinimumFreeMemoryPercent -gt 100) {
  throw "MinimumFreeMemoryPercent must be between 0 and 100."
}
if ($AccuracyOnly -and $Force) {
  throw "AccuracyOnly cannot be combined with Force because canonical raw checkpoints must remain untouched."
}

function Wait-ForStartResources {
  if ($MinimumFreeMemoryPercent -eq 0 -and $MaximumCpuPercent -ge 100) { return }
  do {
    try {
      $os = Get-CimInstance Win32_OperatingSystem
      $computer = Get-CimInstance Win32_ComputerSystem
      $totalBytes = [double]$computer.TotalPhysicalMemory
      $freeBytes = [double]$os.FreePhysicalMemory * 1KB
      $freePercent = if ($totalBytes -gt 0) { ($freeBytes / $totalBytes) * 100 } else { 100 }
      $cpuPercent = 0
      if ($MaximumCpuPercent -lt 100) {
        $cpu = Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -ErrorAction Stop |
          Where-Object { $_.Name -eq "_Total" } |
          Select-Object -First 1
        if ($null -eq $cpu) { throw "Could not read total CPU utilization." }
        $cpuPercent = [double]$cpu.PercentProcessorTime
      }
      if ($freePercent -ge $MinimumFreeMemoryPercent -and $cpuPercent -le $MaximumCpuPercent) { return }
      Write-Host ("Resource pressure (CPU {0:N1}% / max {1}%, RAM {2:N2}GB free, {3:N1}% / min {4}%); waiting before the next TexasSolver parameter." -f $cpuPercent, $MaximumCpuPercent, ($freeBytes / 1GB), $freePercent, $MinimumFreeMemoryPercent)
    } catch {
      Write-Host "Could not inspect CPU/RAM start limits; waiting before the next TexasSolver parameter. $($_.Exception.Message)"
    }
    Start-Sleep -Seconds 60
  } while ($true)
}

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
  if ([System.IO.Path]::GetFileName($dumpName) -cne $dumpName -or $dumpName -cnotmatch '^[A-Za-z0-9_]+[.]json$') {
    throw "Unsafe dump_result name in $($file.FullName): $dumpName"
  }
  return $dumpName
}

function Set-ProcessPriority([string]$Priority) {
  try {
    $currentProcess = [System.Diagnostics.Process]::GetCurrentProcess()
    $currentProcess.PriorityClass = [System.Diagnostics.ProcessPriorityClass]$Priority
    Write-Host "TexasSolver queue process priority: $($currentProcess.PriorityClass)"
  } catch {
    Write-Warning "Could not set TexasSolver queue process priority to $Priority; continuing with inherited priority. $($_.Exception.Message)"
  }
}

function Find-ResourceStop($file, [DateTimeOffset]$StartedAt) {
  if ([string]::IsNullOrWhiteSpace($ResourceStopReportPath) -or
      -not (Test-Path -LiteralPath $ResourceStopReportPath -PathType Leaf)) {
    return $null
  }
  $targetPath = [System.IO.Path]::GetFullPath($file.FullName)
  $lines = @(Get-Content -LiteralPath $ResourceStopReportPath -Tail 200 -ErrorAction SilentlyContinue)
  for ($index = $lines.Count - 1; $index -ge 0; $index -= 1) {
    try { $candidate = $lines[$index] | ConvertFrom-Json } catch { continue }
    if ([string]$candidate.reason -ne "RESOURCE_GUARD_STOP" -or
        [string]::IsNullOrWhiteSpace([string]$candidate.parameterPath)) {
      continue
    }
    $occurredAt = [DateTimeOffset]::MinValue
    if (-not [DateTimeOffset]::TryParse([string]$candidate.occurredAt, [ref]$occurredAt) -or
        $occurredAt -lt $StartedAt.AddSeconds(-5)) {
      continue
    }
    try { $candidatePath = [System.IO.Path]::GetFullPath([string]$candidate.parameterPath) } catch { continue }
    if ($candidatePath.Equals($targetPath, [System.StringComparison]::OrdinalIgnoreCase)) {
      return $candidate
    }
  }
  return $null
}

function Record-SolverFailure(
  $file,
  [string]$FamilyId,
  [string]$DumpName,
  [int]$ExitCode,
  [string]$Reason,
  $ResourceStop
) {
  $details = [ordered]@{
    occurredAt = (Get-Date -Format "o")
    parameter = $file.Name
    familyId = $FamilyId
    rawExport = $DumpName
    exitCode = $ExitCode
    reason = $Reason
  }
  if ($null -ne $ResourceStop) {
    $details.resourceStopOccurredAt = [string]$ResourceStop.occurredAt
    $details.solverProcessId = [int]$ResourceStop.solverProcessId
    $details.freeMemoryPercent = [double]$ResourceStop.freeMemoryPercent
    $details.thresholdPercent = [int]$ResourceStop.thresholdPercent
  }
  $entry = $details | ConvertTo-Json -Compress
  if (-not [string]::IsNullOrWhiteSpace($FailureReportPath)) {
    $failureDirectory = Split-Path -Parent $FailureReportPath
    if (-not [string]::IsNullOrWhiteSpace($failureDirectory)) {
      New-Item -ItemType Directory -Force -Path $failureDirectory | Out-Null
    }
    [System.IO.File]::AppendAllText($FailureReportPath, "$entry`r`n", (New-Object System.Text.UTF8Encoding($false)))
  }
  $marker = if ($Reason -eq "RESOURCE_GUARD_STOP") { "PKRTRAINER_SOLVER_GUARDED_STOP" } else { "PKRTRAINER_SOLVER_FAILED" }
  Write-Output "$marker parameter=$($file.Name) raw=$DumpName exit=$ExitCode reason=$Reason"
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

Set-ProcessPriority $ProcessPriority

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
    $logRoot = Join-Path (Split-Path $outputRoot -Parent) "solver-logs"
    $logPath = Join-Path $logRoot ("{0}.log" -f [System.IO.Path]::GetFileNameWithoutExtension($dumpName))
    $state = if ($AccuracyOnly) {
      if (-not (Test-Path $target)) { "MISSING_RAW" }
      elseif (Test-Path $logPath) { "ACCURACY_LOG_EXISTS" }
      else { "ACCURACY_LOG_PENDING" }
    } elseif (Test-Path $target) { "EXISTS" } else { "PENDING" }
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
    $logRoot = Join-Path (Split-Path $outputRoot -Parent) "solver-logs"
    $logPath = Join-Path $logRoot ("{0}.log" -f [System.IO.Path]::GetFileNameWithoutExtension($dumpName))
    if ($AccuracyOnly -and -not (Test-Path $target)) {
      throw "Accuracy-only recovery requires an existing canonical raw checkpoint: $target"
    }
    if (-not $AccuracyOnly -and (Test-Path $target) -and -not $Force) {
      Write-Host "Skipping $($file.Name); output already exists: $target"
      continue
    }
    if (-not $AccuracyOnly -and (Test-Path $target) -and $Force) {
      Remove-Item -LiteralPath $target -Force
    }

    # Do not add a new large tree while Windows is already under physical-memory pressure.
    Wait-ForStartResources

    $source = Join-Path $solverRoot $dumpName
    if (Test-Path -LiteralPath $source) {
      $resolvedSolverRoot = [System.IO.Path]::GetFullPath($solverRoot).TrimEnd('\') + '\'
      $resolvedSource = [System.IO.Path]::GetFullPath($source)
      if (-not $resolvedSource.StartsWith($resolvedSolverRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove stale dump outside TexasSolver root: $resolvedSource"
      }
      Write-Host "Removing stale solver-root dump from an interrupted run: $resolvedSource"
      Remove-Item -LiteralPath $resolvedSource -Force
    }

    # Write-Output survives the parent queue capture and binds evidence to one raw export.
    Write-Output "PKRTRAINER_SOLVER_BEGIN parameter=$($file.Name) raw=$dumpName"
    Write-Host "Solving $($file.Name)..."
    New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
    $solverStartedAt = [DateTimeOffset]::Now
    & .\console_solver.exe -i $file.FullName 2>&1 | Tee-Object -FilePath $logPath
    $solverExitCode = [int]$LASTEXITCODE
    if ($solverExitCode -ne 0) {
      $resourceStop = Find-ResourceStop $file $solverStartedAt
      $failureReason = if ($null -ne $resourceStop) { "RESOURCE_GUARD_STOP" } else { "NATIVE_SOLVER_EXIT" }
      Record-SolverFailure $file $familyId $dumpName $solverExitCode $failureReason $resourceStop
      if ($ContinueOnSolverFailure) {
        if ($failureReason -eq "RESOURCE_GUARD_STOP") {
          Write-Warning "TexasSolver was stopped by the RAM guard for $($file.Name); the checkpoint remains pending for a later resource-safe retry."
        } else {
          Write-Warning "TexasSolver failed for $($file.Name); continuing with the next parameter."
        }
        continue
      }
      throw "TexasSolver exited with code $solverExitCode for $($file.Name)."
    }
    if (-not (Test-Path $source)) {
      throw "Solve finished but expected dump was not found: $source"
    }
    if ($AccuracyOnly) {
      # The canonical raw checkpoint predates this recovery and remains the
      # evidence source. Discard only the duplicate solver-root dump.
      Remove-Item -LiteralPath $source -Force
      Write-Output "PKRTRAINER_SOLVER_ACCURACY_END parameter=$($file.Name) raw=$dumpName exit=0"
      Write-Host "Recovered solver accuracy log without replacing $target"
      continue
    }
    Move-Item -LiteralPath $source -Destination $target -Force
    Write-Output "PKRTRAINER_SOLVER_END parameter=$($file.Name) raw=$dumpName exit=0"
    Write-Host "Moved $dumpName to $outputRoot"
  }
} finally {
  Pop-Location
}
