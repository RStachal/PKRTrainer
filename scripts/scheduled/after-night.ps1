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
$cycleCode = $process.ExitCode

# Ranni brana (od 22. 10. 2026, majitel: "chci vyvijet i pres den, ale v me
# praci jsou spicky pameti"). Produkcni build chce ve spicce kolem 11 GB, takze
# cela verify:block se pres den nevejde; denni vyvoj jede na verify:day (bez
# buildu a Chrome E2E) a celou branu dela tohle rano hned po cyklu, dokud stroj
# patri nam. Jen vsedni den, pri aspon 14 GB volnych a s koncem do 08:30 -
# jinak se zapise, ze se odklada. Vysledek ve verify-morning.json.
$gateLog = Join-Path $repo "artifacts\verify-morning.log"
$gateState = Join-Path $repo "artifacts\verify-morning.json"
$npm = "C:\Program Files\nodejs\npm.cmd"
$freeGb = [math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1MB, 1)
$now = Get-Date
$early = ($now.Hour -lt 8) -or (($now.Hour -eq 8) -and ($now.Minute -lt 30))
$weekday = ($day -ne [DayOfWeek]::Saturday) -and ($day -ne [DayOfWeek]::Sunday)
$state = [ordered]@{ date = $now.ToString("yyyy-MM-dd HH:mm"); freeGb = $freeGb }
if ($weekday -and $early -and ($freeGb -ge 14)) {
  Write-NightLog -Log $log -Message "ranni brana: start (volno $freeGb GB)"
  $started = Get-Date
  $gate = Start-Process -FilePath "cmd.exe" -ArgumentList "/c cd /d `"$repo`" && `"$npm`" run verify:block > `"$gateLog`" 2>&1" -WindowStyle Hidden -Wait -PassThru
  $minutes = [math]::Round(((Get-Date) - $started).TotalMinutes, 1)
  $failed = ""
  if ($gate.ExitCode -ne 0) {
    $steps = Select-String -Path $gateLog -Pattern "^> mtt-preflop-trainer@[0-9.]+ (\S+)" | ForEach-Object { $_.Matches[0].Groups[1].Value }
    if ($steps) { $failed = @($steps)[-1] }
  }
  $state.ran = $true
  $state.rc = $gate.ExitCode
  $state.failedStep = $failed
  $state.minutes = $minutes
  $suffix = ""
  if ($failed) { $suffix = ", spadl krok $failed" }
  Write-NightLog -Log $log -Message "ranni brana: rc=$($gate.ExitCode) za $minutes min$suffix"
} else {
  $state.ran = $false
  $state.reason = "vsedni den $weekday, pred 08:30 $early, volno $freeGb GB (potreba 14)"
  Write-NightLog -Log $log -Message "ranni brana se odklada: $($state.reason)"
}
# Bez BOM: Set-Content -Encoding utf8 ho v PowerShellu 5.1 pise a JSON.parse na nem spadne.
[System.IO.File]::WriteAllText($gateState, ($state | ConvertTo-Json -Compress))
exit $cycleCode
