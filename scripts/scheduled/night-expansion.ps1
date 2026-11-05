# Noční expanze (monolitické solvy), spouštěná Plánovačem úloh (PKRTrainer-Night-Expansion, 20:01).
# Skryté okno ze stejného důvodu jako after-night.ps1. Argumenty přesně jako v úloze do 22. 9. 2026.
# Brána okna a umlčení víka; obojí se musí dělat **každou noc**, ne jednou -
# viz lib-night-window.ps1. Odtud i cesta k repozitáři a k Pythonu.
. (Join-Path $PSScriptRoot "lib-night-window.ps1")
$repo = Get-NightRepo
$python = Get-NightPython
$script = Join-Path $repo "Agents\solver-input\decomposition\run_night_expansion.py"
$log = Join-Path $repo "artifacts\decomposition\expansion.log"
if (-not $python) {
  Write-NightLog -Log $log -Message "POZOR: python nenalezen (PKRTRAINER_PYTHON, pymanager, PATH); noc nepobezi"
  exit 1
}
# Vikendovy rozvrh (od 15. 10. 2026) se pozna z Planovace; dokud ho uloha nema,
# chova se vsechno jako dosud - okno do 07:00, o vikendu pres den nic.
$weekend = Test-WeekendSchedule -TaskName "PKRTrainer-Night-Expansion"
# Mimo okno: tik po rannim otevreni vika nebo odemceni zazalohuje checkpointy
# z noci (D7, Invoke-CheckpointBackup). Skript zalohy sam overi, ze je vsedni
# den pres den - v okne solveru nebali.
if (-not (Test-NightWindow -Log $log -Weekend $weekend -Repo $repo)) {
  Invoke-CheckpointBackup -Repo $repo -Python $python
  exit 0
}
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
# --parallel=2 --threads=8: pokus D6, dva monolity soubezne po osmi vlaknech
# (rozhodnuti majitele 3. 11. 2026, denik 329). Nahrazuje pokus 12 vs. 16
# vlaken (--thread-trial=16, od 20. 10., denik 322): po 45 deskach pomer 1,17
# s intervalem 0,93-1,57 - vic vlaken stroj nezaplni, jeden monolit drzi
# 5-7 logickych procesoru z 16. Vyhodnoceni: radek `propustnost:` na konci noci
# proti noci 2.-3. 11. (14 desek za 10,4 h, jeden monolit); zpet = smazat oba
# parametry.
$command = "/c set PYTHONIOENCODING=utf-8 && `"$python`" `"$script`" --until=$until --workers=8 --river-workers=16 --river-threads=1 --turn-share=0.5 --parallel=2 --threads=8 >> `"$log`" 2>&1"
$process = Start-Process -FilePath "cmd.exe" -ArgumentList $command -WindowStyle Hidden -Wait -PassThru
# Noc doběhla; skončila-li po sedmé ve všední den, záloha jde hned.
Invoke-CheckpointBackup -Repo $repo -Python $python
exit $process.ExitCode
