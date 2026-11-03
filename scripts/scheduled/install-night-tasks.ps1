# Noc musí běžet i bez přihlášeného uživatele, přes zavřené víko a po restartu -
# a sama se chytit, když se víko otevře nebo se někdo přihlásí.
#
# Spouští se jako SPRÁVCE a je **idempotentní**: úlohy se pokaždé zaregistrují
# znovu celé, takže se dá pustit kdykoli, kdy někdo šáhne na Nastavení napájení
# nebo na Plánovač. Ověřit stav bez správce jde přes `npm run mtt:night-ready`.
#
#     powershell -NoProfile -ExecutionPolicy Bypass -File scripts\scheduled\install-night-tasks.ps1 [-StartNow] [-Transcript <log>]
#
# ## Proč úlohy zakládá, a ne jen upravuje (od 2. 11. 2026)
#
# Do 30. 10. 2026 tenhle skript úlohy jen upravoval (`Set-ScheduledTask`) a
# zakládalo je něco jiného. Starý stroj se ztratil a na novém žádné úlohy nejsou,
# takže úprava neexistující úlohy spadne hned na prvním řádku. Úloha je proto
# celá popsaná tady, v XML: jen XML umí všechny spouštěče naráz (událost,
# odemčení, přihlášení) - `New-ScheduledTaskTrigger` událost nezná.
#
# ## Co úloha má a proč
#
# 1. **Účet SYSTEM.** Úloha nesmí potřebovat přihlášeného uživatele: po
#    restartu ve 23:30 by jinak stroj stál do rána (žurnál Plánovače měl na
#    starém stroji devět událostí 332 „nespustila úlohu, protože uživatel nebyl
#    přihlášen"). Do 23. 10. to řešil principal S4U; ztracená verze z 30. 10.
#    přešla na SYSTEM (`artifacts/install-night-tasks.log`) - proč, se ztratilo
#    s deníkem. Drží se to: SYSTEM nepotřebuje heslo ani přihlášení a na
#    `powercfg`, který wrapper volá každou noc, má práva.
# 2. **Okno majitele (2. 11. 2026): po-pá 20:00-07:00, víkend celý.** Všední
#    spouštěč ve 20:00 s opakováním po 30 min na 11 h, sobotní od 00:00 na 55 h,
#    tedy do pondělní sedmé. Opakování řeší restart i pád runneru:
#    `MultipleInstancesPolicy = IgnoreNew` tik zahodí, dokud instance žije.
#    Kdy se smí solvit, rozhoduje brána ve wrapperech (`Test-NightWindow`).
# 3. **Sama se chytí.** Spouštěč při startu systému, při přihlášení, při
#    odemčení relace a při probuzení. Tenhle stroj má jen Modern Standby (S0 Low
#    Power Idle, `powercfg /a`), takže probuzení není klasický resume: otevření
#    víka zapíše `Kernel-Power 507` („Systém opouští moderní úsporný režim"),
#    naměřeno 2. 11. 2026 v System logu. Návrat z hibernace hlásí
#    `Power-Troubleshooter 1`. Spuštění mimo okno wrapper zapíše a skončí.
# 4. **Priorita 4 (normální), ne výchozí 7.** Plánovač pouští úlohy pod
#    normálem a podřízený proces třídu `BelowNormal` dědí, takže by solver běžel
#    i s nižší prioritou I/O a paměti. A Windows ho nemá šetřit:
#    `powercfg /powerthrottling disable` pro solver i Python.
# 5. **Víko: na síti nedělat nic, na baterii hibernace.** Víko je nejčastější
#    důvod uspání (29. 9. 2026: 11 ze 13 přechodů do spánku za 14 dní). Na
#    baterii zůstává hibernace: v Modern Standby by proces, který drží
#    `PowerRequestExecutionRequired`, běžel dál i se zavřeným víkem, a notebook
#    v tašce by se uvařil. Na novém stroji bylo 2. 11. 2026 na baterii 0.
# 6. **WakeToRun a časovače probuzení na síti** - bez nich nemá WakeToRun co
#    probudit.
# 7. **`safe.directory` pro všechny účty.** Porada (`mtt:daily`) volá git, a git
#    pod SYSTEM odmítne repozitář, který patří vlastníkovi
#    (`night-selftest.json` z 30. 10.: „git cte repozitar (safe.directory)").
# 8. **Úlohu vidí i vlastník bez správce.** Úloha pod SYSTEM založená správcem
#    je běžnému účtu neviditelná: `npm run mtt:night-ready` hlásil 2. 11. 2026
#    obě noční úlohy jako „nenalezena", zatímco obě běžely. Popisovač dává
#    přihlášeným uživatelům (AU) jen čtení (FR), spouštět ani měnit je nemohou.
#
# 9. **Sobotní plný cyklus packů v 07:00** (`PKRTrainer-After-Night-TurnEv`,
#    rozhodnutí majitele D2 z 3. 11. 2026). Úloha pouští `after-night.ps1`, a ten
#    v sobotu s víkendovým rozvrhem a stropem úlohy aspoň 8 h pustí plný cyklus
#    (`pack-cycle.ps1`). Páteční noc tím končí v sobotu v 07:00 a solver počká,
#    než cyklus doběhne (`Get-NightDeadline`, `Test-NightWindow`). Zakládá se až
#    od 3. 11.: do té doby by cyklus po ztrátě checkpointů přepsal tabulku sázek
#    a vypustil pravidla z desek, které obnovený rozklad nemá (deník 328, 331).
#    `StartWhenAvailable` je vypnuté: zmeškaný cyklus by jinak naskočil
#    odpoledne vedle běžícího solveru a obě práce by běžely několikrát déle.
#    Všední lehký cyklus se zatím nezakládá - noční okno je do sedmé a lehký
#    cyklus s ranní bránou by ho zkrátil; pouští se ručně (`drillev-rano`).
#
# Co se záměrně **nemění**: rychlé spuštění (`HiberbootEnabled`). Případ, kvůli
# kterému tu jsou spouštěče, je restart, a ten je vždycky plný boot.
param(
  [switch]$StartNow,
  [string]$Transcript = ""
)

