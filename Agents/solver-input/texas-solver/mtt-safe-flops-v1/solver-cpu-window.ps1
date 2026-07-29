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
    # Headroom left for everything else. Development gets the larger share,
    # because between 9:00 and 21:00 the machine is being worked on and the
    # solver is a background job rather than the point of the machine.
    [double]$DevelopmentReserveGb = 6,
    [double]$NightReserveGb = 3,
    # A solve is worth keeping alive down to a single thread; below that the
    # arithmetic is saying the tree itself does not fit.
    [int]$MinimumUsefulThreads = 1,
    # Taken from the machine unless given; passing it is what lets the policy be
    # checked against conditions this machine is not currently in.
    [double]$AvailableGb = 0,
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
  #
  # But threads cost memory, not just cores, and past a point that stops being a
  # trade and becomes a failure. Measured on this machine: fourteen threads on the
  # remaining deep families peaked at 24.3 GB of 31.2 GB, left under 4 GB free,
  # pushed commit to 43.9 GB, and finished nothing in three hours - the solver
  # died with an access violation instead, which is what the historical crash
  # exit codes were all along. Six threads had been running for hours at ~15 GB.
  #
  # So the night thread count is capped by a memory budget rather than by cores.
  if ($isNight) {
    return [pscustomobject]@{
      Window       = "NIGHT"
      CorePercent  = $NightCorePercent
      Threads      = Get-SolverThreadBudget -CoreThreads ([Math]::Max(1, (Get-SolverCoreCount -Percent $NightCorePercent) - 1)) -ReserveGb $NightReserveGb -AvailableGb $AvailableGb
      Priority     = "Normal"
      Run          = $true
      Reason       = "Nobody is developing between ${NightStartHour}:00 and ${NightEndHour}:00, so the solver takes the machine."
    }
  }

  # Between 9:00 and 21:00 the machine is being developed on and the solver runs
  # in the background on what is left. "What is left" is a memory question before
  # it is a core question: a core percentage alone assumed the solver could always
  # share the machine if it took fewer cores, and with a fixed 11 GB tree that is
  # false. So the day thread count comes from the memory budget against a reserve
  # sized for development, and the core cap only shapes how it competes for CPU.
  #
  # Run is false only when even one thread cannot fit, which means the tree alone
  # does not. Throttling cannot help there - only stopping frees the base - and
  # the low-memory guard in the applier handles the transient case where a full
  # build and test run temporarily needs everything.
  $dayBudget = Get-SolverThreadBudget -CoreThreads ([Math]::Max(1, (Get-SolverCoreCount -Percent $DayCorePercent))) -ReserveGb $DevelopmentReserveGb -AvailableGb $AvailableGb -AllowZero
  $fits = $dayBudget -ge $MinimumUsefulThreads
  $dayThreads = [Math]::Max(1, $dayBudget)
  return [pscustomobject]@{
    Window       = "DAY"
    CorePercent  = $DayCorePercent
    Threads      = $dayThreads
    Priority     = "BelowNormal"
    Run          = $fits
    Reason       = if ($fits) {
      "Development runs beside the solver, so it keeps a minority of the cores."
    } else {
      "Not even one thread fits beside the ${DevelopmentReserveGb} GB development reserve, so the tree itself does not fit. The solver yields until the machine is freer."
    }
  }
}

<#
  How many solver threads this machine can actually carry right now.

  Cost is a fixed base plus a per-thread increment, not a per-thread rate.
  Measured on the deep families left in the queue: 16.8 GB at six threads and
  24.3 GB at fourteen, which is a base of about 11 GB for the tree itself plus
  roughly 0.9 GB per thread.

  The budget is taken against memory that is actually AVAILABLE, not against the
  memory installed. Budgeting from the installed total was the second version of
  this and it produced a kill loop: this machine reports 31.2 GB installed but
  only about 19.9 GB free, because the operating system and the editor hold the
  rest. Nine threads were budgeted, needed 19.1 GB, drove free memory to 0.1 GB,
  and the low-memory guard stopped the solver a few minutes later - every fifteen
  minutes for six hours, finishing nothing.

  A running solver's own memory counts as available, since the budget decides
  what to restart it with. Without that, recomputing while it runs would see its
  own footprint as unavailable and spiral down to one thread.
#>
function Get-SolverThreadBudget {
  param(
    [int]$CoreThreads,
    [double]$BaseGb = 11,
    [double]$PeakGbPerThread = 0.9,
    # Headroom left for whatever else the machine is doing.
    [double]$ReserveGb = 3,
    # Taken from the machine unless given. Passing it is what lets the budget be
    # checked against conditions this machine is not currently in.
    [double]$AvailableGb = 0,
    # Report the true arithmetic instead of the usual floor of one thread. The
    # floor is right for "how many threads should this run use" and wrong for
    # "does a run fit at all" - clamping to one made every machine look like it
    # fit, including the ones where the tree alone does not.
    [switch]$AllowZero
  )
  try {
    $available = if ($AvailableGb -gt 0) { $AvailableGb } else { Get-SolverAvailableGb }
    $budget = [int][Math]::Floor((($available - $ReserveGb) - $BaseGb) / $PeakGbPerThread)
    if ($AllowZero) { return [Math]::Min($CoreThreads, $budget) }
    return [Math]::Max(1, [Math]::Min($CoreThreads, $budget))
  } catch {
    # Unable to read memory: fall back to the core-derived count rather than
    # inventing a cap, since being wrong low here only costs speed.
    return $CoreThreads
  }
}

<#
  Memory the solver could use: what is free, plus what a running solver already
  holds. The second term matters because this is used to decide what to restart
  with, and a solve that is about to be replaced is not competing with itself.
#>
function Get-SolverAvailableGb {
  $freeGb = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1MB
  $solverGb = 0
  foreach ($proc in @(Get-Process console_solver -ErrorAction SilentlyContinue)) {
    $solverGb += $proc.WorkingSet64 / 1GB
  }
  return $freeGb + $solverGb
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
  # An empty string means cleared, not set. Binding $null to a [string] parameter
  # turns it into "", so clearing the override wrote "" into the state file and
  # every status line afterwards announced an override nobody had asked for. The
  # policy was still right - "" matches no window - but the report was not.
  try {
    $value = (Get-Content (Get-SolverCpuStatePath) -Raw | ConvertFrom-Json).Override
    if ([string]::IsNullOrWhiteSpace($value)) { return $null }
    return $value
  } catch { return $null }
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
