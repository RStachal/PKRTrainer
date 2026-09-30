# Noc musí běžet i bez přihlášeného uživatele, přes zavřené víko a po restartu.
#
# Spouští se jako SPRÁVCE a je **idempotentní**: dá se pustit znovu, kdykoli
# někdo šáhne na Nastavení napájení nebo na Plánovač. Ověřit stav bez správce
# jde přes `npm run mtt:night-ready`.
#
#     powershell -NoProfile -ExecutionPolicy Bypass -File scripts\scheduled\install-night-tasks.ps1
#
# ## Co to mění a proč
#
# 1. **Principal S4U místo InteractiveToken.** Tohle je kořen: dokud úloha
#    potřebuje přihlášeného uživatele, nepomůže ani spouštěč při startu, ani
#    opakování, ani WakeToRun. Po restartu ve 23:30 by stroj stál až do rána,
#    protože u přihlašovací obrazovky nikdo nesedí. Že ten mechanismus na tomhle
#    stroji doopravdy nastává, je doložené: žurnál Plánovače má devět událostí
#    332 „nespustila úlohu, protože uživatel nebyl přihlášen".
#
# 2. **Opakovaný spouštěč každých 30 minut uvnitř okna** (21:00 + 9 h 30 min).
#    Tohle jediné řeší restart **i pád runneru**. `MultipleInstancesPolicy`
#    zůstává `IgnoreNew`, takže dokud instance žije, tik se zahodí; po restartu
#    žádná nežije a další tik noc znovu nastartuje, nejpozději za 30 minut.
#
# 3. **Spouštěč při startu systému** s odkladem 2 minuty (u expanze 3), aby se
#    po restartu nečekalo na nejbližší tik. Denní starty odchytí časová brána
#    ve wrapperech (`night-decomposition.ps1`), ne tenhle skript.
#
# 4. **Akce víka na síti „nedělat nic", na baterii beze změny.** Naměřeno
#    29. 9. 2026: víko je zdaleka nejčastější důvod uspání - 11 ze 13 přechodů
#    do spánku za 14 dní - a **žádný softwarový zámek to nepřebije**; deník 158
#    to má doložené 72minutovým stáním z 8. na 9. 9., kdy runner držel
#    `PowerSetRequest` a stroj přesto usnul na „Button or Lid". Hodnota byla
#    na síti i na baterii `2` (hibernace). Na baterii **zůstává**: zavřít víko
#    na baterii má pořád uspat, jinak se notebook v tašce uvaří.
#
# 5. **WakeToRun na všechny tři.** Dosud ho měl jen rozklad.
#
# Co se záměrně **nemění**: rychlé spuštění (`HiberbootEnabled`). Vlastníkem
# popsaný případ je restart, a ten je vždycky plný boot - rychlé spuštění ho
# neovlivní. Vypínat ho by byl zásah navíc bez užitku pro zadání.

$ErrorActionPreference = "Stop"

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$isAdmin = (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Host "Tenhle skript potrebuje spravce (uprava Planovace a napajeni)." -ForegroundColor Red
  Write-Host "Spust PowerShell jako spravce a pusti ho znovu."
  exit 1
}

$account = "$env:USERDOMAIN\$env:USERNAME"
Write-Host "Ucet pro ulohy: $account"

# ---- 1-3, 5: Planovac ------------------------------------------------------

$nightTasks = @(
  @{ Name = "PKRTrainer-Night-Decomposition"; At = "21:00"; BootDelay = "PT2M" },
  @{ Name = "PKRTrainer-Night-Expansion";     At = "21:01"; BootDelay = "PT3M" }
)

