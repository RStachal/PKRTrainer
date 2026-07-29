# Apply the current day/night CPU policy to whatever solver is running.
#
# Registered on a short timer so the switch happens on its own. A board can solve
# for over an hour, so without this a process started under the day cap would
# hold that cap all night, and the night window would buy nothing.
#
# Install:   .\apply-solver-cpu-window.ps1 -Action Install
# Status:    .\apply-solver-cpu-window.ps1 -Action Status
# Uninstall: .\apply-solver-cpu-window.ps1 -Action Uninstall
[CmdletBinding()]
param(
  # Day / Night claim the machine for one side until Auto hands it back. The
  # timer keeps re-applying the claim, so it survives restarts instead of
  # decaying quietly the way a one-off affinity change would.
  [ValidateSet("Apply", "Install", "Status", "Uninstall", "Day", "Night", "Auto", "Follow")]
  [string]$Action = "Apply",
  [string]$TaskName = "PKRTrainer-Solver-CpuWindow",
  [int]$DayCorePercent = 40,
  [int]$NightCorePercent = 95,
  [int]$NightStartHour = 21,
  [int]$NightEndHour = 9,
  [int]$IntervalMinutes = 15
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "solver-cpu-window.ps1")

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path
$logPath = Join-Path $repo "artifacts\uniform-tree-weekend\cpu-window.log"

function Write-WindowLog([string]$message) {
  $line = "[{0:yyyy-MM-ddTHH:mm:ss}] {1}" -f (Get-Date), $message
  try {
    New-Item -ItemType Directory -Force (Split-Path $logPath) | Out-Null
    Add-Content -LiteralPath $logPath -Value $line -Encoding utf8
  } catch { }
  Write-Host $line
}

$statePath = Join-Path $repo "artifacts\uniform-tree-weekend\cpu-window-state.json"

function Set-WindowOverride([string]$Value) {
  $previous = $null
  try { $previous = (Get-Content $statePath -Raw | ConvertFrom-Json).Window } catch { }
  New-Item -ItemType Directory -Force (Split-Path $statePath) | Out-Null
  @{ Window = $previous; Override = $Value; At = (Get-Date).ToString("s") } | ConvertTo-Json |
    Set-Content -LiteralPath $statePath -Encoding utf8
}

function Invoke-Apply {
  # An override wins over the clock. Expressed as a window covering all hours or
  # none, so the policy stays a pure function of its inputs rather than something
  # that pretends the time is different.
  $override = Get-SolverCpuOverride
  $policy = Get-EffectiveSolverCpuPolicy -DayCorePercent $DayCorePercent -NightCorePercent $NightCorePercent `
    -NightStartHour $NightStartHour -NightEndHour $NightEndHour
  if ($override -eq "FOLLOW") {
    Write-WindowLog ("Following development activity: idle {0} min -> {1} policy." -f $policy.IdleMinutes, $policy.Window)
  } elseif ($null -ne $override) {
    Write-WindowLog "Override active: $override (the clock says $((Get-Date).ToString('HH:mm')))."
  }
  $result = Set-SolverCpuCap -CorePercent $policy.CorePercent -Priority $policy.Priority
  if ($result.ProcessCount -eq 0) {
    Write-WindowLog "$($policy.Window): no solver running; policy is $($policy.CorePercent)% / $($policy.Priority)."
  } else {
    Write-WindowLog ("{0}: capped {1} solver process(es) to {2}/{3} cores (~{4}%) at {5}." -f `
      $policy.Window, $result.ProcessCount, $result.Cores, $result.TotalCores, $result.Percent, $result.Priority)
  }

  # Affinity can be widened on a live process, but thread count cannot: the worker
  # passed --threads when it started, so a run begun in the day would keep six
  # threads all night and the wider affinity would buy almost nothing. On a window
  # change the worker is therefore restarted so it re-reads the policy.
  #
  # This discards the board being solved. That is safe by design - the runner
  # backs up every checkpoint it is about to overwrite and restores anything an
  # interrupted run left missing - and it costs at most one board, twice a day,
  # against a window worth more than double the throughput.
  $previous = $null
  try { $previous = (Get-Content $statePath -Raw | ConvertFrom-Json).Window } catch { }
  if ($null -ne $previous -and $previous -ne $policy.Window -and $result.ProcessCount -gt 0) {
    Write-WindowLog "Window changed $previous -> $($policy.Window); restarting the worker so it picks up $($policy.Threads) threads."
    try {
      Stop-ScheduledTask -TaskName "PKRTrainer-Weekend-UniformResolve" -ErrorAction SilentlyContinue
      @(Get-Process console_solver -ErrorAction SilentlyContinue) | Stop-Process -Force -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 3
      Start-ScheduledTask -TaskName "PKRTrainer-Weekend-UniformResolve" -ErrorAction SilentlyContinue
      # Confirm it actually came back. A restart that quietly failed would stop
      # solving for the rest of an unattended window, so it is stated either way.
      $cameUp = $false
      foreach ($attempt in 1..12) {
        Start-Sleep -Seconds 5
        if (@(Get-Process console_solver -ErrorAction SilentlyContinue).Count -gt 0) { $cameUp = $true; break }
      }
      if ($cameUp) {
        Write-WindowLog "Worker restarted under the $($policy.Window) policy; solver is running."
        Set-SolverCpuCap -CorePercent $policy.CorePercent -Priority $policy.Priority | Out-Null
      } else {
        Write-WindowLog "WARNING: no solver came up within a minute of the $($policy.Window) restart. The worker's 30-minute trigger will retry."
      }
    } catch {
      Write-WindowLog "Could not restart the worker: $($_.Exception.Message)"
    }
  }
  try {
    New-Item -ItemType Directory -Force (Split-Path $statePath) | Out-Null
    @{ Window = $policy.Window; Override = $override; At = (Get-Date).ToString("s") } | ConvertTo-Json |
      Set-Content -LiteralPath $statePath -Encoding utf8
  } catch { }

  return $policy
}

