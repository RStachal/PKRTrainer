# Společný začátek nočních wrapperů: brána okna a umlčení víka.
#
# Načítá se tečkou: `. (Join-Path $PSScriptRoot 'lib-night-window.ps1')`
#
# ## Proč víko znovu a každou noc
#
# Nastavit ho jednou nestačí - **naměřeno 30. 9. 2026**. Instalátor ho ve 20:20
# nastavil na „nedělat nic" a ověřeno bylo 0; stroj ve 16:35 restartoval, po
# restartu byla hodnota zpátky na 2 (hibernace) ve **všech čtyřech schématech**,
# a v 17:05 se zavřelo víko a stroj usnul - událost 42, důvod 0 („Button or
# Lid"). Politika to nedělá (`HKLM\SOFTWARE\Policies\Microsoft\Power`
# neexistuje), takže to přepisuje něco jiného: OEM nebo firemní profil.
#
# Hledat vinníka je zajímavé, ale zbytečné: **hodnota se dá nastavit znovu na
# začátku každé noci** a tím je problém vyřešený bez ohledu na to, kdo ji vrací.
# Když je víko zavřené už předtím, stroj v 21:00 probudí spouštěč (`WakeToRun`)
# a akce víka se vyhodnocuje při **zavření**, ne průběžně - takže po nastavení
# na „nedělat nic" pracuje stroj celou noc se zavřeným víkem.
#
# Na baterii se nesahá: tam má zavřené víko uspat dál.
#
# ## Proč to nesmí nikdy zastavit solve
#
# Kdyby `powercfg` selhal (chybí práva, jiné schéma), noc se **stejně pustí**.
# Zavřené víko je riziko, prázdná noc je ztráta - a hlídač `mtt:night-ready`
# ráno napíše, že hodnota nesedí.

function Write-NightLog {
  param([string]$Log, [string]$Message)
  $line = "[{0:HH:mm:ss}] {1}" -f (Get-Date), $Message
  try { Add-Content -Path $Log -Value $line -Encoding utf8 } catch { }
}

# Zapsat, z čeho stroj doopravdy jede.
#
# ## Proč to tu je
#
# Noc 1.-2. 10. 2026 přišla o 8 hodin 21 minut: v 23:15:51 stroj usnul a vzbudil
# se v 7:36:50. Systémový log uvádí důvod bez obalu - `Důvod spánku: Battery`.
# Notebook nebyl v zásuvce.
#
# A log noci o tom mlčel. Každý tik poslušně hlásil „viko na siti: nedelat nic"
# a „na siti: neuspavat necinnosti" - obě věty jsou pravdivé o tom, co se
# nastavilo (`ACSettingIndex`), a obě se čtou jako záruka, že noc doběhne.
# Přitom když stroj na síti není, platí hodnoty pro baterii a nastavení pro síť
# je bez účinku. Dvě zelené věty tedy stály nad nocí, která spala.
#
# Proto se od 2. 10. 2026 zapisuje zdroj napájení zvlášť a jako první: je to
# jediný řádek, ze kterého se dá poznat, jestli ty dva pod ním něco znamenají.
function Write-PowerSource {
  param([string]$Log)
  try {
    $b = @(Get-CimInstance Win32_Battery -ErrorAction Stop)
    if ($b.Count -eq 0) {
      Write-NightLog -Log $Log -Message "napajeni: sit (stroj bez baterie)"
    } elseif ($b[0].BatteryStatus -eq 2) {
      Write-NightLog -Log $Log -Message "napajeni: sit"
    } else {
      Write-NightLog -Log $Log -Message ("POZOR: napajeni je BATERIE ({0} %); nastaveni pro sit " +
        "neplati a Windows uspi stroj, az baterie dojde. Okno neni jiste - zapoj stroj." -f
        $b[0].EstimatedChargeRemaining)
    }
  } catch {
    Write-NightLog -Log $Log -Message "napajeni: nezjisteno ($($_.Exception.Message))"
  }
}

# ## Víkend (od 15. 10. 2026)
#
# Majitel: „stroj na vývoj a solvení na 100 % můžeš využít v těchto termínech:
# pondělí až pátek 21 - 7, kdykoli o víkendu". Od pátečních 21:00 do pondělní
# sedmé je tedy stroj celý k dispozici - 58 hodin, které noc do té doby
# nevyužívala. Sobotní ráno dostane plný ranní cyklus (`after-night.ps1`: packy
# všech ulic, kontrola, EV), zbytek víkendu solver.
#
# Víkendový režim se zapne **jen tehdy, když ho Plánovač doopravdy má**:
# týdenní spouštěč a strop běhu přes dva dny. Nastavuje je instalátor pod
# správcem; do té doby se všechno chová přesně jako dosud. Čte se z úlohy, ne
# ze značky, aby to nemohlo lhát.

