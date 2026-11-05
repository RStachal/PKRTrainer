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

  # Where cells are drawn with a visible gap between them, each gap produces two
  # edges - cell to gap and gap to cell - so a grid arrives as 27 borders instead
  # of 14 and no group is ever the right size. Merge any pair closer together
  # than a fraction of the typical spacing; a real cell border is never that
  # close to its neighbour.
  if ($colRuns.Count -ge 3) {
    $rawSpacings = @()
    for ($i = 1; $i -lt $colRuns.Count; $i++) {
      $rawSpacings += ((($colRuns[$i].Start + $colRuns[$i].End) / 2.0) - (($colRuns[$i - 1].Start + $colRuns[$i - 1].End) / 2.0))
    }
    $sortedSpacings = @($rawSpacings | Sort-Object)
    $typical = $sortedSpacings[[int]($sortedSpacings.Count / 2)]
    $low = $sortedSpacings[[int]($sortedSpacings.Count * 0.25)]
    $high = $sortedSpacings[[int]($sortedSpacings.Count * 0.75)]
    # Only merge when the spacings are plainly bimodal - a narrow gap alternating
    # with a cell width. Applied unconditionally it collapsed a three-grid page
    # into one, which is a worse failure than the pages it was meant to rescue.
    $doubled = $low -gt 0 -and ($low / $high) -lt 0.5
    $merged = New-Object System.Collections.ArrayList
    $pending = $colRuns[0]
    for ($i = 1; $i -lt $colRuns.Count; $i++) {
      $centre = ($colRuns[$i].Start + $colRuns[$i].End) / 2.0
      $pendingCentre = ($pending.Start + $pending.End) / 2.0
      if ($doubled -and ($centre - $pendingCentre) -lt $typical * 0.55) {
        $pending = [pscustomobject]@{ Start = $pending.Start; End = $colRuns[$i].End }
      } else {
        [void]$merged.Add($pending); $pending = $colRuns[$i]
      }
    }
    [void]$merged.Add($pending)
    $colRuns = @($merged)
  }

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

  # Grids can sit almost flush: measured on the pushing pages the space between
  # two of them is 47px against a 45px cell pitch, a two-pixel deviation that no
  # spacing rule can separate without also splitting inside a grid. But a hand
  # grid has exactly fourteen borders, so a group holding a multiple of fourteen
  # is that many grids and can be cut structurally rather than by measurement.
  $subdivided = New-Object System.Collections.ArrayList
  foreach ($group in $groups) {
    if ($group.Count -gt 14 -and $group.Count % 14 -eq 0) {
      for ($chunk = 0; $chunk -lt $group.Count / 14; $chunk++) {
        [void]$subdivided.Add(@($group[($chunk * 14)..($chunk * 14 + 13)]))
      }
    } else {
      [void]$subdivided.Add($group)
    }
  }
  $groups = $subdivided

  $found = New-Object System.Collections.ArrayList
  foreach ($group in $groups) {
    # Fourteen borders bound thirteen cells. Anything else is a legend or a
    # title, and guessing at it would invent a range.
    if ($group.Count -ne 14) { continue }
    $firstEdge = ($group[0].Start + $group[0].End) / 2.0
    $lastEdge = ($group[13].Start + $group[13].End) / 2.0
    $cell = ($lastEdge - $firstEdge) / 13.0
    $left = $firstEdge

    # Rows get their own pitch. Borrowing the columns' was the mistake that made
    # every earlier attempt fail: measured on these pages the cells are 45.08 wide
    # and 46.2 tall, so a comb built on the column pitch drifts a full cell over
    # thirteen steps and never lines up. The hand-tuned 45.6 that appeared to work
    # was simply a compromise between the two that the sampling window forgave.
    $rowEdge = New-Object 'double[]' $height
    $xFrom = [int]$left; $xTo = [Math]::Min($width - 1, [int]($left + 13 * $cell))
    for ($y = 1; $y -lt $height; $y++) {
      $sum = 0.0
      for ($x = $xFrom; $x -le $xTo; $x += 2) {
        $sum += [Math]::Abs($bitmap.GetPixel($x, $y - 1).GetBrightness() - $bitmap.GetPixel($x, $y).GetBrightness())
      }
      $rowEdge[$y] = $sum
    }

    # A high percentile rather than the maximum: the title and the page artwork
    # produce edges far stronger than any cell border, and scaling a threshold off
    # them put the bar above every real border.
    $sortedEdge = @($rowEdge | Sort-Object)
    $strong = $sortedEdge[[int]($sortedEdge.Count * 0.97)]
    $rowBorders = New-Object System.Collections.ArrayList
    $runStart = -1; $rowPrev = -99
    for ($y = 1; $y -lt $height; $y++) {
      if ($rowEdge[$y] -lt $strong * 0.5) { continue }
      if ($y - $rowPrev -gt 4) {
        if ($runStart -ge 0) { [void]$rowBorders.Add(($runStart + $rowPrev) / 2.0) }
        $runStart = $y
      }
      $rowPrev = $y
    }
    if ($runStart -ge 0) { [void]$rowBorders.Add(($runStart + $rowPrev) / 2.0) }
    $rowBorders = @($rowBorders)
    if ($rowBorders.Count -lt 14) {
      throw "Grid at x=${left}: found $($rowBorders.Count) row borders; expected at least 14."
    }

    # Fit the comb to the candidates rather than demanding a clean run of
    # fourteen. Real borders arrive doubled where a line is two pixels wide and
    # missing where two identical fills meet, so consecutiveness is the wrong
    # thing to require - it scored a 15 percent spread on a grid whose borders are
    # plainly regular. Trying each pair as the outer two and counting how many of
    # the intervening thirteen land on the comb tolerates both faults.
    $bestTop = $null; $bestCellY = 0.0; $bestHits = -1
    for ($i = 0; $i -lt $rowBorders.Count; $i++) {
      for ($j = $i + 1; $j -lt $rowBorders.Count; $j++) {
        $pitch = ($rowBorders[$j] - $rowBorders[$i]) / 13.0
        # Cells are not square on these pages, but nor are they far off.
        if ($pitch -lt $cell * 0.85 -or $pitch -gt $cell * 1.25) { continue }
        $hits = 0
        for ($k = 0; $k -le 13; $k++) {
          $expected = $rowBorders[$i] + $k * $pitch
          foreach ($border in $rowBorders) {
            if ([Math]::Abs($border - $expected) -le 3) { $hits++; break }
          }
        }
        if ($hits -gt $bestHits) { $bestHits = $hits; $bestTop = $rowBorders[$i]; $bestCellY = $pitch }
      }
    }
    # Twelve of fourteen leaves room for the two outer edges to be undrawn while
    # still being unambiguous; fewer means this is not a grid at this pitch.
    if ($null -eq $bestTop -or $bestHits -lt 12) {
      throw "Grid at x=${left}: only $bestHits of 14 row borders fit a constant pitch; refusing to place it."
    }

    [void]$found.Add([pscustomobject]@{
      left = [Math]::Round($left, 1)
      top   = [Math]::Round($bestTop, 1)
      cellX = [Math]::Round($cell, 2)
      cellY = [Math]::Round($bestCellY, 2)
    })
  }

  if ($found.Count -eq 0) { throw "No 13-column grid found." }
  if ($Json) { $found | ConvertTo-Json -Compress }
  else {
    "band rows {0}-{1}" -f $band.Start, $band.End
    foreach ($g in $found) {
      "grid  -Left {0} -Top {1} -CellX {2} -CellY {3}" -f
        $g.left.ToString([System.Globalization.CultureInfo]::InvariantCulture),
        $g.top.ToString([System.Globalization.CultureInfo]::InvariantCulture),
        $g.cellX.ToString([System.Globalization.CultureInfo]::InvariantCulture),
        $g.cellY.ToString([System.Globalization.CultureInfo]::InvariantCulture)
    }
  }
} finally {
  $bitmap.Dispose()
}
