# Find every 13x13 hand grid in a range-chart image, without being told where.
#
# The charts do not share a layout: one openraising page carries two grids side by
# side, the next carries three, and the offsets differ on both. Hand-tuning 210
# images is not a plan, and getting it wrong is silent - the wrong offsets simply
# report a different set of hands, which is how KK and QQ turned up in a fold
# bucket the first time this was tried on a chart it had not been measured for.
#
# Detection uses the one thing every cell has: a label. Ink density per column
# gives thirteen peaks per grid, and the gap between grids is far wider than the
# gap between cells, so the grids fall out of the run lengths.
#
#   powershell -File scripts/detectRangeChartGrids.ps1 -Image <path>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Image,
  # Brightness below which a pixel counts as label ink.
  [double]$InkBelow = 0.42,
  [switch]$Json
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$bitmap = New-Object System.Drawing.Bitmap($Image)
try {
  $width = $bitmap.Width
  $height = $bitmap.Height

  function Get-InkRuns([int[]]$profile, [int]$limit, [int]$threshold, [int]$step) {
    # Contiguous stretches where labels are present, as objects rather than
    # nested arrays - PowerShell flattens those in ways that bite later.
    $runs = New-Object System.Collections.ArrayList
    $inRun = $false; $runStart = 0
    for ($i = 0; $i -lt $limit; $i += $step) {
      $isInk = $profile[$i] -ge $threshold
      if ($isInk -and -not $inRun) { $inRun = $true; $runStart = $i }
      elseif (-not $isInk -and $inRun) {
        $inRun = $false
        [void]$runs.Add([pscustomobject]@{ Start = $runStart; End = $i - $step })
      }
    }
    if ($inRun) { [void]$runs.Add([pscustomobject]@{ Start = $runStart; End = $limit - 1 }) }
    return $runs
  }

  # Ink density per row, to find the vertical band the grids occupy.
  $rowInk = New-Object 'int[]' $height
  for ($y = 0; $y -lt $height; $y += 2) {
    $count = 0
    for ($x = 0; $x -lt $width; $x += 3) {
      if ($bitmap.GetPixel($x, $y).GetBrightness() -lt $InkBelow) { $count++ }
    }
    $rowInk[$y] = $count
  }
  $rowMax = ($rowInk | Measure-Object -Maximum).Maximum
  $rowRuns = @(Get-InkRuns $rowInk $height ([int]($rowMax * 0.12)) 2)
  # Thirteen label rows, so the grid band is the run group that contains them.
  $band = $rowRuns | Sort-Object { $_.End - $_.Start } -Descending | Select-Object -First 1
  if ($null -eq $band) { throw "No text band found; is this a range chart?" }

  # Rows are not separable by run-splitting: cell borders keep ink above any
  # useful threshold right through the band, so it comes out as one run. The
  # pitch is taken from the columns instead - these cells are square - and the
  # vertical offset is found by sliding until the label rows line up with the
  # cell centres. Labels sit at centres, so that maximum is unambiguous.

  # Columns are found by edge density, not ink. Thresholding on brightness treats
  # a dark-filled cell as one solid label and the whole grid comes back as a
  # single run; cell borders, on the other hand, produce a vertical edge at every
  # row whatever the fill behind them is.
  $edge = New-Object 'int[]' $width
  for ($x = 1; $x -lt $width; $x++) {
    $count = 0
    for ($y = $band.Start; $y -le $band.End; $y += 2) {
      $a = $bitmap.GetPixel($x - 1, $y).GetBrightness()
      $b = $bitmap.GetPixel($x, $y).GetBrightness()
      if ([Math]::Abs($a - $b) -gt 0.09) { $count++ }
    }
    $edge[$x] = $count
  }
  $edgeMax = ($edge | Measure-Object -Maximum).Maximum
  $borderColumns = New-Object System.Collections.ArrayList
  for ($x = 1; $x -lt $width; $x++) {
    if ($edge[$x] -ge $edgeMax * 0.45) { [void]$borderColumns.Add($x) }
  }
  if ($borderColumns.Count -lt 14) { throw "Found $($borderColumns.Count) border columns; expected at least 14." }

  # Collapse adjacent columns into one border each.
  $colRuns = New-Object System.Collections.ArrayList
  $runStart = $borderColumns[0]; $prev = $borderColumns[0]
  foreach ($x in $borderColumns) {
    if ($x - $prev -gt 3) {
      [void]$colRuns.Add([pscustomobject]@{ Start = $runStart; End = $prev })
      $runStart = $x
    }
    $prev = $x
  }
  [void]$colRuns.Add([pscustomobject]@{ Start = $runStart; End = $prev })
  $colRuns = @($colRuns)
  if ($colRuns.Count -lt 14) { throw "Found $($colRuns.Count) borders; expected at least 14." }

  # Grids are not separated by a wider gap - measured on the openraising pages the
  # space between two grids is 27px while the cell pitch is 45, so a gap rule
  # splits in the wrong place or not at all. What does separate them is that the
  # spacing stops being the cell pitch. Split wherever a spacing departs from the
  # median by more than a quarter.
  $spacings = @()
  for ($i = 1; $i -lt $colRuns.Count; $i++) {
    $spacings += ((($colRuns[$i].Start + $colRuns[$i].End) / 2.0) - (($colRuns[$i - 1].Start + $colRuns[$i - 1].End) / 2.0))
  }
  $pitch = ($spacings | Sort-Object)[[int]($spacings.Count / 2)]

  $groups = New-Object System.Collections.ArrayList
  $current = New-Object System.Collections.ArrayList
  [void]$current.Add($colRuns[0])
  for ($i = 1; $i -lt $colRuns.Count; $i++) {
    if ([Math]::Abs($spacings[$i - 1] - $pitch) -gt $pitch * 0.25) {
      [void]$groups.Add(@($current)); $current = New-Object System.Collections.ArrayList
    }
    [void]$current.Add($colRuns[$i])
  }
  [void]$groups.Add(@($current))

  $found = New-Object System.Collections.ArrayList
  foreach ($group in $groups) {
    # Fourteen borders bound thirteen cells. Anything else is a legend or a
    # title, and guessing at it would invent a range.
    if ($group.Count -ne 14) { continue }
    $firstEdge = ($group[0].Start + $group[0].End) / 2.0
    $lastEdge = ($group[13].Start + $group[13].End) / 2.0
    $cell = ($lastEdge - $firstEdge) / 13.0
    $left = $firstEdge

    # Rows are found exactly as the columns were: by cell borders. Scoring label
    # ink does not work - a dark-filled cell is as dark as a label, so the peak
    # lands anywhere. Edges are indifferent to the fill behind them.
    $rowEdge = New-Object 'int[]' $height
    $xFrom = [int]$left; $xTo = [Math]::Min($width - 1, [int]($left + 13 * $cell))
    for ($y = 1; $y -lt $height; $y++) {
      $count = 0
      for ($x = $xFrom; $x -le $xTo; $x += 2) {
        if ([Math]::Abs($bitmap.GetPixel($x, $y - 1).GetBrightness() - $bitmap.GetPixel($x, $y).GetBrightness()) -gt 0.09) { $count++ }
      }
      $rowEdge[$y] = $count
    }
    $rowEdgeMax = ($rowEdge | Measure-Object -Maximum).Maximum
    $rowBorders = New-Object System.Collections.ArrayList
    $rowRunStart = -1; $rowPrev = -99
    for ($y = 1; $y -lt $height; $y++) {
      # A lower bar than the columns use. A horizontal border separates two cells
      # that are often the same colour, so it registers far more weakly than a
      # vertical one; at the columns' threshold only three or four of fourteen
      # showed up and every layout was refused.
      if ($rowEdge[$y] -lt $rowEdgeMax * 0.22) { continue }
      if ($y - $rowPrev -gt 3) {
        if ($rowRunStart -ge 0) { [void]$rowBorders.Add(($rowRunStart + $rowPrev) / 2.0) }
        $rowRunStart = $y
      }
      $rowPrev = $y
    }
    if ($rowRunStart -ge 0) { [void]$rowBorders.Add(($rowRunStart + $rowPrev) / 2.0) }
    $rowBorders = @($rowBorders)
    if ($rowBorders.Count -lt 14) { throw "Found $($rowBorders.Count) row borders for the grid at x=$left; expected at least 14." }

    # Best fit rather than a strict run of fourteen. One border can go missing -
    # a dark fill meeting a dark fill barely registers an edge - and demanding
    # consecutiveness threw the whole grid away for it.
    $bestTop = $null; $bestHits = -1
    foreach ($candidate in $rowBorders) {
      if ($candidate + 13 * $cell -ge $height) { continue }
      $hits = 0
      for ($k = 0; $k -le 13; $k++) {
        $expected = $candidate + $k * $cell
        foreach ($border in $rowBorders) {
          if ([Math]::Abs($border - $expected) -le 3) { $hits++; break }
        }
      }
      if ($hits -gt $bestHits) { $bestHits = $hits; $bestTop = $candidate }
    }
    # Ten of fourteen is a grid; fewer means the pitch or the column group is wrong
    # and reporting a position for it would be a guess.
    if ($null -eq $bestTop -or $bestHits -lt 10) {
      throw "Only $bestHits of 14 row borders line up for the grid at x=$left."
    }

    [void]$found.Add([pscustomobject]@{
      left = [Math]::Round($left, 1)
      top  = [Math]::Round($bestTop, 1)
      cell = [Math]::Round($cell, 2)
    })
  }

  if ($found.Count -eq 0) { throw "No 13-column grid found." }
  if ($Json) { $found | ConvertTo-Json -Compress }
  else {
    "band rows {0}-{1}" -f $band.Start, $band.End
    foreach ($g in $found) {
      "grid  -Left {0} -Top {1} -Cell {2}" -f
        $g.left.ToString([System.Globalization.CultureInfo]::InvariantCulture),
        $g.top.ToString([System.Globalization.CultureInfo]::InvariantCulture),
        $g.cell.ToString([System.Globalization.CultureInfo]::InvariantCulture)
    }
  }
} finally {
  $bitmap.Dispose()
}
