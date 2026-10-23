param(
  [string]$QueuePath = "",
  [int]$ExistingProcessPollSeconds = 300,
  [switch]$DryRun,
  [switch]$SkipIngest
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path
$Runner = Join-Path $PSScriptRoot "run-console-selected.ps1"
$Watcher = Join-Path $PSScriptRoot "watch-ingest-completed.ps1"
$ArtifactsDir = Join-Path $RepoRoot "artifacts\texas-solver-autostart"
$StatePath = Join-Path $ArtifactsDir "state.json"
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$LogPath = Join-Path $ArtifactsDir "queue-$Stamp.log"
$MutexName = "Local\PKRTrainerTexasSolverQueueV1"

if ([string]::IsNullOrWhiteSpace($QueuePath)) {
  $QueuePath = Join-Path $PSScriptRoot "texas-solver-autostart-queue.json"
} elseif (-not [System.IO.Path]::IsPathRooted($QueuePath)) {
  $QueuePath = Join-Path $RepoRoot ($QueuePath -replace '^[.][\\/]', '')
}

function Resolve-RepoPath([string]$Path) {
  if ([System.IO.Path]::IsPathRooted($Path)) {
    return [System.IO.Path]::GetFullPath($Path)
  }
  return [System.IO.Path]::GetFullPath((Join-Path $RepoRoot ($Path -replace '/', '\')))
}

function Write-QueueLog([string]$Message) {
  $line = "[{0}] {1}" -f (Get-Date -Format "s"), $Message
  if (-not $DryRun) {
    [System.IO.File]::AppendAllText($LogPath, "$line`r`n", [System.Text.Encoding]::UTF8)
  }
  Write-Host $line
}

function Get-Coverage($Manifest) {
  $outputBase = Resolve-RepoPath ([string]$Manifest.outputBase)
  $solved = 0
  $expected = 0
  foreach ($scenario in @($Manifest.scenarios)) {
    $rawDir = Join-Path $outputBase (Join-Path ([string]$scenario.familyId) "raw")
    $rawNames = if (Test-Path -LiteralPath $rawDir) {
      @(Get-ChildItem -LiteralPath $rawDir -File -Filter "*.json" | ForEach-Object { $_.Name })
    } else {
      @()
    }
    foreach ($board in @($scenario.boards)) {
      $expected += 1
      if (@($rawNames | Where-Object { $_ -like "*_$board.json" }).Count -gt 0) {
        $solved += 1
      }
    }
  }
  return [pscustomobject]@{
    Solved = $solved
    Expected = $expected
    Complete = ($expected -gt 0 -and $solved -eq $expected)
  }
}

function Read-State {
  if (-not (Test-Path -LiteralPath $StatePath)) {
    return [pscustomobject]@{ schemaVersion = 1; items = @{} }
  }
  $state = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
  $items = @{}
  foreach ($property in @($state.items.PSObject.Properties)) {
    $items[$property.Name] = $property.Value
  }
  return [pscustomobject]@{ schemaVersion = 1; items = $items }
}

function Write-State($State) {
  $serializedItems = [ordered]@{}
  foreach ($key in @($State.items.Keys | Sort-Object)) {
    $serializedItems[$key] = $State.items[$key]
  }
  [ordered]@{
    schemaVersion = 1
    updatedAt = (Get-Date).ToString("o")
    items = $serializedItems
  } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $StatePath -Encoding UTF8
}

function Wait-ForOtherSolver {
  do {
    $processes = @(Get-Process -Name "console_solver" -ErrorAction SilentlyContinue)
    if ($processes.Count -eq 0) {
      return
    }
    Write-QueueLog ("Another console_solver process is active (PID {0}); waiting {1}s." -f (($processes.Id -join ','), $ExistingProcessPollSeconds))
    Start-Sleep -Seconds $ExistingProcessPollSeconds
  } while ($true)
}

function Start-IncrementalIngestWatcher([string]$ManifestPath) {
  if (-not (Test-Path -LiteralPath $Watcher)) {
    throw "TexasSolver ingest watcher not found: $Watcher"
  }
  $running = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -match "watch-ingest-completed\\.ps1" -and
    $_.CommandLine -match [regex]::Escape($ManifestPath)
  })
  if ($running.Count -gt 0) {
    Write-QueueLog "Incremental ingest watcher already active for manifest $ManifestPath."
    return
  }
  $watcherProcess = Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $Watcher,
    "-Manifest", $ManifestPath,
    "-IntervalSeconds", "300",
    "-MaxMinutes", "10080"
  ) -WorkingDirectory $RepoRoot -WindowStyle Hidden -PassThru
  Write-QueueLog "Started incremental ingest watcher PID $($watcherProcess.Id) for $ManifestPath."
}

function Invoke-Ingest([string]$ManifestPath, [string]$ItemId, $Coverage, $State) {
  if ($SkipIngest) {
    Write-QueueLog "Skipping ingest by request for $ItemId."
    return
  }
  $saved = $State.items[$ItemId]
  if ($null -ne $saved -and $saved.ingestedBoards -eq $Coverage.Expected) {
    Write-QueueLog "Ingest checkpoint already recorded for $ItemId ($($Coverage.Expected)/$($Coverage.Expected))."
    return
  }
  $npm = (Get-Command "npm.cmd" -ErrorAction Stop).Source
  Write-QueueLog "Running idempotent completed-family ingest for $ItemId."
  & $npm run mtt:texas-solver-ingest-completed -- --manifest $ManifestPath --summary 2>&1 |
    ForEach-Object { Write-QueueLog ([string]$_) }
  if ($LASTEXITCODE -ne 0) {
    throw "Completed-family ingest failed with exit code $LASTEXITCODE for $ItemId."
  }
  $State.items[$ItemId] = [ordered]@{
    ingestedBoards = $Coverage.Expected
    expectedBoards = $Coverage.Expected
    completedAt = (Get-Date).ToString("o")
  }
  Write-State $State
}

if (-not (Test-Path -LiteralPath $QueuePath)) {
  throw "TexasSolver queue not found: $QueuePath"
}
if (-not (Test-Path -LiteralPath $Runner)) {
  throw "TexasSolver runner not found: $Runner"
}

$queue = Get-Content -LiteralPath $QueuePath -Raw | ConvertFrom-Json
if ($queue.schemaVersion -ne 1) {
  throw "Unsupported TexasSolver queue schema: $($queue.schemaVersion)"
}
$items = @($queue.items | Where-Object { $_.enabled -eq $true } | Sort-Object priority, id)
if ($items.Count -eq 0) {
  throw "TexasSolver queue has no enabled items: $QueuePath"
}

if ($DryRun) {
  Write-QueueLog "Dry run: queue=$($queue.queueId), enabledItems=$($items.Count)."
  foreach ($item in $items) {
    $manifestPath = Resolve-RepoPath ([string]$item.manifest)
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    $coverage = Get-Coverage $manifest
    Write-QueueLog ("{0}: solved={1}/{2}, complete={3}, parameterRoot={4}" -f $item.id, $coverage.Solved, $coverage.Expected, $coverage.Complete, (Resolve-RepoPath ([string]$item.parameterRoot)))
  }
  exit 0
}

New-Item -ItemType Directory -Force -Path $ArtifactsDir | Out-Null
$mutex = New-Object System.Threading.Mutex($false, $MutexName)
$hasMutex = $false
try {
  $hasMutex = $mutex.WaitOne(0, $false)
  if (-not $hasMutex) {
    Write-QueueLog "Another TexasSolver queue worker owns the mutex; exiting without duplication."
    exit 0
  }

  Set-Location $RepoRoot
  $state = Read-State
  Write-QueueLog "Queue worker started: $($queue.queueId), enabledItems=$($items.Count)."
  Wait-ForOtherSolver

  foreach ($item in $items) {
    $itemId = [string]$item.id
    $parameterRoot = Resolve-RepoPath ([string]$item.parameterRoot)
    $manifestPath = Resolve-RepoPath ([string]$item.manifest)
    if (-not (Test-Path -LiteralPath $parameterRoot)) {
      throw "Parameter root not found for ${itemId}: $parameterRoot"
    }
    if (-not (Test-Path -LiteralPath $manifestPath)) {
      throw "Manifest not found for ${itemId}: $manifestPath"
    }

    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    $coverage = Get-Coverage $manifest
    if ([int]$item.expectedBoards -ne $coverage.Expected) {
      throw "Queue expectedBoards mismatch for ${itemId}: config=$($item.expectedBoards), manifest=$($coverage.Expected)."
    }
    Start-IncrementalIngestWatcher $manifestPath
    Write-QueueLog ("Item {0}: solved={1}/{2}, complete={3}." -f $itemId, $coverage.Solved, $coverage.Expected, $coverage.Complete)

    if (-not $coverage.Complete) {
      Write-QueueLog "Resuming $itemId; existing raw JSON files remain checkpoints."
      & $Runner -ParameterRoot $parameterRoot -Limit ([int]$item.limit) 2>&1 |
        ForEach-Object { Write-QueueLog ([string]$_) }
      if ($LASTEXITCODE -ne 0) {
        throw "TexasSolver runner failed with exit code $LASTEXITCODE for $itemId."
      }
      $coverage = Get-Coverage $manifest
      if (-not $coverage.Complete) {
        throw "Runner exited before $itemId became complete: $($coverage.Solved)/$($coverage.Expected)."
      }
    }

    if ($item.ingestOnCompletion -eq $true) {
      Invoke-Ingest $manifestPath $itemId $coverage $state
    }
    Write-QueueLog "Item complete: $itemId ($($coverage.Solved)/$($coverage.Expected)); action=$($item.completionAction)."
  }

  Write-QueueLog "All enabled TexasSolver queue items are complete. Stop for poker review before adding another batch."
} catch {
  Write-QueueLog "ERROR: $($_.Exception.Message)"
  exit 1
} finally {
  if ($hasMutex) {
    $mutex.ReleaseMutex()
  }
  $mutex.Dispose()
}