switch ($Action) {
  "Apply" { Invoke-Apply | Out-Null; break }

  "Day"   { Set-WindowOverride "DAY";   Write-WindowLog "Override set to DAY; the solver yields the machine until Auto."; Invoke-Apply | Out-Null; break }
  "Night" { Set-WindowOverride "NIGHT"; Write-WindowLog "Override set to NIGHT; the solver takes the machine until Auto."; Invoke-Apply | Out-Null; break }
  "Auto"  { Set-WindowOverride $null;   Write-WindowLog "Override cleared; back to the clock."; Invoke-Apply | Out-Null; break }
  "Follow" { Set-WindowOverride "FOLLOW"; Write-WindowLog "Following development activity: the solver takes the machine while nobody is working and yields when work resumes."; Invoke-Apply | Out-Null; break }

  "Status" {
    # The effective policy, not the clock's opinion of it: reporting 95 percent
    # while an override held the solver to 40 would be worse than silence.
    $policy = Get-EffectiveSolverCpuPolicy -DayCorePercent $DayCorePercent -NightCorePercent $NightCorePercent `
      -NightStartHour $NightStartHour -NightEndHour $NightEndHour
    Write-Host "window:        $($policy.Window)  ($($policy.Reason))"
    Write-Host "policy:        $($policy.CorePercent)% cores, priority $($policy.Priority)"
    Write-Host "night window:  $($NightStartHour):00 to $($NightEndHour):00"
    $override = Get-SolverCpuOverride
    if ($null -eq $override) {
      Write-Host "override:      none (following the clock)"
    } else {
      # An override that nobody can see is how a machine ends up mysteriously
      # slow, so it is stated with the way back.
      $suffix = if ($override -eq "FOLLOW") {
        "  -- idle $([Math]::Round((Get-DevelopmentIdleMinutes),1)) min; solver takes over after 30"
      } else { "  -- run with -Action Auto to follow the clock again" }
      Write-Host "override:      $override$suffix"
    }
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($null -eq $task) {
      Write-Host "timer task:    NOT INSTALLED - the switch will not happen on its own"
    } else {
      Write-Host "timer task:    $($task.State), every $IntervalMinutes minute(s)"
    }
    foreach ($proc in @(Get-Process console_solver -ErrorAction SilentlyContinue)) {
      $total = [Environment]::ProcessorCount
      $mask = [int64]$proc.ProcessorAffinity
      $cores = 0
      for ($bit = 0; $bit -lt $total; $bit++) { if ($mask -band ([int64]1 -shl $bit)) { $cores++ } }
      Write-Host "solver pid $($proc.Id): cores=$cores/$total (~$([Math]::Round(100.0*$cores/$total))%) priority=$($proc.PriorityClass)"
    }
    break
  }

  "Install" {
    $arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`"" +
      " -Action Apply -DayCorePercent $DayCorePercent -NightCorePercent $NightCorePercent" +
      " -NightStartHour $NightStartHour -NightEndHour $NightEndHour"
    $taskAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments -WorkingDirectory $repo
    $currentUser = "$env:USERDOMAIN\$env:USERNAME"
    $atLogon = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
    $repeating = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
      -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) -RepetitionDuration (New-TimeSpan -Days 30)
    $principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
      -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
    $task = New-ScheduledTask -Action $taskAction -Trigger @($atLogon, $repeating) `
      -Principal $principal -Settings $settings `
      -Description "Applies the PKRTrainer day/night solver CPU policy to any running solver."
    Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null
    Write-Host "Installed scheduled task: $TaskName (every $IntervalMinutes minutes)"
    Invoke-Apply | Out-Null
    break
  }

  "Uninstall" {
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($null -ne $task) {
      Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
      Write-Host "Removed scheduled task: $TaskName"
    } else {
      Write-Host "Task was already absent: $TaskName"
    }
    break
  }
}
