param(
  [string]$ArtifactDir = "artifacts/texas-solver-review-integration",
  [switch]$NoWriteReview,
  [switch]$SkipBuild,
  [switch]$RunFullTest,
  [switch]$OpenReport,
  [int]$MaxConsoleOutputLines = 80
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")
$artifactRoot = Join-Path $repoRoot $ArtifactDir
$reviewsDir = Join-Path $artifactRoot "reviews"
$stageDir = Join-Path $artifactRoot "stage"
$reportPath = Join-Path $artifactRoot "TEXAS_SOLVER_INTEGRATION_REPORT.md"
$jsonReportPath = Join-Path $artifactRoot "texas-solver-integration-report.json"
$commandLogPath = Join-Path $artifactRoot "command-log.json"
$writeReview = -not $NoWriteReview

$families = @(
  "MTT9_50BB_BTN_BB_SRP",
  "MTT9_40BB_UTG_BB_SRP",
  "MTT9_35BB_CO_BTN_3BP"
)

$reviewPlan = @(
  [pscustomobject]@{
    Family = "MTT9_50BB_BTN_BB_SRP"
    NodeHistory = ""
    Label = "BTN vs BB SRP root/OOP first action"
    Required = $true
    CandidatePriority = 20
  },
  [pscustomobject]@{
    Family = "MTT9_50BB_BTN_BB_SRP"
    NodeHistory = "CHECK"
    Label = "BTN vs BB SRP IP c-bet after OOP check"
    Required = $true
    CandidatePriority = 100
  },
  [pscustomobject]@{
    Family = "MTT9_40BB_UTG_BB_SRP"
    NodeHistory = ""
    Label = "UTG vs BB SRP root/OOP first action"
    Required = $true
    CandidatePriority = 10
  },
  [pscustomobject]@{
    Family = "MTT9_40BB_UTG_BB_SRP"
    NodeHistory = "CHECK"
    Label = "UTG vs BB SRP IP c-bet after OOP check"
    Required = $false
    CandidatePriority = 60
  },
  [pscustomobject]@{
    Family = "MTT9_35BB_CO_BTN_3BP"
    NodeHistory = ""
    Label = "CO vs BTN 3bet pot root/OOP first action"
    Required = $true
    CandidatePriority = 5
  },
  [pscustomobject]@{
    Family = "MTT9_35BB_CO_BTN_3BP"
    NodeHistory = "CHECK"
    Label = "CO vs BTN 3bet pot IP c-bet after OOP check"
    Required = $false
    CandidatePriority = 40
  }
)

$commandLog = New-Object System.Collections.Generic.List[object]

function ConvertTo-SafeName([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) {
    return "ROOT"
  }
  return ($Value.Trim().ToUpperInvariant() -replace "[^A-Z0-9_-]+", "_")
}

function Invoke-RepoCommand {
  param(
    [string]$Name,
    [string]$FilePath,
    [string[]]$Arguments,
    [switch]$AllowFailure
  )

  Write-Host ""
  Write-Host "== $Name =="
  Write-Host "$FilePath $($Arguments -join ' ')"

  $output = & $FilePath @Arguments 2>&1
  $exitCode = $LASTEXITCODE
  $lines = @($output)
  if ($lines.Count -le $MaxConsoleOutputLines) {
    foreach ($line in $lines) {
      Write-Host $line
    }
  } else {
    $headCount = [Math]::Min(25, $MaxConsoleOutputLines)
    $tailCount = [Math]::Max(0, $MaxConsoleOutputLines - $headCount)
    foreach ($line in ($lines | Select-Object -First $headCount)) {
      Write-Host $line
    }
    Write-Host "... output truncated in console; full output is written to command-log.json ..."
    foreach ($line in ($lines | Select-Object -Last $tailCount)) {
      Write-Host $line
    }
  }

  $commandLog.Add([pscustomobject]@{
    name = $Name
    filePath = $FilePath
    arguments = $Arguments
    exitCode = $exitCode
    allowFailure = [bool]$AllowFailure
    output = @($output)
  })

  if ($exitCode -ne 0 -and -not $AllowFailure) {
    throw "Command failed with exit code ${exitCode}: $Name"
  }
}

function Read-JsonFile([string]$Path) {
  if (-not (Test-Path $Path)) {
    return $null
  }
  return Get-Content $Path -Raw | ConvertFrom-Json
}

function Get-DominantActionCounts($Review) {
  $counts = @{}
  if ($null -eq $Review -or $null -eq $Review.files) {
    return $counts
  }
  foreach ($file in $Review.files) {
    if ($null -eq $file.handClasses) {
      continue
    }
    foreach ($handClass in $file.handClasses.PSObject.Properties) {
      $action = [string]$handClass.Value.dominantAction
      if (-not $counts.ContainsKey($action)) {
        $counts[$action] = 0
      }
      $counts[$action] += 1
    }
  }
  return $counts
}

function Format-ActionCounts($Counts) {
  if ($null -eq $Counts -or $Counts.Count -eq 0) {
    return "-"
  }
  return (($Counts.GetEnumerator() | Sort-Object Name | ForEach-Object { "$($_.Name):$($_.Value)" }) -join ", ")
}

function New-ReviewSummary($PlanItem, $ReviewPath, $ExitExpected) {
  $review = Read-JsonFile $ReviewPath
  if ($null -eq $review) {
    return [pscustomobject]@{
      family = $PlanItem.Family
      nodeHistory = $PlanItem.NodeHistory
      label = $PlanItem.Label
      required = [bool]$PlanItem.Required
      reviewPath = $ReviewPath
      present = $false
      valid = $false
      status = "MISSING_REVIEW_REPORT"
      productionReady = $false
      rawFiles = 0
      parsedFiles = 0
      combos = 0
      handClasses = 0
      anomalies = 0
      anomalyText = @("Review report file was not written.")
      dominantActions = "-"
      score = -1000
      recommendation = "missing"
    }
  }

  $anomalies = @($review.anomalies)
  $dominantCounts = Get-DominantActionCounts $review
  $nodeBonus = if ($PlanItem.NodeHistory -eq "CHECK") { 50 } else { 0 }
  $score = [int]$PlanItem.CandidatePriority + $nodeBonus + [int]$review.counts.handClasses + ([int]$review.counts.rawFiles * 5) - ($anomalies.Count * 30)
  $recommendation = if ($review.valid -and -not $review.productionReady -and $anomalies.Count -eq 0 -and [int]$review.counts.handClasses -ge 45) {
    "best-pilot-candidate"
  } elseif ($review.valid -and $anomalies.Count -eq 0) {
    "review-candidate"
  } elseif ($review.valid) {
    "review-with-caution"
  } else {
    "blocked"
  }

  return [pscustomobject]@{
    family = [string]$review.familyId
    nodeHistory = if ($PlanItem.NodeHistory.Length -gt 0) { $PlanItem.NodeHistory } else { "ROOT" }
    label = $PlanItem.Label
    required = [bool]$PlanItem.Required
    reviewPath = $ReviewPath
    present = $true
    valid = [bool]$review.valid
    status = [string]$review.status
    productionReady = [bool]$review.productionReady
    rawFiles = [int]$review.counts.rawFiles
    parsedFiles = [int]$review.counts.parsedFiles
    combos = [int]$review.counts.combos
    handClasses = [int]$review.counts.handClasses
    anomalies = $anomalies.Count
    anomalyText = $anomalies
    dominantActions = Format-ActionCounts $dominantCounts
    score = $score
    recommendation = $recommendation
  }
}

function Add-MarkdownTable {
  param(
    [System.Collections.Generic.List[string]]$Lines,
    $Rows
  )
  $Lines.Add("| Family | Node | Raw | Combos | Hand classes | Anomalies | Dominant actions | Recommendation |")
  $Lines.Add("| --- | --- | ---: | ---: | ---: | ---: | --- | --- |")
  foreach ($row in $Rows) {
    $Lines.Add("| $($row.family) | $($row.nodeHistory) | $($row.rawFiles) | $($row.combos) | $($row.handClasses) | $($row.anomalies) | $($row.dominantActions) | $($row.recommendation) |")
  }
}

Push-Location $repoRoot
try {
  New-Item -ItemType Directory -Force -Path $artifactRoot, $reviewsDir, $stageDir | Out-Null

  Write-Host "PKRTrainer repo: $repoRoot"
  Write-Host "Artifact dir: $artifactRoot"
  Write-Host "Write review files into local solver workspace: $writeReview"

  Invoke-RepoCommand "TexasSolver parameter pack preflight" "npm" @(
    "run", "mtt:texas-solver-pack", "--",
    "--json",
    "--output=$(Join-Path $artifactRoot "texas-solver-parameter-pack.json")"
  )

  foreach ($family in $families) {
    Invoke-RepoCommand "Stage TexasSolver exports: $family" "npm" @(
      "run", "mtt:stage-texas-solver", "--",
      "--family=$family",
      "--write",
      "--review-template",
      "--json",
      "--output=$(Join-Path $stageDir "$family.stage.json")"
    )
  }

  Invoke-RepoCommand "TexasSolver solver-verification" "npm" @(
    "run", "mtt:solver-verification", "--",
    "--solver=texas-solver",
    "--json",
    "--output=$(Join-Path $artifactRoot "mtt-solver-verification.texas-solver.json")"
  )

  $reviewSummaries = New-Object System.Collections.Generic.List[object]
  foreach ($plan in $reviewPlan) {
    $nodeName = ConvertTo-SafeName $plan.NodeHistory
    $familyReviewDir = Join-Path $reviewsDir $plan.Family
    New-Item -ItemType Directory -Force -Path $familyReviewDir | Out-Null
    $reviewReportPath = Join-Path $familyReviewDir "$nodeName.review-report.json"
    $args = @(
      "run", "mtt:texas-solver-review", "--",
      "--family=$($plan.Family)",
      "--json",
      "--output=$reviewReportPath"
    )
    if ($writeReview) {
      $args += "--write"
    }
    if (-not [string]::IsNullOrWhiteSpace($plan.NodeHistory)) {
      $args += "--node-history=$($plan.NodeHistory)"
    }
    Invoke-RepoCommand "Extract TexasSolver review: $($plan.Family) / $nodeName" "npm" $args -AllowFailure:(!$plan.Required)
    $reviewSummaries.Add((New-ReviewSummary $plan $reviewReportPath (!$plan.Required)))
  }

  Invoke-RepoCommand "Current MTT completion gate" "npm" @(
    "run", "mtt:completion", "--",
    "--json",
    "--output=$(Join-Path $artifactRoot "mtt-completion.json")"
  ) -AllowFailure

  Invoke-RepoCommand "Current MTT postflop release gate" "npm" @(
    "run", "mtt:postflop-release", "--",
    "--json",
    "--output=$(Join-Path $artifactRoot "mtt-postflop-release.json")"
  ) -AllowFailure

  Invoke-RepoCommand "Legal full-ring flop import slots" "npm" @(
    "run", "mtt:slots", "--",
    "--kind=postflop",
    "--format=FULL_RING_9",
    "--street=FLOP",
    "--json",
    "--output=$(Join-Path $artifactRoot "mtt-full-ring-flop-slots.json")"
  )

  Invoke-RepoCommand "TypeScript typecheck" "npm" @("run", "typecheck")

  if (-not $SkipBuild) {
    Invoke-RepoCommand "Production build" "npm" @("run", "build")
  }

  if ($RunFullTest) {
    Invoke-RepoCommand "Full Vitest suite" "npm" @("test")
  }

  $solverVerification = Read-JsonFile (Join-Path $artifactRoot "mtt-solver-verification.texas-solver.json")
  $postflopRelease = Read-JsonFile (Join-Path $artifactRoot "mtt-postflop-release.json")
  $completion = Read-JsonFile (Join-Path $artifactRoot "mtt-completion.json")
  $slots = Read-JsonFile (Join-Path $artifactRoot "mtt-full-ring-flop-slots.json")
  $generatedAt = (Get-Date).ToString("s")
  $bestPilot = $reviewSummaries |
    Where-Object { $_.valid -eq $true -and $_.productionReady -eq $false } |
    Sort-Object score -Descending |
    Select-Object -First 1

  $slotSummary = @($slots.postflopSlots | Select-Object slotId, packId, kind, tableFormat, blindSpeed, street, evModel, ante, status, normalizedInputPath, permissionManifestPath)
  $reviewSummaryArray = @($reviewSummaries | ForEach-Object {
    [ordered]@{
      family = $_.family
      nodeHistory = $_.nodeHistory
      label = $_.label
      required = $_.required
      reviewPath = $_.reviewPath
      present = $_.present
      valid = $_.valid
      status = $_.status
      productionReady = $_.productionReady
      rawFiles = $_.rawFiles
      parsedFiles = $_.parsedFiles
      combos = $_.combos
      handClasses = $_.handClasses
      anomalies = $_.anomalies
      anomalyText = @($_.anomalyText)
      dominantActions = $_.dominantActions
      score = $_.score
      recommendation = $_.recommendation
    }
  })
  $bestPilotSummary = if ($null -ne $bestPilot) {
    [ordered]@{
      family = $bestPilot.family
      nodeHistory = $bestPilot.nodeHistory
      label = $bestPilot.label
      reviewPath = $bestPilot.reviewPath
      score = $bestPilot.score
      rawFiles = $bestPilot.rawFiles
      combos = $bestPilot.combos
      handClasses = $bestPilot.handClasses
      anomalies = $bestPilot.anomalies
      dominantActions = $bestPilot.dominantActions
      recommendation = $bestPilot.recommendation
    }
  } else {
    $null
  }
  $integration = [ordered]@{
    generatedAt = $generatedAt
    repoRoot = [string]$repoRoot
    artifactDir = [string]$artifactRoot
    writeReview = $writeReview
    solverVerification = [ordered]@{
      valid = $solverVerification.valid
      counts = $solverVerification.counts
    }
    currentCompletion = [ordered]@{
      valid = $completion.valid
      counts = $completion.counts
    }
    currentPostflopRelease = [ordered]@{
      valid = $postflopRelease.valid
      counts = $postflopRelease.counts
    }
    legalFullRingFlopSlots = [ordered]@{
      counts = $slots.counts
      postflopSlots = $slotSummary
    }
    reviews = $reviewSummaryArray
    bestPilotCandidate = $bestPilotSummary
    safety = [ordered]@{
      createsProductionNormalizedJson = $false
      createsPermissionJson = $false
      requiresHumanReview = $true
      intendedLicenseKind = "OWNED_SOLVER_EXPORT"
      nextProductionStep = "After review, create canonical normalized.json + permission.json for exactly one legal flop-production slot, then run validate/build/promote dry-runs."
    }
  }

  $integration | ConvertTo-Json -Depth 100 | Set-Content -Path $jsonReportPath -Encoding UTF8
  $commandLog | ConvertTo-Json -Depth 8 | Set-Content -Path $commandLogPath -Encoding UTF8

  $lines = New-Object System.Collections.Generic.List[string]
  $tick = [char]96
  $lines.Add("# TexasSolver -> PKRTrainer review / compare / integration report")
  $lines.Add("")
  $lines.Add("- Generated: $generatedAt")
  $lines.Add("- Repo: ${tick}${repoRoot}${tick}")
  $lines.Add("- Artifacts: ${tick}${artifactRoot}${tick}")
  $lines.Add("- Production ${tick}normalized.json${tick} created: **no**")
  $lines.Add("- ${tick}permission.json${tick} created: **no**")
  $lines.Add("")
  $lines.Add("## 1. Solver verification")
  $lines.Add("")
  $lines.Add("- TexasSolver verification valid: **$($solverVerification.valid)**")
  $lines.Add("- Family rows ready for review: $($solverVerification.counts.readyForReview) / $($solverVerification.counts.familySolverRows)")
  $lines.Add("- Missing expected solver outputs: $($solverVerification.counts.missingExpectedOutputs)")
  $lines.Add("")
  $lines.Add("## 2. Current PKRTrainer baseline")
  $lines.Add("")
  $lines.Add("- MTT postflop production-ready rows: $($postflopRelease.counts.productionReadyRows) / $($postflopRelease.counts.totalPostflopRows)")
  $lines.Add("- Fallback runtime rows: $($postflopRelease.counts.fallbackRuntimeRows)")
  $lines.Add("- Missing ${tick}normalized.json${tick} rows: $($postflopRelease.counts.missingNormalizedRows)")
  $lines.Add("- Missing ${tick}permission.json${tick} rows: $($postflopRelease.counts.missingPermissionRows)")
  $lines.Add("")
  $lines.Add("Interpretation: the current trainer shell/UI is technically ready, but MTT postflop still runs through fallback/heuristic runtime until reviewed production StrategyPacks are imported.")
  $lines.Add("")
  $lines.Add("## 3. TexasSolver review candidates")
  $lines.Add("")
  Add-MarkdownTable -Lines $lines -Rows $reviewSummaryArray
  $lines.Add("")
  $lines.Add("## 4. Best pilot recommendation")
  $lines.Add("")
  if ($null -ne $bestPilot) {
    $lines.Add("- Recommended pilot: ${tick}$($bestPilot.family)${tick} / ${tick}$($bestPilot.nodeHistory)${tick}")
    $lines.Add("- Why: score $($bestPilot.score), $($bestPilot.rawFiles) raw files, $($bestPilot.combos) combo rows, $($bestPilot.handClasses) hand classes, $($bestPilot.anomalies) anomalies.")
    $lines.Add("- Review file: ${tick}$($bestPilot.reviewPath)${tick}")
    $lines.Add("- Practical interpretation: prefer the BTN vs BB SRP ${tick}CHECK${tick} node first when available, because it represents the IP flop decision after OOP checks and is closer to a trainer c-bet spot than the root OOP first action.")
  } else {
    $lines.Add("- No valid pilot candidate found. Inspect review reports and command log first.")
  }
  $lines.Add("")
  $lines.Add("## 5. Integration path into PKRTrainer")
  $lines.Add("")
  $lines.Add("1. Open the recommended review JSON and family ${tick}review-notes.md${tick}.")
  $lines.Add("2. Confirm player mapping, node history, sizing model, board list, ranges, stack/pot scaling and solver accuracy.")
  $lines.Add("3. Pick exactly one legal ${tick}flop-production${tick} slot from ${tick}mtt-full-ring-flop-slots.json${tick}.")
  $lines.Add("4. Create canonical ${tick}normalized.json${tick} only from reviewed solver data, not from raw dumps.")
  $lines.Add("5. Create matching ${tick}permission.json${tick} with ${tick}licenseKind: OWNED_SOLVER_EXPORT${tick} if this is our own TexasSolver export.")
  $lines.Add("6. Run ${tick}npm run validate:range-import -- --kind=flop-production --permission-manifest <permission.json> <normalized.json>${tick}.")
  $lines.Add("7. Run ${tick}npm run build:range-module -- --kind=flop-production --dry-run --permission-manifest <permission.json> <normalized.json>${tick}.")
  $lines.Add("8. Only after green review, run the existing promotion pipeline and registry integrity checks.")
  $lines.Add("")
  $lines.Add("## 6. Files to inspect")
  $lines.Add("")
  $lines.Add("- Machine JSON report: ${tick}${jsonReportPath}${tick}")
  $lines.Add("- Command log: ${tick}${commandLogPath}${tick}")
  $lines.Add("- Full-ring flop slots: ${tick}$(Join-Path $artifactRoot "mtt-full-ring-flop-slots.json")${tick}")
  $lines.Add("- TexasSolver local review workspace: ${tick}Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver/${tick}")
  $lines.Add("")
  $lines.Add("## 7. Safety notes")
  $lines.Add("")
  $lines.Add("- This workflow intentionally does not make the app production-ready by itself.")
  $lines.Add("- It upgrades our evidence base from heuristic fallback toward reviewed solver facts.")
  $lines.Add("- Production training should switch only after the canonical range-intake pipeline accepts the reviewed StrategyPack.")

  $lines | Set-Content -Path $reportPath -Encoding UTF8

  Write-Host ""
  Write-Host "Integration report written:"
  Write-Host $reportPath
  Write-Host $jsonReportPath
  Write-Host $commandLogPath

  if ($OpenReport) {
    Invoke-Item $reportPath
  }
} finally {
  Pop-Location
}
