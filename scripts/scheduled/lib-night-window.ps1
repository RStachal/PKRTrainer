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

# Brána okna. Runner se sám brání jen oknu delšímu než 11 h
# (`MAX_WINDOW_HOURS`), což pustí i běh začatý v 19:00. Spouštěč při startu
# systému může padnout kdykoli za dne, a to se má zapsat a skončit, ne solvit.
function Test-NightWindow {
  param([string]$Log)
  $now = (Get-Date).TimeOfDay
  if ($now -ge [TimeSpan]'20:45:00' -or $now -lt [TimeSpan]'06:45:00') { return $true }
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
