param(
  [switch]$KeepPowerPlan,
  [switch]$Quiet
)

$ErrorActionPreference = "Stop"
$SelfPid = $PID
$TaskPatterns = @(
  "PKRTrainer*TexasSolver*",
  "PKRTrainer-MTT-Task-Agent-*",
  "PKRTrainer-MTT-Autonomous-Cycle",
  "PKRTrainer-MTT-Solver-Batch-Prep"
)
$ProcessPatterns = @(
  "start-texas-solver-day-40.ps1",
  "start-texas-solver-night-100.ps1",
  "run-texas-solver-low-memory.ps1",
  "resume-texas-solver-queue.ps1",
  "run-console-selected.ps1",
  "watch-texas-solver-resource-guard.ps1",
  "watch-ingest-completed.ps1",
  "run-mtt-autonomous-cycle.ps1",
  "run-mtt-solver-batch-prep-cycle.ps1",
  "texas-solver-background"
)

function Test-MatchesAnyPattern([string]$Value, [string[]]$Patterns) {
  foreach ($pattern in $Patterns) {
    if ($Value -like "*$pattern*") { return $true }
  }
  return $false
}

$tasks = @(Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object {
  $taskName = [string]$_.TaskName
  foreach ($pattern in $TaskPatterns) {
    if ($taskName -like $pattern) { return $true }
  }
  return $false
})
foreach ($task in $tasks) {
  if ($task.State -eq "Running") {
    Stop-ScheduledTask -TaskName $task.TaskName -ErrorAction SilentlyContinue
  }
  Disable-ScheduledTask -TaskName $task.TaskName -ErrorAction SilentlyContinue | Out-Null
}

$allProcesses = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
$managedRoots = @($allProcesses | Where-Object {
  $_.ProcessId -ne $SelfPid -and
  $_.Name -ieq "powershell.exe" -and
  -not [string]::IsNullOrWhiteSpace([string]$_.CommandLine) -and
  (Test-MatchesAnyPattern ([string]$_.CommandLine) $ProcessPatterns)
})
$knownIds = @{}
foreach ($process in $managedRoots) { $knownIds[[int]$process.ProcessId] = $true }
$descendants = @()
$found = $true
while ($found) {
  $found = $false
  foreach ($process in $allProcesses) {
    $processId = [int]$process.ProcessId
    if ($knownIds.ContainsKey($processId)) { continue }
    if ($knownIds.ContainsKey([int]$process.ParentProcessId)) {
      $knownIds[$processId] = $true
      $descendants += $process
      $found = $true
    }
  }
}

foreach ($process in @($descendants)) {
  Stop-Process -Id ([int]$process.ProcessId) -Force -ErrorAction SilentlyContinue
}
Get-Process -Name "console_solver" -ErrorAction SilentlyContinue |
  Stop-Process -Force -ErrorAction SilentlyContinue
foreach ($process in @($managedRoots)) {
  Stop-Process -Id ([int]$process.ProcessId) -Force -ErrorAction SilentlyContinue
}

if (-not $KeepPowerPlan) {
  & powercfg.exe /setactive SCHEME_BALANCED 2>$null
}

Start-Sleep -Seconds 1
$remainingSolver = @(Get-Process -Name "console_solver" -ErrorAction SilentlyContinue)
$remainingManaged = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
  $_.ProcessId -ne $SelfPid -and
  $_.Name -ieq "powershell.exe" -and
  -not [string]::IsNullOrWhiteSpace([string]$_.CommandLine) -and
  (Test-MatchesAnyPattern ([string]$_.CommandLine) $ProcessPatterns)
})
if ($remainingSolver.Count -gt 0 -or $remainingManaged.Count -gt 0) {
  throw "TexasSolver stop verification failed: solver=$($remainingSolver.Count), managed=$($remainingManaged.Count)."
}

if (-not $Quiet) {
  Write-Host "TexasSolver stopped."
  Write-Host "Disabled recurring tasks: $(if ($tasks.Count) { $tasks.TaskName -join ', ' } else { 'none found' })"
  Write-Host "Remaining console_solver processes: 0"
  Write-Host "Remaining managed background processes: 0"
}
