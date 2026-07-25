# Install, inspect, stop or remove the weekend uniform-tree re-solve task.
#
# The task must survive a machine that is switched off, restarted or logged out,
# so it carries three triggers: at startup, at logon, and a repeating one that
# retries every 30 minutes. The worker itself holds a global mutex and refuses to
# run beside an existing solver process, so overlapping triggers are harmless.
[CmdletBinding()]
param(
  [ValidateSet("Install", "Status", "Stop", "Uninstall")]
  [string]$Action = "Status",
  [string]$TaskName = "PKRTrainer-Weekend-UniformResolve",
  [int]$Threads = 12,
  [int]$Iterations = 1200,
  [string]$ProcessPriority = "BelowNormal",
  [switch]$StartNow
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path
$worker = Join-Path $PSScriptRoot "run-weekend-uniform-resolve.ps1"
$currentUser = "$env:USERDOMAIN\$env:USERNAME"

function Show-Status {
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($null -eq $task) {
    Write-Host "Weekend uniform-resolve task is not installed: $TaskName"
  } else {
    $info = Get-ScheduledTaskInfo -TaskName $TaskName
    Write-Host "name:          $TaskName"
    Write-Host "state:         $($task.State)"
    Write-Host "last run:      $($info.LastRunTime)"
    Write-Host "last result:   $($info.LastTaskResult)"
    Write-Host "next run:      $($info.NextRunTime)"
    Write-Host "triggers:      $($task.Triggers.Count)"
  }
  $procs = @(Get-Process console_solver -ErrorAction SilentlyContinue)
  Write-Host "solver procs:  $($procs.Count)"
  if ($procs.Count -gt 0) {
    Write-Host "  threads=$($procs[0].Threads.Count) priority=$($procs[0].PriorityClass)"
  }
  # Each worker tick regenerates the batch, which prunes the parameter files of
  # boards that have already converged. So the parameter-file count is the number
  # of boards still to solve - it shrinks as work completes and is the honest
  # "remaining". The raw checkpoints touched since the run began give a second,
  # cumulative view of how many were solved. The two measure different things
  # (remaining versus done-so-far), so they are shown side by side and never
  # subtracted: done can exceed remaining once most of the queue has drained.
  $paramDir = Join-Path $repo "Agents\solver-input\texas-solver\mtt-safe-flops-v1\parameters\pkrtrainer_mtt_uniform_tree_weekend_v1"
  $remaining = @(Get-ChildItem -Path $paramDir -Filter "*.txt" -File -ErrorAction SilentlyContinue).Count
  $solvedSinceStart = 0
  $rawRoot = Join-Path $repo "Agents\solver-input\gto-plus\sample-postflop-v1\output\texas-solver"
  $firstLog = Get-ChildItem -Path (Join-Path $repo "artifacts\uniform-tree-weekend") -Filter "worker-*.log" -File -ErrorAction SilentlyContinue |
    Sort-Object CreationTime | Select-Object -First 1
  if ($null -ne $firstLog -and (Test-Path $rawRoot)) {
    $startedAt = $firstLog.CreationTime
    $solvedSinceStart = @(Get-ChildItem -Path $rawRoot -Filter "pkrtrainer_*.json" -File -Recurse -ErrorAction SilentlyContinue |
      Where-Object { $_.LastWriteTime -gt $startedAt }).Count
  }
  Write-Host "boards remaining: $remaining  (parameter files still queued)"
  Write-Host "boards solved:    $solvedSinceStart  (checkpoints rewritten since this run began)"
  $logDir = Join-Path $repo "artifacts\uniform-tree-weekend"
  $latest = Get-ChildItem -Path $logDir -Filter "worker-*.log" -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($null -ne $latest) {
    Write-Host "latest log:    $($latest.FullName)"
    Get-Content $latest.FullName -Tail 3 | ForEach-Object { Write-Host "  $_" }
  }
}

switch ($Action) {
  "Status" { Show-Status; break }

  "Stop" {
    # Stop the schedule first so a trigger cannot restart the solver behind us.
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($null -ne $task) {
      Disable-ScheduledTask -TaskName $TaskName | Out-Null
      Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
      Write-Host "Disabled and stopped scheduled task: $TaskName"
    } else {
      Write-Host "Task not installed: $TaskName"
    }
    $procs = @(Get-Process console_solver -ErrorAction SilentlyContinue)
    if ($procs.Count -gt 0) {
      $procs | Stop-Process -Force -ErrorAction SilentlyContinue
      Write-Host "Stopped $($procs.Count) solver process(es)."
      Write-Host "A board interrupted mid-solve is restored from the backup on the next worker start."
    }
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
    @(Get-Process console_solver -ErrorAction SilentlyContinue) | Stop-Process -Force -ErrorAction SilentlyContinue
    break
  }

  "Install" {
    $arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$worker`" -Threads $Threads -Iterations $Iterations -ProcessPriority $ProcessPriority"
    $taskAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments -WorkingDirectory $repo

    $atLogon = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
    # A repeating trigger is what actually makes the weekend self-healing: if the
    # worker exits for resource pressure or a crash, the next tick restarts it.
    $repeating = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) `
      -RepetitionInterval (New-TimeSpan -Minutes 30) -RepetitionDuration (New-TimeSpan -Days 7)

    # An AtStartup trigger runs before any logon and Windows only allows an
    # elevated caller to register one. Without elevation the logon trigger plus
    # the 30-minute repetition already covers boot, restart and logout, so the
    # task installs either way rather than failing.
    $elevated = ([Security.Principal.WindowsPrincipal]::new(
      [Security.Principal.WindowsIdentity]::GetCurrent()
    )).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

    $triggers = if ($elevated) {
      @((New-ScheduledTaskTrigger -AtStartup), $atLogon, $repeating)
    } else {
      @($atLogon, $repeating)
    }

    $principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet `
      -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
      -StartWhenAvailable -MultipleInstances IgnoreNew `
      -ExecutionTimeLimit (New-TimeSpan -Days 7) `
      -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 10)

    $task = New-ScheduledTask -Action $taskAction -Trigger $triggers `
      -Principal $principal -Settings $settings `
      -Description "PKRTrainer weekend uniform-tree TexasSolver re-solve; resumable and mutex-protected."

    Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null
    Write-Host "Installed scheduled task: $TaskName"
    if ($elevated) {
      Write-Host "  triggers: at startup, at logon, and every 30 minutes for 7 days"
    } else {
      Write-Host "  triggers: at logon and every 30 minutes for 7 days"
      Write-Host "  note:     an at-startup trigger needs an elevated shell; re-run Install as"
      Write-Host "            Administrator to add it. Boot is still covered once you log in."
    }
    Write-Host "  worker:   $worker"
    if ($StartNow) {
      Start-ScheduledTask -TaskName $TaskName
      Write-Host "Started now."
    }
    Show-Status
    break
  }
}
