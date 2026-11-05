---
name: drillev-start
description: Začátek pracovní relace na DrillEV (dřív PKRTrainer) - načte plán dokončení MTT, otevřené body, stav poslední noci a gitu dřív, než se cokoli měří nebo mění. Použij na začátku každé relace a po každém kompaktování kontextu.
---

# Začátek relace

Cíl: za pět minut vědět, kde práce stojí, a nic neodvozovat znovu
(`Agents/AGENTS.md`, pravidlo 6). Stav žije v souborech, ne v hlavě relace.

## Kroky

1. **Prostředí.** Repozitář `C:\Work\DrillEV`. V PowerShellu po instalaci
   chybí git a node v PATH; na začátek každého příkazu:
   `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')`.
   Git Bash je má.
2. **Přečti v tomhle pořadí:**
   - `Agents/plan-dokonceni-mtt-2026-11.md` - cíl, rozhodnutí D1-D7 (přijatá
     majitelem 3. 11. 2026), fáze A-D a kde se stojí;
   - `Agents/AGENTS.md` - pravidla práce (jen změřené, brána, `mtt:known`,
     deník, odpojené dlouhé běhy);
   - posledních pět řádků tabulky v `Agents/MTT_AUTONOMY.md` (deník).
3. **Git:** `git status -sb` a `git log --oneline -5`. Ověřené a nepushnuté
   změny pushni dřív, než začneš nové (D7; ztráta 23.-30. 10. 2026 byl týden
   nepushnutých commitů). Neověřené necommituj.
4. `npm run mtt:agenda` - otevřené body podle toho, na kom visí
   (`-- --volne` jen to, co agent udělá sám).
5. **Noc:** `Agents/daily/tonight.json` (komu noc patří), denní zpráva
   `Agents/daily/<datum>.md`, konce logů `artifacts/decomposition/expansion.log`
   a `artifacts/decomposition/night.log`. Ráno po noci pokračuj skillem
   `drillev-rano`.
6. Před měřením, hledáním na webu nebo novým bodem deníku:
   `npm run mtt:known -- "<téma>"`. Nalezený fakt se cituje, nepřeměřuje.

## Pasti, které už stály čas

- Logy mají CRLF: v Git Bash `tr -d '\r'`, jinak `grep` na konec řádku mine.
- Čítače výkonu jsou na české Windows lokalizované (`Get-Counter` nic nenajde);
  vytížení procesů čti přes WMI `Win32_PerfFormattedData_PerfProc_Process`.
- `console_solver.exe` se z relace nespouští. Solver patří nočním úlohám
  (`drillev-davka`); ruční běh by jim přes den i v noci bral stroj.
- Úlohy noci běží pod účtem SYSTEM. Bez práv správce je běžný účet uvidí až
  po instalaci se zabezpečením čitelným pro uživatele
  (`scripts/scheduled/install-night-tasks.ps1`, od 3. 11. 2026).
- Dlouhý běh (cyklus packů, brána) pouštěj odpojeně a čti log
  (`AGENTS.md` 2b). Zastavuj přes PowerShell `Stop-Process`, ne `taskkill`
  z Git Bash - shell si `/T` přebere jako cestu.
