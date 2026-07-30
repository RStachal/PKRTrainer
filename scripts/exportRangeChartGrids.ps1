# Detect and extract every grid on a set of chart pages, as JSON.
#
# The pair of scripts either side of this one do one page at a time; this drives
# them over a folder so the packs can be compared against the shipped ranges in
# bulk rather than a page at a time.
#
# Emits one file per page. A page the detector refuses is reported and skipped -
# never guessed at - because wrong geometry produces a complete, confident range
# describing different cells.
#
#   powershell -File scripts/exportRangeChartGrids.ps1 -Folder <dir> -Out <dir>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Folder,
  [Parameter(Mandatory = $true)][string]$Out,
  [string]$Filter = "*.png"
)

$ErrorActionPreference = "Stop"
$here = Split-Path $PSCommandPath -Parent
$detect = Join-Path $here "detectRangeChartGrids.ps1"
$extract = Join-Path $here "extractRangeChartGrid.ps1"
$null = New-Item -ItemType Directory -Force $Out

$resolved = 0; $refused = 0
foreach ($file in Get-ChildItem $Folder -Recurse -File -Include $Filter) {
  $detected = & powershell -NoProfile -File $detect -Image $file.FullName 2>&1
  $lines = @($detected | ForEach-Object { "$_" } | Where-Object { $_.TrimStart().StartsWith("grid ") })
  if ($lines.Count -eq 0) {
    $refused++
    Write-Host ("REFUSED  {0}" -f $file.Name)
    continue
  }

  $grids = @()
  foreach ($line in $lines) {
    # "grid  -Left 360 -Top 126.5 -CellX 45.08 -CellY 46.31"
    $args = $line.Trim() -replace '^grid\s+', '' -split '\s+'
    $json = & powershell -NoProfile -File $extract -Image $file.FullName @args -Json 2>&1
    $text = ($json | ForEach-Object { "$_" }) -join ""
    if (-not $text.TrimStart().StartsWith("[") -and -not $text.TrimStart().StartsWith("{")) {
      Write-Host ("  grid failed on {0}: {1}" -f $file.Name, $text.Substring(0, [Math]::Min(90, $text.Length)))
      continue
    }
    $grids += , [pscustomobject]@{ geometry = $line.Trim(); clusters = ($text | ConvertFrom-Json) }
  }
  if ($grids.Count -eq 0) { $refused++; continue }

  $resolved++
  $safe = ($file.BaseName -replace '[^A-Za-z0-9\-_ ]', '_')
  [pscustomobject]@{ page = $file.Name; folder = (Split-Path $file.DirectoryName -Leaf); grids = $grids } |
    ConvertTo-Json -Depth 8 -Compress |
    Set-Content -LiteralPath (Join-Path $Out "$safe.json") -Encoding utf8
  Write-Host ("OK       {0}  ({1} grid(s))" -f $file.Name, $grids.Count)
}

Write-Host ""
Write-Host ("resolved: {0}" -f $resolved)
Write-Host ("refused:  {0}" -f $refused)