$ErrorActionPreference = "Stop"
if ($Transcript) { Start-Transcript -Path $Transcript -Force | Out-Null }

try {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $isAdmin = (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $isAdmin) {
    Write-Host "Tenhle skript potrebuje spravce (Planovac pod SYSTEM a napajeni)." -ForegroundColor Red
    Write-Host "Spust PowerShell jako spravce a pusti ho znovu."
    exit 1
  }

  . (Join-Path $PSScriptRoot "lib-night-window.ps1")
  $repo = Get-NightRepo
  $python = Get-NightPython
  $solverRoot = if ($env:PKRTRAINER_TEXAS_SOLVER_ROOT) { $env:PKRTRAINER_TEXAS_SOLVER_ROOT } else {
    "C:\Users\stachal\PKRTrainer\tools\TexasSolver-v0.2.0-Windows\TexasSolver-v0.2.0-Windows"
  }
  $solver = Join-Path $solverRoot "console_solver.exe"
  Write-Host "Repozitar: $repo"
  Write-Host "Python:    $python"
  Write-Host "Solver:    $solver"
  if (-not $python) { throw "python nenalezen - bez nej noc nepobezi" }
  if (-not (Test-Path $solver)) { throw "solver nenalezen: $solver" }

  # ---- 1-4, 6: Planovac ----------------------------------------------------

  # Spouštěče v **místním čase bez zóny**: čas se zónou bere Plánovač jako UTC,
  # takže by po přechodu na zimní čas noc začínala o hodinu jinak.
  $today = (Get-Date).ToString("yyyy-MM-dd")
  $esc = [System.Security.SecurityElement]
  $wakeQuery = $esc::Escape("<QueryList><Query Id=`"0`" Path=`"System`"><Select Path=`"System`">*[System[Provider[@Name='Microsoft-Windows-Kernel-Power'] and EventID=507]]</Select></Query></QueryList>")
  $resumeQuery = $esc::Escape("<QueryList><Query Id=`"0`" Path=`"System`"><Select Path=`"System`">*[System[Provider[@Name='Microsoft-Windows-Power-Troubleshooter'] and EventID=1]]</Select></Query></QueryList>")

  # Kdo smí úlohu vidět (bod 8). Popisovač v XML ale Plánovač použije jen při
  # **založení** úlohy: 3. 11. 2026 zůstaly přeinstalované noční úlohy běžnému
  # účtu neviditelné, zatímco nově založená ranní vidět byla. Nastavuje se proto
  # po registraci ještě výslovně (`SetSecurityDescriptor`), při každé instalaci.
  $taskSddl = "D:(A;;FA;;;BA)(A;;FA;;;SY)(A;;FR;;;AU)"
  $scheduler = New-Object -ComObject Schedule.Service
  $scheduler.Connect()
  $taskFolder = $scheduler.GetFolder("\")

  $nightTasks = @(
    @{ Name = "PKRTrainer-Night-Decomposition"; Script = "night-decomposition.ps1"; WeekdayAt = "20:00"; WeekendAt = "00:00"; BootDelay = "PT2M"
       Description = "DrillEV: nocni rozklad (porada mtt:daily, turn/river vrstvy). Okno po-pa 20-07, vikend cely." },
    @{ Name = "PKRTrainer-Night-Expansion"; Script = "night-expansion.ps1"; WeekdayAt = "20:01"; WeekendAt = "00:01"; BootDelay = "PT3M"
       Description = "DrillEV: nocni expanze (monoliticke solvy z fronty parametru). Okno po-pa 20-07, vikend cely." }
  )

  foreach ($spec in $nightTasks) {
    $name = $spec.Name
    $script = Join-Path $PSScriptRoot $spec.Script
    Write-Host "`n== $name"
    $xml = @"
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Author>DrillEV</Author>
    <Description>$($esc::Escape($spec.Description))</Description>
    <SecurityDescriptor>D:(A;;FA;;;BA)(A;;FA;;;SY)(A;;FR;;;AU)</SecurityDescriptor>
  </RegistrationInfo>
  <Triggers>
    <CalendarTrigger>
      <Repetition>
        <Interval>PT30M</Interval>
        <Duration>PT11H</Duration>
        <StopAtDurationEnd>false</StopAtDurationEnd>
      </Repetition>
      <StartBoundary>$($today)T$($spec.WeekdayAt):00</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByWeek>
        <DaysOfWeek><Monday /><Tuesday /><Wednesday /><Thursday /><Friday /></DaysOfWeek>
        <WeeksInterval>1</WeeksInterval>
      </ScheduleByWeek>
    </CalendarTrigger>
    <CalendarTrigger>
      <Repetition>
        <Interval>PT30M</Interval>
        <Duration>P2DT7H</Duration>
        <StopAtDurationEnd>false</StopAtDurationEnd>
      </Repetition>
      <StartBoundary>$($today)T$($spec.WeekendAt):00</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByWeek>
        <DaysOfWeek><Saturday /></DaysOfWeek>
        <WeeksInterval>1</WeeksInterval>
      </ScheduleByWeek>
    </CalendarTrigger>
    <BootTrigger>
      <Enabled>true</Enabled>
      <Delay>$($spec.BootDelay)</Delay>
    </BootTrigger>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <Delay>PT2M</Delay>
    </LogonTrigger>
    <SessionStateChangeTrigger>
      <Enabled>true</Enabled>
      <Delay>PT1M</Delay>
      <StateChange>SessionUnlock</StateChange>
    </SessionStateChangeTrigger>
    <EventTrigger>
      <Enabled>true</Enabled>
      <Subscription>$wakeQuery</Subscription>
      <Delay>PT1M</Delay>
    </EventTrigger>
    <EventTrigger>
      <Enabled>true</Enabled>
      <Subscription>$resumeQuery</Subscription>
      <Delay>PT1M</Delay>
    </EventTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>S-1-5-18</UserId>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>true</WakeToRun>
    <ExecutionTimeLimit>PT60H</ExecutionTimeLimit>
    <Priority>4</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>powershell.exe</Command>
      <Arguments>-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$script"</Arguments>
      <WorkingDirectory>$repo</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
"@
    Register-ScheduledTask -TaskName $name -Xml $xml -Force | Out-Null
    $taskFolder.GetTask($name).SetSecurityDescriptor($taskSddl, 0)
    $task = Get-ScheduledTask -TaskName $name
    $kinds = ($task.Triggers | ForEach-Object { $_.CimClass.CimClassName -replace '^MSFT_Task', '' -replace 'Trigger$', '' }) -join ", "
    Write-Host ("  SYSTEM, priorita {0}, strop {1}, WakeToRun {2}" -f $task.Settings.Priority, $task.Settings.ExecutionTimeLimit, $task.Settings.WakeToRun)
    Write-Host "  spoustece: $kinds"
    Write-Host "  vsedni $($spec.WeekdayAt) +30min x 11h, sobota $($spec.WeekendAt) +30min x 55h, boot +$($spec.BootDelay), prihlaseni, odemceni, viko (507), hibernace (1)"
  }

  # ---- 9: sobotní plný cyklus packů -------------------------------------------

  $morning = "PKRTrainer-After-Night-TurnEv"
  $afterNight = Join-Path $PSScriptRoot "after-night.ps1"
  Write-Host "`n== $morning"
  $xml = @"
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Author>DrillEV</Author>
    <Description>$($esc::Escape("DrillEV: sobotni plny cyklus packu v 07:00 (D2). Solver na nej ceka; necommituje se."))</Description>
    <SecurityDescriptor>D:(A;;FA;;;BA)(A;;FA;;;SY)(A;;FR;;;AU)</SecurityDescriptor>
  </RegistrationInfo>
  <Triggers>
    <CalendarTrigger>
      <StartBoundary>$($today)T07:00:00</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByWeek>
        <DaysOfWeek><Saturday /></DaysOfWeek>
        <WeeksInterval>1</WeeksInterval>
      </ScheduleByWeek>
    </CalendarTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>S-1-5-18</UserId>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>false</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>true</WakeToRun>
    <ExecutionTimeLimit>PT12H</ExecutionTimeLimit>
    <Priority>4</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>powershell.exe</Command>
      <Arguments>-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$afterNight"</Arguments>
      <WorkingDirectory>$repo</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
"@
  Register-ScheduledTask -TaskName $morning -Xml $xml -Force | Out-Null
  $taskFolder.GetTask($morning).SetSecurityDescriptor($taskSddl, 0)
  $task = Get-ScheduledTask -TaskName $morning
  Write-Host ("  SYSTEM, priorita {0}, strop {1}, WakeToRun {2}, zmeskany start: ne" -f $task.Settings.Priority, $task.Settings.ExecutionTimeLimit, $task.Settings.WakeToRun)
  Write-Host "  sobota 07:00: after-night.ps1 -> plny cyklus (pack-cycle.ps1); pateci noc konci v sobotu v 07:00"

  # ---- 4: Windows solver nesetri ---------------------------------------------

  Write-Host "`n== omezovani vykonu"
  foreach ($exe in @($solver, $python)) {
    powercfg /powerthrottling disable /path "$exe" | Out-Null
    Write-Host "  powerthrottling vypnut: $exe"
  }

  # ---- 5, 6: víko a probuzení ------------------------------------------------

  # Nastavení je schované atributem (`Attributes=1`), takže ho `powercfg /q`
  # nevypíše, dokud se neodkryje. Bez odkrytí se dá hodnota přečíst jen z registru.
  $SUB_BUTTONS = "4f971e89-eebd-4455-a8de-9e59040e7347"
  $LIDACTION = "5ca83367-6e45-459f-a27b-476b1d01c936"
  $SUB_SLEEP = "238c9fa8-0aad-41ed-83f4-97be242c8f20"
  $RTCWAKE = "bd3b718a-0680-4d9d-8ab2-e1d2b4ac806d"

  Write-Host "`n== viko a probuzeni"
  powercfg -attributes $SUB_BUTTONS $LIDACTION -ATTRIB_HIDE
  powercfg -setacvalueindex SCHEME_CURRENT $SUB_BUTTONS $LIDACTION 0
  powercfg -setdcvalueindex SCHEME_CURRENT $SUB_BUTTONS $LIDACTION 2
  powercfg -setacvalueindex SCHEME_CURRENT $SUB_SLEEP $RTCWAKE 1
  powercfg -setactive SCHEME_CURRENT
  Write-Host "  viko na siti: nedelat nic (0); na baterii: hibernace (2)"
  Write-Host "  casovace probuzeni na siti: povoleny"

  # ---- 7: git pod SYSTEM ---------------------------------------------------

  Write-Host "`n== git safe.directory"
  $gitRepo = $repo -replace '\\', '/'
  $known = @(& git config --system --get-all safe.directory 2>$null)
  if ($known -contains $gitRepo) {
    Write-Host "  uz nastaveno: $gitRepo"
  } else {
    & git config --system --add safe.directory $gitRepo
    Write-Host "  pridano: $gitRepo"
  }

  if ($StartNow) {
    Write-Host "`n== start"
    foreach ($spec in $nightTasks) {
      Start-ScheduledTask -TaskName $spec.Name
      Write-Host "  spusteno: $($spec.Name)"
    }
  }

  Write-Host "`nHotovo. Overit se to da bez spravce: npm run mtt:night-ready"
} finally {
  if ($Transcript) { Stop-Transcript | Out-Null }
}
