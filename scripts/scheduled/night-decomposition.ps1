# Noční rozklad, spouštěný Plánovačem úloh (PKRTrainer-Night-Decomposition, 21:00).
# Skryté okno ze stejného důvodu jako after-night.ps1: viditelnou konzoli
# někdo zavře a běh dostane Ctrl+C. Argumenty přesně jako v úloze do 22. 9. 2026.
$repo = "C:\Users\stachal\PKRTrainer\PKRTrainer"
$python = "C:\Users\stachal\AppData\Local\Microsoft\WindowsApps\python3.exe"
$script = Join-Path $repo "Agents\solver-input\decomposition\run_night_decomposition.py"
$log = Join-Path $repo "artifacts\decomposition\night.log"
# Brána okna a umlčení víka; obojí se musí dělat **každou noc**, ne jednou -
# viz lib-night-window.ps1.
. (Join-Path $PSScriptRoot "lib-night-window.ps1")
if (-not (Test-NightWindow -Log $log)) { exit 0 }
# Zdroj napajeni jako prvni: rozhoduje o tom, jestli maji dva radky pod nim
# vubec ucinek (viz Write-PowerSource).
Write-PowerSource -Log $log
Set-LidIgnoredOnAc -Log $log
Set-NoIdleSleepOnAc -Log $log
$command = "/c set PYTHONIOENCODING=utf-8 && `"$python`" `"$script`" --until=07:00 --workers=8 --river-workers=16 --river-threads=1 >> `"$log`" 2>&1"
$process = Start-Process -FilePath "cmd.exe" -ArgumentList $command -WindowStyle Hidden -Wait -PassThru
exit $process.ExitCode
