param(
  [int]$IntervalMinutes = 30,
  [int]$MaxMinutes = 10080,
  [switch]$Once
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path
$ArtifactsDir = Join-Path $RepoRoot "artifacts\mtt-solver-batch-prep"
$LogPath = Join-Path $ArtifactsDir ("prep-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
$MutexName = "Local\PKRTrainerMttSolverBatchPrepV1"
$Deadline = (Get-Date).AddMinutes($MaxMinutes)
$Npm = (Get-Command npm.cmd -ErrorAction Stop).Source

New-Item -ItemType Directory -Force -Path $ArtifactsDir | Out-Null
Set-Content -LiteralPath $LogPath -Value @() -Encoding UTF8

function Write-PrepLog([string]$Message) {
  $line = "[{0}] {1}" -f (Get-Date -Format "s"), $Message
  [System.IO.File]::AppendAllText($LogPath, "$line`r`n", [System.Text.Encoding]::UTF8)
  Write-Output $line
}

function Invoke-LoggedNpm([string]$Label, [string[]]$Arguments) {
  Write-PrepLog "${Label}: npm $($Arguments -join ' ')" | Out-Null
  & $Npm @Arguments | ForEach-Object { Write-PrepLog ([string]$_) | Out-Null }
  $exitCode = $LASTEXITCODE
  Write-PrepLog "${Label} exit code=$exitCode" | Out-Null
  return $exitCode
}

function Should-DeferForLowMemory {
  try {
    $os = Get-CimInstance Win32_OperatingSystem
    $computer = Get-CimInstance Win32_ComputerSystem
    $totalBytes = [double]$computer.TotalPhysicalMemory
    $freeBytes = [double]$os.FreePhysicalMemory * 1KB
    if ($totalBytes -le 0) { return $false }
    $freePercent = ($freeBytes / $totalBytes) * 100
    if ($freePercent -ge 10) { return $false }
    Write-PrepLog ("Low physical memory ({0:N2}GB, {1:N1}% free); deferring next-batch preparation without touching TexasSolver." -f ($freeBytes / 1GB), $freePercent)
    return $true
  } catch {
    Write-PrepLog "Could not inspect physical memory; continuing isolated batch preparation."
    return $false
  }
}

$mutex = New-Object System.Threading.Mutex($false, $MutexName)
$hasMutex = $false
try {
  $hasMutex = $mutex.WaitOne(0, $false)
  if (-not $hasMutex) {
    Write-PrepLog "Another solver-batch prep cycle owns the mutex; exiting without duplication."
    exit 0
  }

  Push-Location $RepoRoot
  try {
    do {
      if (Should-DeferForLowMemory) {
        if ($Once) {
          Write-PrepLog "Once mode; prep cycle deferred for low memory."
          break
        }
        Start-Sleep -Seconds ([Math]::Max(60, $IntervalMinutes * 60))
        continue
      }
      $prepareExit = Invoke-LoggedNpm "Prepare next review batch" @(
        "run", "mtt:texas-solver-large-flop-batch", "--", "--preset=next", "--write", "--summary"
      )
      $auditExit = if ($prepareExit -eq 0) {
        Invoke-LoggedNpm "Audit next review batch" @(
          "run", "mtt:texas-solver-scenario-audit", "--", "--manifest",
          "Agents/solver-input/texas-solver/mtt-safe-flops-v1/coverage-next-flop-review-v1-manifest.json", "--summary"
        )
      } else {
        -1
      }

      if ($prepareExit -eq 0 -and $auditExit -eq 0) {
        Write-PrepLog "Next 72-board review batch is prepared and audited. It remains outside the active solver queue."
      } else {
        Write-PrepLog "Preparation or audit failed; the next cycle will retry without changing the active solver queue."
      }

      if ($Once) {
        Write-PrepLog "Once mode; prep cycle finished."
        break
      }
      Start-Sleep -Seconds ([Math]::Max(60, $IntervalMinutes * 60))
    } while ((Get-Date) -lt $Deadline)
  } finally {
    Pop-Location
  }
} finally {
  if ($hasMutex) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