# Strop běhu úlohy jako čas; prázdný nebo `PT0S` znamená bez stropu.
function Get-TaskTimeLimit {
  param([string]$TaskName)
  try {
    $limit = (Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop).Settings.ExecutionTimeLimit
    if ([string]::IsNullOrEmpty($limit) -or $limit -eq "PT0S") { return [TimeSpan]::MaxValue }
    return [System.Xml.XmlConvert]::ToTimeSpan($limit)
  } catch {
    return [TimeSpan]::Zero
  }
}

# Má úloha víkendový rozvrh (týdenní spouštěč a strop aspoň 46 h)?
function Test-WeekendSchedule {
  param([string]$TaskName)
  try {
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
    $weekly = @($task.Triggers | Where-Object { $_.CimClass.CimClassName -eq "MSFT_TaskWeeklyTrigger" })
    return ($weekly.Count -gt 0 -and (Get-TaskTimeLimit -TaskName $TaskName) -ge [TimeSpan]::FromHours(46))
  } catch {
    return $false
  }
}

# Konec okna pro runner, absolutně (`yyyy-MM-ddTHH:mm`), jak ho čte
# `parse_until` v `run_night_decomposition.py`.
#
# Bez víkendového rozvrhu nejbližší 07:00 - přesně jako dosud `--until=07:00`.
# S ním nejbližší 07:00, které nepadne na neděli: sobotní sedmá zůstává koncem,
# protože sobotní ráno patří plnému ranním cyklu, a po něm běží solver v kuse
# až do pondělní sedmé.
function Get-NightDeadline {
  param([bool]$Weekend, [datetime]$Now = (Get-Date))
  $deadline = $Now.Date.AddHours(7)
  if ($deadline -le $Now) { $deadline = $deadline.AddDays(1) }
  if ($Weekend) {
    while ($deadline.DayOfWeek -eq [DayOfWeek]::Sunday) { $deadline = $deadline.AddDays(1) }
  }
  return $deadline.ToString("yyyy-MM-ddTHH:mm", [Globalization.CultureInfo]::InvariantCulture)
}

# Plný ranní cyklus a solver se o stroj nedělí: cyklus si na river bere 16 GB
# haldy a vedle solveru by běžel několikrát déle (8. 10. 2026 naměřeno pět- až
# šestkrát pomalejší fáze, když mu něco konkurovalo). Zámek drží PID wrapperu
# cyklu; mrtvý proces znamená starý zámek, ne běžící cyklus.
function Test-PackCycleRunning {
  param([string]$Repo)
  $lock = Join-Path $Repo "artifacts\pack-cycle.lock"
  if (-not (Test-Path $lock)) { return $false }
  try {
    $owner = [int](Get-Content -Path $lock -TotalCount 1)
    return [bool](Get-Process -Id $owner -ErrorAction SilentlyContinue)
  } catch {
    return $false
  }
}

# Proběhl dnes plný ranní cyklus (ať dopadl jakkoli)?
function Test-PackCycleDoneToday {
  param([string]$Repo, [datetime]$Now = (Get-Date))
  $done = Join-Path $Repo "artifacts\pack-cycle.done"
  if (-not (Test-Path $done)) { return $false }
  return ((Get-Item $done).LastWriteTime.Date -eq $Now.Date)
}

# Brána okna. Runner se sám brání jen oknu delšímu, než dovoluje (`MAX_WINDOW_HOURS`
# u `HH:MM`), což pustí i běh začatý v 19:00. Spouštěč při startu systému může
# padnout kdykoli za dne, a to se má zapsat a skončit, ne solvit.
#
# O víkendu (jen s víkendovým rozvrhem) je okno celý den. V sobotu ale solver
# počká, dokud běží plný ranní cyklus, a do desíti i na to, než se spustí -
# v 07:00 by jinak předběhl cyklus, který startuje v 07:05. Když se do desíti
# nespustil vůbec, solver nečeká dál: prázdná sobota je horší.
function Test-NightWindow {
  param([string]$Log, [bool]$Weekend = $false, [string]$Repo = "", [datetime]$Now = (Get-Date))
  $time = $Now.TimeOfDay
  if ($time -ge [TimeSpan]"20:45:00" -or $time -lt [TimeSpan]"06:45:00") { return $true }
  $isWeekend = $Now.DayOfWeek -eq [DayOfWeek]::Saturday -or $Now.DayOfWeek -eq [DayOfWeek]::Sunday
  if ($Weekend -and $isWeekend) {
    if ($Now.DayOfWeek -eq [DayOfWeek]::Saturday) {
      if (Test-PackCycleRunning -Repo $Repo) {
        Write-NightLog -Log $Log -Message "sobota: bezi plny ranni cyklus, solver pocka"
        return $false
      }
      if (-not (Test-PackCycleDoneToday -Repo $Repo -Now $Now) -and $time -lt [TimeSpan]"10:00:00") {
        Write-NightLog -Log $Log -Message "sobota: plny ranni cyklus jeste neprobehl, solver pocka nejdele do 10:00"
        return $false
      }
    }
    return $true
  }
  Write-NightLog -Log $Log -Message "spusteni mimo okno 20:45-06:45, koncim bez prace"
  return $false
}

