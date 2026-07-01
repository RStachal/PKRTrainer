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

## Local review viewer and normalized draft

After `review-compare-integrate.ps1` finishes, build a local HTML viewer for poker review:

```powershell
npm run mtt:texas-solver-viewer
Invoke-Item .\artifacts\texas-solver-review-integration\viewer\index.html
```

The viewer is for checking hand matrices, dominant actions, frequencies and boards. It is not a production import.

To create the first canonical import candidate from the recommended pilot:

```powershell
npm run mtt:texas-solver-normalize-draft -- --write
```

The default output is:

```text
artifacts/texas-solver-review-integration/normalized-drafts/MTT9_50BB_BTN_BB_SRP-CHECK/
  normalized.candidate.json
  permission.candidate.json
  draft-report.json
```

Validate the candidate:

```powershell
npm run validate:range-import -- --kind=flop-production --permission-manifest .\artifacts\texas-solver-review-integration\normalized-drafts\MTT9_50BB_BTN_BB_SRP-CHECK\permission.candidate.json .\artifacts\texas-solver-review-integration\normalized-drafts\MTT9_50BB_BTN_BB_SRP-CHECK\normalized.candidate.json
npm run build:range-module -- --kind=flop-production --dry-run --permission-manifest .\artifacts\texas-solver-review-integration\normalized-drafts\MTT9_50BB_BTN_BB_SRP-CHECK\permission.candidate.json .\artifacts\texas-solver-review-integration\normalized-drafts\MTT9_50BB_BTN_BB_SRP-CHECK\normalized.candidate.json
```

Expected first-draft state: the legal slot and permission manifest are valid, but `productionReady` remains `false`.
One BTN vs BB SRP node does not cover all required positions, 3bet pots, facing-bet nodes, LOW/HIGH SPR and every texture
bucket. Copy candidates into `Agents/range-intake/raw/.../normalized.json` only after human poker review and an explicit
promotion decision for that slot.

## Coverage-v2 background batch

To prepare a wider background solve batch for the current pilot gaps:

```powershell
npm run mtt:texas-solver-coverage-batch -- --write
```

This creates 21 additional TexasSolver parameter files under:

```text
Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_coverage_v2/
```

and a manifest:

```text
Agents/solver-input/texas-solver/mtt-safe-flops-v1/coverage-v2-manifest.json
```

The batch currently covers additional BTN vs BB SRP LOW/HIGH SPR boards, wider UTG vs BB SRP texture samples and wider
CO vs BTN 3bet-pot texture samples. It still does not claim full MTT postflop production coverage; missing full-ring
position families need reviewed range templates before they can be solved honestly.

Preflight:

```powershell
.\Agents\solver-input\texas-solver\mtt-safe-flops-v1\run-console-selected.ps1 -ParameterRoot "C:\Users\stachal\PKRTrainer\PKRTrainer\Agents\solver-input\texas-solver\mtt-safe-flops-v1\parameters\pkrtrainer_mtt_coverage_v2" -Limit 999 -ListOnly
```

Run in a PowerShell background job:

```powershell
Start-Job -Name PKRTrainerTexasSolverCoverageV2 -ScriptBlock {
  Set-Location "C:\Users\stachal\PKRTrainer\PKRTrainer"
  .\Agents\solver-input\texas-solver\mtt-safe-flops-v1\run-console-selected.ps1 -ParameterRoot "C:\Users\stachal\PKRTrainer\PKRTrainer\Agents\solver-input\texas-solver\mtt-safe-flops-v1\parameters\pkrtrainer_mtt_coverage_v2" -Limit 999
}
```

Monitor:

```powershell
Get-Job PKRTrainerTexasSolverCoverageV2
Get-Job PKRTrainerTexasSolverCoverageV2 | Receive-Job -Keep
```

Stop if needed:

```powershell
Stop-Job PKRTrainerTexasSolverCoverageV2
```

After solving, stage/review only the families that now have raw JSON outputs. Example:

```powershell
npm run mtt:stage-texas-solver -- --family=MTT9_20BB_BTN_BB_SRP_LOWSPR --write --review-template
npm run mtt:texas-solver-review -- --family=MTT9_20BB_BTN_BB_SRP_LOWSPR --node-history=CHECK --write --summary
```

## Pilot gate

The narrow BTN vs BB SRP candidate can be checked with:

```powershell
npm run mtt:postflop-pilot-gate -- --summary
```

Expected state for the current pilot:

```text
valid: true
fullProductionReady: false
permissionReady: true
legalImportSlot: true
runtimeSmokeValid: true
```

This gate is intentionally different from `mtt:postflop-release`: it allows a reviewed narrow pilot pack for a specific
training mode, but keeps full production release blocked until the broad coverage gate is green.

`mtt:stage-texas-solver` pouze vytvoří review artefakty pro solver-verification. Nevyrábí produkční `normalized.json`; ten vznikne až po ruční kontrole a mapování strategií do PKRTrainer formátu.