foreach ($spec in $nightTasks) {
  $name = $spec.Name
  Write-Host "`n== $name"

  # Denní spouštěč s opakováním. Repetition se v PowerShellu nedá nastavit
  # přímo, bere se z pomocného jednorázového spouštěče - jiná cesta than tahle
  # neexistuje, dokud se nepíše XML ručně.
  $daily = New-ScheduledTaskTrigger -Daily -At $spec.At
  $helper = New-ScheduledTaskTrigger -Once -At $spec.At `
    -RepetitionInterval (New-TimeSpan -Minutes 30) `
    -RepetitionDuration (New-TimeSpan -Hours 9 -Minutes 30)
  $daily.Repetition = $helper.Repetition

  $boot = New-ScheduledTaskTrigger -AtStartup
  $boot.Delay = $spec.BootDelay

  # Nejvyšší práva **jen u nočních úloh**, a jen kvůli jedné věci: wrapper si
  # musí každou noc sám nastavit akci víka (`powercfg -setacvalueindex`), protože
  # nastavit ji jednou nedrží - naměřeno 30. 9. 2026, po restartu ve 16:35 byla
  # zpátky na hibernaci ve všech čtyřech schématech a v 17:05 stroj po zavření
  # víka usnul. Ranní úloha zůstává na `Limited`: powercfg nepotřebuje.
  $principal = New-ScheduledTaskPrincipal -UserId $account -LogonType S4U -RunLevel Highest

  $settings = (Get-ScheduledTask -TaskName $name).Settings
  $settings.WakeToRun = $true
  $settings.StartWhenAvailable = $true
  $settings.MultipleInstances = "IgnoreNew"
  $settings.DisallowStartIfOnBatteries = $false
  $settings.StopIfGoingOnBatteries = $false
  # Úloha nesmí skončit jen proto, že si stroj myslí, že přestal zahálet.
  $settings.IdleSettings.StopOnIdleEnd = $false

  Set-ScheduledTask -TaskName $name -Trigger @($daily, $boot) -Principal $principal -Settings $settings | Out-Null
  Write-Host "  principal S4U, denni 30min opakovani 9h30m, boot +$($spec.BootDelay), WakeToRun"
}

# Ranní obnova: S4U a WakeToRun ano, boot spouštěč ne - ta má běžet po noci,
# ne po každém startu stroje.
$after = "PKRTrainer-After-Night-TurnEv"
Write-Host "`n== $after"
$principal = New-ScheduledTaskPrincipal -UserId $account -LogonType S4U -RunLevel Limited
$settings = (Get-ScheduledTask -TaskName $after).Settings
$settings.WakeToRun = $true
$settings.StartWhenAvailable = $true
$settings.IdleSettings.StopOnIdleEnd = $false
Set-ScheduledTask -TaskName $after -Principal $principal -Settings $settings | Out-Null
Write-Host "  principal S4U, WakeToRun, bez boot spoustece"

# ---- 4: víko ---------------------------------------------------------------

# Nastavení je schované atributem (`Attributes=1`), takže ho `powercfg /q`
# nevypíše, dokud se neodkryje. Bez odkrytí se dá hodnota přečíst jen z registru.
$SUB_BUTTONS = "4f971e89-eebd-4455-a8de-9e59040e7347"
$LIDACTION = "5ca83367-6e45-459f-a27b-476b1d01c936"

Write-Host "`n== vika"
powercfg -attributes $SUB_BUTTONS $LIDACTION -ATTRIB_HIDE
powercfg -setacvalueindex SCHEME_CURRENT $SUB_BUTTONS $LIDACTION 0
powercfg -setdcvalueindex SCHEME_CURRENT $SUB_BUTTONS $LIDACTION 2
powercfg -setactive SCHEME_CURRENT
Write-Host "  na siti: nedelat nic (0); na baterii: hibernace (2, beze zmeny)"

# Časovače probuzení na síti - bez nich nemá WakeToRun co probudit.
$SUB_SLEEP = "238c9fa8-0aad-41ed-83f4-97be242c8f20"
$RTCWAKE = "bd3b718a-0680-4d9d-8ab2-e1d2b4ac806d"
powercfg -setacvalueindex SCHEME_CURRENT $SUB_SLEEP $RTCWAKE 1
powercfg -setactive SCHEME_CURRENT
Write-Host "  casovace probuzeni na siti: povoleny"

Write-Host "`nHotovo. Overit se to da bez spravce: npm run mtt:night-ready"
