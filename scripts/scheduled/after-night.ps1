# Ranní cyklus po noci, spouštěný Plánovačem úloh (PKRTrainer-After-Night-TurnEv, 07:05).
#
# Proč přes PowerShell a ne rovnou cmd.exe: úloha běží pod přihlášeným
# uživatelem a do 22. 9. 2026 jí Plánovač otevíral viditelné okno konzole.
# 22. 9. v 08:11, tři vteřiny po přihlášení, to okno někdo zavřel - cyklus
# dostal Ctrl+C (kód 0xC000013A) uprostřed obnovy turnové EV a 17 tabulek
# zůstalo zastaralých. Skryté okno se zavřít nedá. `-Wait` drží úlohu jako
# běžící, takže strop Plánovače (PT5H) dál platí.
$repo = "C:\Users\stachal\PKRTrainer\PKRTrainer"
$node = "C:\Program Files\nodejs\node.exe"
$log = Join-Path $repo "artifacts\after-night-turn-ev.log"
# Plny cyklus packu (pack-cycle.ps1) dela vsechno, co tenhle, a vic. Dva cykly
# vedle sebe by zapisovaly tytez manifesty, verdikty a zaznam vstupu, takze
# kdyz plny bezi, lehky se vynecha.
. (Join-Path $PSScriptRoot "lib-night-window.ps1")
if (Test-PackCycleRunning -Repo $repo) {
  Write-NightLog -Log $log -Message "bezi plny cyklus packu, lehky ranni cyklus se vynechava"
  exit 0
}
# Vikend (od 15. 10. 2026, jen s vikendovym rozvrhem v Planovaci): sobotni rano
# patri plnemu cyklu - packy vsech ulic, kontrola, EV - a solver na nej pocka
# (`Test-NightWindow`). Nedele patri solveru cela, lehky cyklus ji nebrzdi;
# zastarale turnove tabulky dozene pondelni rano. Plny cyklus se pusti jen
# tehdy, kdyz ho strop ulohy unese (prvni beh prestavi vsechno, i 6 h).
$weekend = Test-WeekendSchedule -TaskName "PKRTrainer-Night-Decomposition"
$day = (Get-Date).DayOfWeek
if ($weekend -and $day -eq [DayOfWeek]::Saturday -and
    (Get-TaskTimeLimit -TaskName "PKRTrainer-After-Night-TurnEv") -ge [TimeSpan]::FromHours(8)) {
  Write-NightLog -Log $log -Message "sobota: misto lehkeho cyklu bezi plny (pack-cycle.ps1)"
  & (Join-Path $PSScriptRoot "pack-cycle.ps1")
  exit $LASTEXITCODE
}
if ($weekend -and $day -eq [DayOfWeek]::Sunday) {
  Write-NightLog -Log $log -Message "nedele: ranni cyklus se vynechava, stroj patri solveru"
  exit 0
}
$command = "/c cd /d `"$repo`" && `"$node`" scripts\run-cli.mjs scripts\runAfterNight.mts --write --streets-if-new=flop,turn --turn-ev-minutes=210 >> `"$log`" 2>&1"
$process = Start-Process -FilePath "cmd.exe" -ArgumentList $command -WindowStyle Hidden -Wait -PassThru
exit $process.ExitCode
