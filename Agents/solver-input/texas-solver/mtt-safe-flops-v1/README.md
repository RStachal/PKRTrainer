# TexasSolver MTT safe flops v1

Účel: první bezpečný balíček flopů pro ověření TexasSolver workflow a následný export strategií pro PKRTrainer.

Toto není finální produkční solve. Je to malý smoke/verification set, aby šlo ověřit:

1. že TexasSolver načte parameter files,
2. že postaví strom,
3. že doběhne solve,
4. že exportuje JSON,
5. že výstup půjde převést do PKRTrainer solver-verification pipeline.

## Family

Balíček pokrývá celý aktuální TexasSolver verification set:

- `MTT9_50BB_BTN_BB_SRP`
- `MTT9_40BB_UTG_BB_SRP`
- `MTT9_35BB_CO_BTN_3BP`

Původní BTN-BB soubory zůstávají jako rychlý smoke pack. Nové verification-only soubory pro UTG-BB a CO-BTN používají pot/stack škálované z existujících `.spot.json` zadání, aby SPR lépe odpovídalo připraveným spotům.

Společné nastavení:

- model: testovací chipEV postflop sanity-check,
- sizing: jednoduché `25%`/`50%` c-bety podle spotu, raise/all-in povolený,
- solver: `200` iterací, `0.5%` exploitability target, `8` threadů.

## Flop set

| ID | Board | Typ |
| --- | --- | --- |
| `A72r` | `As,7d,2c` | dry A-high rainbow |
| `Q72r` | `Qs,7d,2c` | dry Q-high rainbow |
| `K83r` | `Ks,8h,3d` | dry K-high rainbow |
| `K83r-3BP` | `Ks,8d,3c` | dry K-high rainbow, 3bet pot verification |
| `QJ2tt` | `Qs,Jh,2h` | broadway two-tone |
| `JT9tt` | `Jd,Ts,9d` | connected broadway two-tone |
| `883r` | `8s,8d,3c` | paired dry |
| `765tt` | `7h,6h,5s` | low connected two-tone |
| `AT4mono` | `Ah,Th,4h` | A-high monotone |
| `Q76mono` | `Qc,7c,6c` | medium monotone |

## GUI import

1. V TexasSolver klikni `Open Parameters Folder`.
2. Do otevřené složky zkopíruj celý adresář:

```text
pkrtrainer_mtt_safe_flops_v1
```

3. Zavři a znovu otevři TexasSolver, nebo v pravém panelu rozbal nově zkopírovanou složku.
4. Vyber jeden `.txt` parameter file, například:

```text
01_MTT9_50BB_BTN_BB_SRP_A72r.txt
```

5. Klikni/loadni parametr, potom:
   - `Build Tree`,
   - `Start solving`,
   - po doběhu exportuj/show result podle GUI.

GUI je vhodné spíš na ruční kontrolu jednoho spotu. Pro zpracování celé složky použij console runner níže.

## Console run

Nejrychlejší test jednoho spotu:

```powershell
cd C:\Users\stachal\Downloads\TexasSolver-v0.2.0-Windows\TexasSolver-v0.2.0-Windows
.\console_solver.exe -i C:\Users\stachal\PKRTrainer\PKRTrainer\Agents\solver-input\texas-solver\mtt-safe-flops-v1\parameters\pkrtrainer_mtt_safe_flops_v1\01_MTT9_50BB_BTN_BB_SRP_A72r.txt
```

Výstup JSON se vytvoří v aktuální pracovní složce TexasSolveru podle `dump_result` řádku.

Poznámka: full range spot s těmito parametry může běžet několik minut na jeden flop. První test proto pouštěj jen na 1 flop; až potom zvedni počet.

Připravený runner s limitem:

```powershell
.\Agents\solver-input\texas-solver\mtt-safe-flops-v1\run-console-selected.ps1 -Limit 1
```

Nejdřív si můžeš jen vypsat, co by se spustilo:

