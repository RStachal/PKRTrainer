param(
  [Parameter(Mandatory = $true)]
  [int]$OwnerProcessId,
  [int]$StopBelowFreeMemoryPercent = 25,
  [int]$PollSeconds = 15,
  [int]$ConsecutiveSamples = 3,
  [int]$MaxMinutes = 10080,
  [string]$LogPath = ""
)

$ErrorActionPreference = "Stop"
if ($StopBelowFreeMemoryPercent -lt 10 -or $StopBelowFreeMemoryPercent -gt 50) {
  throw "StopBelowFreeMemoryPercent must be between 10 and 50."
}
if ($PollSeconds -lt 5 -or $ConsecutiveSamples -lt 2) {
  throw "Resource guard polling values are too aggressive."
}
if ([string]::IsNullOrWhiteSpace($LogPath)) {
  $LogPath = Join-Path $env:TEMP "pkrtrainer-texas-solver-resource-guard.log"
}
$Deadline = (Get-Date).AddMinutes($MaxMinutes)
$LowSamples = 0
$EmergencyStops = 0

function Write-GuardLog([string]$Message) {
  $line = "[{0}] {1}" -f (Get-Date -Format "s"), $Message
  [System.IO.File]::AppendAllText($LogPath, "$line`r`n", [System.Text.Encoding]::UTF8)
}

function Get-OwnedSolverProcesses {
  $all = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
  $known = @{ $OwnerProcessId = $true }
  $descendants = @()
  $found = $true
  while ($found) {
    $found = $false
    foreach ($process in $all) {
      $id = [int]$process.ProcessId
      $parentId = [int]$process.ParentProcessId
      if ($known.ContainsKey($parentId) -and -not $known.ContainsKey($id)) {
        $known[$id] = $true
        $descendants += $process
        $found = $true
      }
    }
  }
  return @($descendants | Where-Object { $_.Name -ieq "console_solver.exe" })
}

Write-GuardLog "Resource guard started for worker PID $OwnerProcessId; threshold=$StopBelowFreeMemoryPercent%, samples=$ConsecutiveSamples."
while ((Get-Date) -lt $Deadline) {
  if ($null -eq (Get-Process -Id $OwnerProcessId -ErrorAction SilentlyContinue)) {
    Write-GuardLog "Worker PID $OwnerProcessId exited; resource guard finished."
    exit 0
  }
  $targets = @(Get-OwnedSolverProcesses)
  if ($targets.Count -eq 0) {
    $LowSamples = 0
    Start-Sleep -Seconds $PollSeconds
    continue
  }
  $os = Get-CimInstance Win32_OperatingSystem
  $computer = Get-CimInstance Win32_ComputerSystem
  $freePercent = if ([double]$computer.TotalPhysicalMemory -gt 0) {
    100 * ([double]$os.FreePhysicalMemory * 1KB) / [double]$computer.TotalPhysicalMemory
  } else { 100 }
  if ($freePercent -lt $StopBelowFreeMemoryPercent) { $LowSamples += 1 } else { $LowSamples = 0 }
  if ($LowSamples -ge $ConsecutiveSamples) {
    $ids = @($targets | ForEach-Object { [int]$_.ProcessId })
    Write-GuardLog ("Emergency stop: {0:N1}% RAM free for {1} samples; stopping owned console_solver PID(s) {2}." -f $freePercent, $LowSamples, ($ids -join ","))
    foreach ($id in $ids) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
    $EmergencyStops += 1
    $LowSamples = 0
    Write-GuardLog "Resource guard remains active; the queue may resume only after its start limits pass. Emergency stops=$EmergencyStops."
  }
  Start-Sleep -Seconds $PollSeconds
}
Write-GuardLog "Resource guard deadline reached; emergency stops=$EmergencyStops."