# Na síti se nesmí uspat nečinností a časovače probuzení musí zůstat povolené.
#
# Naměřeno 1. 10. 2026: dnes je `STANDBYIDLE AC=0` (nikdy) a `RTCWAKE AC=1`,
# takže na síti stroj sám neusne. **Ale víko se po restartu vrátilo z 0 na 2**,
# takže se na trvalost žádné z těchhle hodnot spoléhat nedá. Nastavují se proto
# znovu při každém startu noci, jako víko.
#
# Na baterii se nesahá: tam má stroj spát (`STANDBYIDLE DC=10800`, tedy 3 h).
function Set-NoIdleSleepOnAc {
  param([string]$Log)
  $SUB_SLEEP = "238c9fa8-0aad-41ed-83f4-97be242c8f20"
  $STANDBYIDLE = "29f6c1db-86da-48c5-9fdb-f2b67b1f44da"
  $RTCWAKE = "bd3b718a-0680-4d9d-8ab2-e1d2b4ac806d"
  try {
    powercfg -setacvalueindex SCHEME_CURRENT $SUB_SLEEP $STANDBYIDLE 0 2>$null
    powercfg -setacvalueindex SCHEME_CURRENT $SUB_SLEEP $RTCWAKE 1 2>$null
    powercfg -setactive SCHEME_CURRENT 2>$null
    $scheme = ((powercfg /getactivescheme) -replace '.*GUID: ([0-9a-f-]+).*', '$1').Trim()
    $base = "HKLM:\SYSTEM\CurrentControlSet\Control\Power\User\PowerSchemes\$scheme\$SUB_SLEEP"
    $idle = (Get-ItemProperty -Path "$base\$STANDBYIDLE" -ErrorAction Stop).ACSettingIndex
    $wake = (Get-ItemProperty -Path "$base\$RTCWAKE" -ErrorAction Stop).ACSettingIndex
    if ($idle -eq 0 -and $wake -eq 1) {
      Write-NightLog -Log $Log -Message "na siti: neuspavat necinnosti, casovace probuzeni povolene (overeno v registru)"
    } else {
      Write-NightLog -Log $Log -Message "POZOR: necinnost=$idle (ma byt 0), casovace=$wake (ma byt 1); stroj muze v noci usnout"
    }
  } catch {
    Write-NightLog -Log $Log -Message "POZOR: usporu se nepodarilo nastavit ($($_.Exception.Message)); solve pokracuje"
  }
}

# Víko na síti na „nedělat nic"; na baterii beze změny.
function Set-LidIgnoredOnAc {
  param([string]$Log)
  $SUB_BUTTONS = "4f971e89-eebd-4455-a8de-9e59040e7347"
  $LIDACTION = "5ca83367-6e45-459f-a27b-476b1d01c936"
  try {
    $before = (powercfg /q SCHEME_CURRENT $SUB_BUTTONS $LIDACTION) 2>$null
    powercfg -setacvalueindex SCHEME_CURRENT $SUB_BUTTONS $LIDACTION 0 2>$null
    powercfg -setactive SCHEME_CURRENT 2>$null
    # Přečíst zpátky z registru: dotaz na schéma tu hodnotu nevypisuje, dokud je
    # schovaná atributem.
    $scheme = ((powercfg /getactivescheme) -replace '.*GUID: ([0-9a-f-]+).*', '$1').Trim()
    $key = "HKLM:\SYSTEM\CurrentControlSet\Control\Power\User\PowerSchemes\$scheme\$SUB_BUTTONS\$LIDACTION"
    $value = (Get-ItemProperty -Path $key -ErrorAction Stop).ACSettingIndex
    if ($value -eq 0) {
      Write-NightLog -Log $Log -Message "viko na siti: nedelat nic (overeno v registru)"
    } else {
      Write-NightLog -Log $Log -Message "POZOR: viko na siti je $value, nepodarilo se nastavit na 0; zavrene viko muze noc ukoncit"
    }
  } catch {
    Write-NightLog -Log $Log -Message "POZOR: viko se nepodarilo nastavit ($($_.Exception.Message)); solve pokracuje"
  }
}