```powershell
.\Agents\solver-input\texas-solver\mtt-safe-flops-v1\run-console-selected.ps1 -Limit 10 -ListOnly
```

Po ověření spusť více flopů:

```powershell
.\Agents\solver-input\texas-solver\mtt-safe-flops-v1\run-console-selected.ps1 -Limit 2
.\Agents\solver-input\texas-solver\mtt-safe-flops-v1\run-console-selected.ps1 -Limit 10
```

Můžeš spustit i jen jednu family:

```powershell
.\Agents\solver-input\texas-solver\mtt-safe-flops-v1\run-console-selected.ps1 -Family MTT9_40BB_UTG_BB_SRP -Limit 1
.\Agents\solver-input\texas-solver\mtt-safe-flops-v1\run-console-selected.ps1 -Family MTT9_35BB_CO_BTN_3BP -Limit 1
```

Runner spouští soubory sekvenčně přes `console_solver.exe`, odvodí family z názvu parameter file a přesouvá JSON výstupy do:

```text
Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver/<family>/raw
```

Pokud výstup už existuje, přeskočí ho. Přepočet vynutíš:

```powershell
.\Agents\solver-input\texas-solver\mtt-safe-flops-v1\run-console-selected.ps1 -Limit 10 -Force
```

## Nightly orchestration

Bezpečný preflight/list-only režim:

```powershell
.\Agents\solver-input\texas-solver\mtt-safe-flops-v1\run-nightly-verification.ps1
```

Skutečný noční solve + staging všech family:

```powershell
.\Agents\solver-input\texas-solver\mtt-safe-flops-v1\run-nightly-verification.ps1 -RunSolve -ReviewTemplate
```

Stage už existujících raw JSON exportů bez nového solvingu:

```powershell
.\Agents\solver-input\texas-solver\mtt-safe-flops-v1\run-nightly-verification.ps1 -StageExisting -ReviewTemplate
```

## Po doběhu

Zkontroluj a zaveď raw exporty do review pipeline:

```powershell
npm run mtt:stage-texas-solver -- --summary
npm run mtt:stage-texas-solver -- --write
npm run mtt:stage-texas-solver -- --write --review-template
```

Pro PKRTrainer solver-verification čekáme pro každou family:

```text
Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver/<family>/
  strategy-export.json
  accuracy-report.json
  review-notes.md
```

## Review, compare and integration handoff

After raw TexasSolver exports exist, run the integration handoff script from the repository root:

```powershell
.\Agents\solver-input\texas-solver\mtt-safe-flops-v1\review-compare-integrate.ps1
```

Fast mode without production build:

```powershell
.\Agents\solver-input\texas-solver\mtt-safe-flops-v1\review-compare-integrate.ps1 -SkipBuild
```

Useful options:

- `-NoWriteReview` keeps the local solver workspace unchanged and writes only `artifacts/` reports.
- `-RunFullTest` also runs the full Vitest suite.
- `-OpenReport` opens the generated Markdown report.
- `-MaxConsoleOutputLines 30` keeps PowerShell output compact.

The script verifies the TexasSolver parameter pack, stages all solver families, extracts root and `CHECK` node review
summaries, compares them against the current PKRTrainer MTT postflop production gate, lists legal full-ring FLOP import
slots and writes:

```text
artifacts/texas-solver-review-integration/TEXAS_SOLVER_INTEGRATION_REPORT.md
artifacts/texas-solver-review-integration/texas-solver-integration-report.json
artifacts/texas-solver-review-integration/command-log.json
```

It intentionally does not create production `normalized.json` or `permission.json`. The output is a reviewed integration
handoff: it tells us which TexasSolver node is the best first pilot and which canonical range-intake files must be
created after human poker review.

`mtt:stage-texas-solver` pouze vytvoří review artefakty pro solver-verification. Nevyrábí produkční `normalized.json`; ten vznikne až po ruční kontrole a mapování strategií do PKRTrainer formátu.
