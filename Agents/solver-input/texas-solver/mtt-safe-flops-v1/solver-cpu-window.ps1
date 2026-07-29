# Shared day/night CPU policy for the background solver.
#
# Development and solving want opposite things from the machine, and which one
# matters changes with the clock rather than with anything the solver knows. So
# the policy lives here, in one place, and is read both by the worker when it
# starts a tick and by the applier that runs on a timer.
#
# The applier matters because a solve is long: a board can run over an hour, so a
# process that started under the day cap would otherwise keep it for the whole
# night. Affinity can be changed on a live process, so the timer re-applies the
# current policy to whatever is running instead of waiting for a restart.
#
# Dot-source this file; it defines functions and does nothing on its own.

function Get-SolverCpuPolicy {
  param(
    [int]$DayCorePercent = 40,
    [int]$NightCorePercent = 95,
    [int]$NightStartHour = 21,
    [int]$NightEndHour = 9,
    [DateTime]$Now = (Get-Date)
  )
  # The night window wraps past midnight, so it is "at or after the start OR
  # before the end", never a single between-test.
  $hour = $Now.Hour
  $isNight = if ($NightStartHour -le $NightEndHour) {
    ($hour -ge $NightStartHour) -and ($hour -lt $NightEndHour)
  } else {
    ($hour -ge $NightStartHour) -or ($hour -lt $NightEndHour)
  }

  # Affinity alone does not raise utilisation: six threads pinned to fifteen cores
  # still do six cores of work. Thread count has to move with the window, so it is
  # part of the policy rather than a separate knob that can drift out of step.
  if ($isNight) {
    return [pscustomobject]@{
      Window       = "NIGHT"
      CorePercent  = $NightCorePercent
      Threads      = [Math]::Max(1, (Get-SolverCoreCount -Percent $NightCorePercent) - 1)
      Priority     = "Normal"
      Reason       = "Nobody is developing between ${NightStartHour}:00 and ${NightEndHour}:00, so the solver takes the machine."
    }
  }
  return [pscustomobject]@{
    Window       = "DAY"
    CorePercent  = $DayCorePercent
    Threads      = [Math]::Max(1, (Get-SolverCoreCount -Percent $DayCorePercent))
    Priority     = "BelowNormal"
    Reason       = "Development runs beside the solver, so it keeps a minority of the cores."
  }
}

function Get-SolverCoreCount {
  param([int]$Percent)
  $total = [Environment]::ProcessorCount
  if ($Percent -ge 100) { return $total }
  # At least one core, and leave at least one free whenever a cap was asked for.
  return [Math]::Max(1, [Math]::Min($total - 1, [int][Math]::Round($total * $Percent / 100.0)))
}

function Set-SolverCpuCap {
  param(
    [int]$CorePercent,
    [string]$Priority = "BelowNormal"
  )
  $total = [Environment]::ProcessorCount
  $cores = Get-SolverCoreCount -Percent $CorePercent
  $mask = ([bigint]1 -shl $cores) - 1
  $applied = 0
  foreach ($proc in @(Get-Process console_solver -ErrorAction SilentlyContinue)) {
    try {
      $proc.ProcessorAffinity = [IntPtr][int64]$mask
      $proc.PriorityClass = [System.Diagnostics.ProcessPriorityClass]$Priority
      $applied++
    } catch {
      Write-Warning "Could not re-cap solver pid $($proc.Id): $($_.Exception.Message)"
    }
  }
  [pscustomobject]@{
    Cores       = $cores
    TotalCores  = $total
    Percent     = [Math]::Round(100.0 * $cores / $total)
    Priority    = $Priority
    ProcessCount = $applied
  }
}

# The state file the applier writes. Kept here so the worker and the applier read
# the same override from the same place - the worker used to consult only the
# clock, so a machine claimed for development still restarted the solver with the
# night thread count and only its affinity was clawed back afterwards.
function Get-SolverCpuStatePath {
  $repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path
  return (Join-Path $repo "artifacts\uniform-tree-weekend\cpu-window-state.json")
}

function Get-SolverCpuOverride {
  try { return (Get-Content (Get-SolverCpuStatePath) -Raw | ConvertFrom-Json).Override } catch { return $null }
}

<#
  The policy actually in force: the manual claim when one is set, the clock
  otherwise. Everything that decides how much machine the solver gets should call
  this rather than Get-SolverCpuPolicy directly.
#>
function Get-EffectiveSolverCpuPolicy {
  param(
    [int]$DayCorePercent = 40,
    [int]$NightCorePercent = 95,
    [int]$NightStartHour = 21,
    [int]$NightEndHour = 9,
    [int]$IdleMinutesForSolving = 30
  )
  $override = Get-SolverCpuOverride
  # FOLLOW hands the machine back and forth on its own: the solver takes it while
  # nobody is developing and yields the moment work resumes. The threshold is
  # longer than a full test suite so a quiet stretch mid-run is not mistaken for
  # an idle machine.
  if ($override -eq "FOLLOW") {
    $idle = Get-DevelopmentIdleMinutes
    $policy = if ($idle -ge $IdleMinutesForSolving) {
      Get-SolverCpuPolicy -DayCorePercent $DayCorePercent -NightCorePercent $NightCorePercent -NightStartHour 0 -NightEndHour 24
    } else {
      Get-SolverCpuPolicy -DayCorePercent $DayCorePercent -NightCorePercent $NightCorePercent -NightStartHour 0 -NightEndHour 0
    }
    return $policy | Add-Member -NotePropertyName IdleMinutes -NotePropertyValue ([Math]::Round($idle, 1)) -PassThru -Force
  }
  # An override is expressed as a window covering all hours or none, so the
  # policy stays a pure function of its inputs.
  if ($override -eq "DAY") {
    return Get-SolverCpuPolicy -DayCorePercent $DayCorePercent -NightCorePercent $NightCorePercent -NightStartHour 0 -NightEndHour 0
  }
  if ($override -eq "NIGHT") {
    return Get-SolverCpuPolicy -DayCorePercent $DayCorePercent -NightCorePercent $NightCorePercent -NightStartHour 0 -NightEndHour 24
  }
  return Get-SolverCpuPolicy -DayCorePercent $DayCorePercent -NightCorePercent $NightCorePercent -NightStartHour $NightStartHour -NightEndHour $NightEndHour
}

<#
  When was development last active?

  Credit running out cannot be observed from this machine - it is a property of
  the assistant session, not the host. But the thing that actually matters can
  be: whether anyone is working. When a session stops, edits and commits stop
  with it, and when it resumes they start again. So activity is read from the
  repository rather than from any notion of credit.

  Deliberately excludes artifacts and solver-input: the solver writes there
  constantly, and counting its own output as development activity would make it
  hold the small cap forever.
#>
function Get-DevelopmentIdleMinutes {
  $repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path
  $newest = $null
  foreach ($rel in @("src", "tests", "scripts", "package.json", ".git\index")) {
    $path = Join-Path $repo $rel
    if (-not (Test-Path $path)) { continue }
    $stamp = if (Test-Path $path -PathType Container) {
      (Get-ChildItem -Path $path -Recurse -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime
    } else {
      (Get-Item $path).LastWriteTime
    }
    if ($null -ne $stamp -and ($null -eq $newest -or $stamp -gt $newest)) { $newest = $stamp }
  }
  if ($null -eq $newest) { return [double]::PositiveInfinity }
  return ((Get-Date) - $newest).TotalMinutes
}
