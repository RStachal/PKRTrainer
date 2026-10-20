# Plny cyklus packu (flop, turn, river, mechanicka kontrola, obnova EV) se zamkem.
#
# ## Proc vlastni spoustec
#
# Lehky ranni cyklus (`after-night.ps1`, kazdy den v 07:05) packy turnu a riveru
# negeneruje: river chce 16 GB haldy a vedle prace majitele se ve vsedni den
# nevejde. Plny cyklus se proto od 24. 9. 2026 nespustil ani jednou a k 15. 10.
# bylo 7 ze 48 turnovych a 25 ze 48 riverovych packu starsich nez jejich vrstvy
# (denik 317).
#
# Majitel 15. 10. 2026: stroj je na 100 % po-pa 21-7 a cely vikend. Plny cyklus
# patri tam - a nocni solver mu nesmi konkurovat (8. 10. naměřeno pet- az
# sestkrat pomalejsi faze, kdyz cyklu neco konkurovalo). Zamek drzi PID tohoto
# procesu; nocni wrappery ho ctou (`Test-PackCycleRunning`) a pockaji na dalsi
# tik. Mrtvy proces znamena stary zamek, takze pad cyklu noc nezablokuje.
#
#     powershell -NoProfile -ExecutionPolicy Bypass -File scripts\scheduled\pack-cycle.ps1 [-Streets river]
#
# -Streets omezi cyklus na vyjmenovane ulice (`--streets=` cyklu), se stejnym
# zamkem. Od 20. 10. 2026: oprava vyberu riveroveho rozpoctu meni jen riverove
# packy, a plny cyklus by zbytecne generoval i flop a turn.
param([string]$Streets = "")
$repo = "C:\Users\stachal\PKRTrainer\PKRTrainer"
$node = "C:\Program Files\nodejs\node.exe"
$log = Join-Path $repo "artifacts\after-night-full.log"
$lock = Join-Path $repo "artifacts\pack-cycle.lock"
$done = Join-Path $repo "artifacts\pack-cycle.done"
. (Join-Path $PSScriptRoot "lib-night-window.ps1")
if (Test-PackCycleRunning -Repo $repo) {
  Write-NightLog -Log $log -Message "plny cyklus uz bezi, koncim"
  exit 0
}
Set-Content -Path $lock -Value $PID -Encoding ascii
$code = 1
try {
  $only = ""
  if ($Streets -ne "") { $only = " --streets=$Streets" }
  Write-NightLog -Log $log -Message "plny cyklus: start (PID $PID)$only"
  # Turnova EV jen 120 min (ranni cyklus ma 210): plny cyklus nema konec okna a
  # nesmi se protahnout do vsedniho dne. Co nestihne, dozene ranni cyklus - ten
  # obnovuje zastarale turnove tabulky sam.
  $command = "/c cd /d `"$repo`" && `"$node`" scripts\run-cli.mjs scripts\runAfterNight.mts --write --turn-ev-minutes=120$only >> `"$log`" 2>&1"
  $process = Start-Process -FilePath "cmd.exe" -ArgumentList $command -WindowStyle Hidden -Wait -PassThru
  $code = $process.ExitCode
  Write-NightLog -Log $log -Message "plny cyklus: konec rc=$code"
} finally {
  Remove-Item -Path $lock -ErrorAction SilentlyContinue
  Set-Content -Path $done -Value (Get-Date -Format o) -Encoding ascii
}
exit $code
