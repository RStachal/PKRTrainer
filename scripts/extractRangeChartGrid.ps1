# Read a 13x13 hand grid out of a range-chart image by sampling cell colours.
#
# Transcribing 169 cells by eye from a compressed screenshot is exactly the kind
# of silent content error this project keeps finding - a range that looks right
# and grades players against the wrong hands. Sampling the pixels is reproducible
# and can be checked: the diagonal must come out as the pairs, and a named cell
# can be asserted against what the chart plainly shows.
#
# The grid is located by its own geometry rather than by hardcoded offsets, so the
# same script reads charts from either pack.
#
#   powershell -File scripts/extractRangeChartGrid.ps1 -Image <path> -Left <x> -Top <y> -Cell <px> [-Json]
#
# Left/Top are the top-left corner of the FIRST cell (AA) and Cell is the pitch
# between cell centres. Pass -Probe to print a colour map that helps find them.

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Image,
  [int]$Left = 0,
  [int]$Top = 0,
  [double]$Cell = 0,
  [switch]$Probe,
  [switch]$Json,
  # Colour distance below which two shades are treated as one fill.
  [double]$Merge = 45
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$RANKS = @('A','K','Q','J','T','9','8','7','6','5','4','3','2')

function Get-HandLabel([int]$row, [int]$col) {
  $high = $RANKS[$row]; $low = $RANKS[$col]
  if ($row -eq $col) { return "$high$low" }
  if ($row -lt $col) { return "$high$low" + "s" }
  return "$low$high" + "o"
}

$bitmap = New-Object System.Drawing.Bitmap($Image)
try {
  if ($Probe) {
    # Coarse map so a caller can spot the grid's edges without opening an editor.
    "image: {0} x {1}" -f $bitmap.Width, $bitmap.Height
    for ($y = 0; $y -lt $bitmap.Height; $y += 40) {
      $row = ""
      for ($x = 0; $x -lt $bitmap.Width; $x += 20) {
        $p = $bitmap.GetPixel($x, $y)
        # Grid cells are light and saturated; background is grey or dark.
        $row += if ($p.GetBrightness() -gt 0.55 -and $p.GetSaturation() -gt 0.12) { "#" } else { "." }
      }
      "{0,4}: {1}" -f $y, $row
    }
    return
  }

  if ($Cell -le 0) { throw "-Cell is required unless -Probe is used." }

  $cells = @()
  for ($row = 0; $row -lt 13; $row++) {
    for ($col = 0; $col -lt 13; $col++) {
      # Sample the centre, away from the label text and the cell border.
      $x = [int]($Left + $Cell * ($col + 0.5))
      $y = [int]($Top + $Cell * ($row + 0.5))
      if ($x -lt 0 -or $y -lt 0 -or $x -ge $bitmap.Width -or $y -ge $bitmap.Height) {
        throw "Cell [$row,$col] samples ($x,$y), outside the image. Check -Left/-Top/-Cell."
      }
      # Modal colour over the cell interior, not a median. The label glyph is
      # dark and a median lets it drag a salmon cell to brown; the fill is always
      # the majority of the interior pixels, so the mode is the fill. Quantised so
      # anti-aliasing and the page's background gradient do not split one fill
      # into a dozen near-identical shades.
      $tally = @{}
      $reach = [int]($Cell * 0.32)
      for ($dx = -$reach; $dx -le $reach; $dx += 2) {
        for ($dy = -$reach; $dy -le $reach; $dy += 2) {
          $px = [Math]::Min([Math]::Max($x + $dx, 0), $bitmap.Width - 1)
          $py = [Math]::Min([Math]::Max($y + $dy, 0), $bitmap.Height - 1)
          $p = $bitmap.GetPixel($px, $py)
          $key = "{0}_{1}_{2}" -f [int]([Math]::Round($p.R / 24)), [int]([Math]::Round($p.G / 24)), [int]([Math]::Round($p.B / 24))
          if ($tally.ContainsKey($key)) { $tally[$key] = $tally[$key] + 1 } else { $tally[$key] = 1 }
        }
      }
      # Not $top: PowerShell variables are case-insensitive, so that would assign
      # a string to the [int]$Top parameter and fail at the binding.
      $modalKey = ($tally.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 1).Key
      $parts = $modalKey.Split("_")
      $r = [int]$parts[0] * 24; $g = [int]$parts[1] * 24; $b = [int]$parts[2] * 24
      if ($r -gt 255) { $r = 255 }; if ($g -gt 255) { $g = 255 }; if ($b -gt 255) { $b = 255 }
      $cells += , [pscustomobject]@{
        hand = Get-HandLabel $row $col
        row  = $row
        col  = $col
        hex  = "#{0:X2}{1:X2}{2:X2}" -f $r, $g, $b
      }
    }
  }

  # The page has a vertical gradient behind the grid, so one fill colour arrives
  # as two or three near-identical shades depending on where the cell sits. Merge
  # anything within a small distance, keeping the most common shade as the label.
  $clusters = @()
  # Not $cell: case-insensitive variables would bind this to the [double]$Cell
  # parameter, the same trap $top hit against $Top a moment earlier.
  foreach ($shade in ($cells | Group-Object hex | Sort-Object Count -Descending)) {
    $rgb = [System.Drawing.ColorTranslator]::FromHtml($shade.Name)
    $joined = $false
    foreach ($cluster in $clusters) {
      $d = [Math]::Sqrt(
        [Math]::Pow($rgb.R - $cluster.R, 2) +
        [Math]::Pow($rgb.G - $cluster.G, 2) +
        [Math]::Pow($rgb.B - $cluster.B, 2))
      if ($d -le $Merge) { $cluster.Hands += $shade.Group; $joined = $true; break }
    }
    if (-not $joined) {
      $clusters += , [pscustomobject]@{ Hex = $shade.Name; R = $rgb.R; G = $rgb.G; B = $rgb.B; Hands = @($shade.Group) }
    }
  }

  if ($Json) {
    ($clusters | ForEach-Object {
      [pscustomobject]@{ hex = $_.Hex; count = $_.Hands.Count; hands = @($_.Hands | ForEach-Object { $_.hand }) }
    }) | ConvertTo-Json -Depth 4 -Compress
  } else {
    foreach ($cluster in ($clusters | Sort-Object { $_.Hands.Count } -Descending)) {
      "{0}  x{1,-4} {2}" -f $cluster.Hex, $cluster.Hands.Count, (($cluster.Hands | ForEach-Object { $_.hand }) -join ", ")
    }
  }
} finally {
  $bitmap.Dispose()
}
