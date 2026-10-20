# Noční expanze (monolitické solvy), spouštěná Plánovačem úloh (PKRTrainer-Night-Expansion, 21:01).
# Skryté okno ze stejného důvodu jako after-night.ps1. Argumenty přesně jako v úloze do 22. 9. 2026.
$repo = "C:\Users\stachal\PKRTrainer\PKRTrainer"
$python = "C:\Users\stachal\AppData\Local\Microsoft\WindowsApps\python3.exe"
$script = Join-Path $repo "Agents\solver-input\decomposition\run_night_expansion.py"
$log = Join-Path $repo "artifacts\decomposition\expansion.log"
# Brána okna a umlčení víka; obojí se musí dělat **každou noc**, ne jednou -
# viz lib-night-window.ps1.
. (Join-Path $PSScriptRoot "lib-night-window.ps1")
# Vikendovy rozvrh (od 15. 10. 2026) se pozna z Planovace; dokud ho uloha nema,
# chova se vsechno jako dosud - okno do 07:00, o vikendu pres den nic.
$weekend = Test-WeekendSchedule -TaskName "PKRTrainer-Night-Expansion"
if (-not (Test-NightWindow -Log $log -Weekend $weekend -Repo $repo)) { exit 0 }
# Plny cyklus packu a solver se o stroj nedeli (viz pack-cycle.ps1): kdyz
# cyklus bezi, solver pocka na dalsi tik. Mrtvy proces v zamku se nepocita.
if (Test-PackCycleRunning -Repo $repo) {
  Write-NightLog -Log $log -Message "bezi plny cyklus packu, solver pocka na dalsi tik"
  exit 0
}
# Zdroj napajeni jako prvni: rozhoduje o tom, jestli maji dva radky pod nim
# vubec ucinek (viz Write-PowerSource).
Write-PowerSource -Log $log
Set-LidIgnoredOnAc -Log $log
Set-NoIdleSleepOnAc -Log $log
# Konec okna absolutne: o vikendu je to jiny den nez zitrejsi 07:00.
$until = Get-NightDeadline -Weekend $weekend
Write-NightLog -Log $log -Message "konec okna $until (vikendovy rozvrh: $weekend)"
# --turn-share jen predava dal: kdyz fronta dojde, zbytek okna dostane rozklad
# se stejnym delenim turn/river jako jeho vlastni uloha.
$command = "/c set PYTHONIOENCODING=utf-8 && `"$python`" `"$script`" --until=$until --workers=8 --river-workers=16 --river-threads=1 --turn-share=0.5 >> `"$log`" 2>&1"
$process = Start-Process -FilePath "cmd.exe" -ArgumentList $command -WindowStyle Hidden -Wait -PassThru
exit $process.ExitCode
