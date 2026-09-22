# Noční rozklad, spouštěný Plánovačem úloh (PKRTrainer-Night-Decomposition, 21:00).
# Skryté okno ze stejného důvodu jako after-night.ps1: viditelnou konzoli
# někdo zavře a běh dostane Ctrl+C. Argumenty přesně jako v úloze do 22. 9. 2026.
$repo = "C:\Users\stachal\PKRTrainer\PKRTrainer"
$python = "C:\Users\stachal\AppData\Local\Microsoft\WindowsApps\python3.exe"
$script = Join-Path $repo "Agents\solver-input\decomposition\run_night_decomposition.py"
$log = Join-Path $repo "artifacts\decomposition\night.log"
$command = "/c set PYTHONIOENCODING=utf-8 && `"$python`" `"$script`" --until=07:00 --workers=8 --river-workers=16 --river-threads=1 >> `"$log`" 2>&1"
$process = Start-Process -FilePath "cmd.exe" -ArgumentList $command -WindowStyle Hidden -Wait -PassThru
exit $process.ExitCode
