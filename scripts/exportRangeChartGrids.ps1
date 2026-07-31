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
#
# -Geometry takes a JSON file of hand-measured grids for pages the detector reads
# incompletely. It under-detects silently: "Rejam BB vs MP HJ CO" names three
# openers and three grids sit at the same left offsets as every sibling sheet,
# but only two were found, and a short page is not refused the way a page with no
# grid at all is. Nothing downstream can tell a two-grid page from a page that
# genuinely has two. So the override supplies the missing geometry rather than
# loosening the detector, and each entry is a measurement someone made and
# checked against the 169-class assertion.
#
#   { "Rejam BB vs MP HJ CO.png": ["-Left 1275.5 -Top 129.5 -CellX 45.12 -CellY 46.31"] }
#
# Listed grids are appended to whatever the detector found, then the whole set is
# sorted left to right so the order still matches the seat order in the file name.

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Folder,
  [Parameter(Mandatory = $true)][string]$Out,
  [string]$Filter = "*.png",
  [string]$Geometry = ""
)

$ErrorActionPreference = "Stop"
$here = Split-Path $PSCommandPath -Parent
$detect = Join-Path $here "detectRangeChartGrids.ps1"
$extract = Join-Path $here "extractRangeChartGrid.ps1"
$null = New-Item -ItemType Directory -Force $Out

$overrides = @{}
if ($Geometry -ne "") {
  $parsed = Get-Content -LiteralPath $Geometry -Raw -Encoding utf8 | ConvertFrom-Json
  foreach ($property in $parsed.PSObject.Properties) { $overrides[$property.Name] = @($property.Value) }
  Write-Host ("geometry overrides loaded for {0} page(s)" -f $overrides.Count)
}

function Get-GridLeft([string]$Line) {
  if ($Line -match '-Left\s+([\d.]+)') { return [double]$Matches[1] }
  return [double]::MaxValue
}

$resolved = 0; $refused = 0
foreach ($file in Get-ChildItem $Folder -Recurse -File -Include $Filter) {
  $detected = & powershell -NoProfile -File $detect -Image $file.FullName 2>&1
  $lines = @($detected | ForEach-Object { "$_" } | Where-Object { $_.TrimStart().StartsWith("grid ") })
  if ($overrides.ContainsKey($file.Name)) {
    $added = @($overrides[$file.Name] | ForEach-Object { "grid  $_" })
    $lines = @(@($lines) + $added) | Sort-Object { Get-GridLeft $_ }
    Write-Host ("  +{0} hand-measured grid(s) for {1}" -f $added.Count, $file.Name)
  }
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
