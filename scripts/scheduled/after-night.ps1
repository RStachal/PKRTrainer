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
$command = "/c cd /d `"$repo`" && `"$node`" scripts\run-cli.mjs scripts\runAfterNight.mts --write --streets-if-new=flop --turn-ev-minutes=210 >> `"$log`" 2>&1"
$process = Start-Process -FilePath "cmd.exe" -ArgumentList $command -WindowStyle Hidden -Wait -PassThru
exit $process.ExitCode
