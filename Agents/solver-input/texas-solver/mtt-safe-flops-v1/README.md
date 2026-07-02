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

The viewer is for checking hand matrices, dominant actions, frequencies and boards. It scans the current staged
TexasSolver output folder by default, so newly reviewed LOW/HIGH SPR families appear after `mtt:texas-solver-review`.
It is not a production import.

To create the first canonical import candidate from the recommended pilot:

```powershell
npm run mtt:texas-solver-normalize-draft -- --write
```

LOW/HIGH SPR candidates can override the rule SPR band:

```powershell
npm run mtt:texas-solver-normalize-draft -- --review .\Agents\solver-input\gto-plus\sample-postflop-v1\output\texas-solver\MTT9_20BB_BTN_BB_SRP_LOWSPR\strategy-export.CHECK.review.json --output-dir .\artifacts\texas-solver-review-integration\normalized-drafts\MTT9_20BB_BTN_BB_SRP_LOWSPR-CHECK --spr-min=0 --spr-max=3 --write
```

Non-default families must also declare their strategy dimensions explicitly:

```powershell
npm run mtt:texas-solver-normalize-draft -- --review .\Agents\solver-input\gto-plus\sample-postflop-v1\output\texas-solver\MTT9_40BB_UTG_BB_SRP\strategy-export.CHECK.review.json --output-dir .\artifacts\texas-solver-review-integration\normalized-drafts\MTT9_40BB_UTG_BB_SRP-CHECK --spr-min=3 --spr-max=8 --pot-type=SINGLE_RAISED --action-node=SINGLE_RAISED_POT_CBET --position-pattern=SRP_UTG_VS_BB --write
npm run mtt:texas-solver-normalize-draft -- --review .\Agents\solver-input\gto-plus\sample-postflop-v1\output\texas-solver\MTT9_35BB_CO_BTN_3BP\strategy-export.CHECK.review.json --output-dir .\artifacts\texas-solver-review-integration\normalized-drafts\MTT9_35BB_CO_BTN_3BP-CHECK --spr-min=0 --spr-max=3 --pot-type=THREE_BET_POT --action-node=THREE_BET_POT_CBET --position-pattern=3BP_BTN_VS_CO --write
```

The default output is:

```text
artifacts/texas-solver-review-integration/normalized-drafts/MTT9_50BB_BTN_BB_SRP-CHECK/
  normalized.candidate.json
  permission.candidate.json
  draft-report.json
```

After at least two SPR candidates exist, merge them into one scoped pilot pack. The default scope is
`BTN_vs_BB_SRP_FLOP_CBET`:

```powershell
npm run mtt:texas-solver-merge-pilot-drafts -- --write --summary
```

The default BTN vs BB SRP merge reads the available LOW/MID/HIGH BTN vs BB SRP drafts and writes:

```text
artifacts/texas-solver-review-integration/normalized-drafts/BTN_BB_SRP_FLOP_CBET_PILOT-CHECK/
  normalized.candidate.json
  permission.candidate.json
  merge-report.json
```

For the BTN vs CO 3bet-pot pilot, use:

```powershell
npm run mtt:texas-solver-merge-pilot-drafts -- --scope=BTN_vs_CO_3BP_FLOP_CBET --write --summary
```

This writes:

```text
artifacts/texas-solver-review-integration/normalized-drafts/BTN_CO_3BP_FLOP_CBET_PILOT-CHECK/
  normalized.candidate.json
  permission.candidate.json
  merge-report.json
```

Default scope merges skip not-yet-available default candidates. For example, while 3BP HIGHSPR is still solving, the
3BP pilot can be a valid LOW+MID scoped training candidate and will automatically expand to LOW/MID/HIGH after the
HIGHSPR normalized draft exists and the refresh/merge workflow is re-run.

Custom inputs are supported:

```powershell
npm run mtt:texas-solver-merge-pilot-drafts -- --input-dir .\artifacts\texas-solver-review-integration\normalized-drafts\MTT9_20BB_BTN_BB_SRP_LOWSPR-CHECK --input-dir .\artifacts\texas-solver-review-integration\normalized-drafts\MTT9_50BB_BTN_BB_SRP-CHECK --output-dir .\artifacts\texas-solver-review-integration\normalized-drafts\BTN_BB_SRP_FLOP_CBET_PILOT-CHECK --write
```

The merged pilot should improve the scoped training evidence, for example LOW/MID/HIGH SPR coverage, while still reporting
`fullProductionReady: false` until the broader FLOP production matrix is actually solved and reviewed.
Draft and merge reports include a deterministic `provenanceFingerprint` SHA-256 hash over the reviewed inputs,
normalized candidate and permission manifest, so poker review can detect silent candidate changes.

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

Audit the generated scenario format before starting a long solve:

```powershell
npm run mtt:texas-solver-scenario-audit -- --summary
npm run mtt:texas-solver-scenario-audit -- --output=artifacts/texas-solver-scenario-audit/report.json
```

The audit checks pot, effective stack, inferred SPR band, board syntax/textures, IP/OOP ranges, flop bet/raise sizing
tree, `build_tree`, `start_solve`, `set_dump_rounds` and `dump_result` consistency against the coverage manifest.

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

PowerShell jobs are session-local. If the original shell is gone, check progress from the filesystem instead:

```powershell
npm run mtt:texas-solver-coverage-status -- --summary
npm run mtt:texas-solver-coverage-status -- --output=artifacts/texas-solver-coverage-v2-status/report.json
```

This status command reads `coverage-v2-manifest.json`, counts solved raw JSON boards per family and prints the exact
stage/review/normalize commands for families that are complete.

To let PKRTrainer pick up completed families automatically from the filesystem:

```powershell
npm run mtt:texas-solver-ingest-completed -- --dry-run --summary
npm run mtt:texas-solver-ingest-completed -- --summary
```

The ingest command processes only `RAW_COMPLETE` families. It stages TexasSolver output, creates `CHECK` review files,
normalizes supported LOW/HIGH SPR BTN vs BB SRP pilot candidates and re-merges available pilot drafts. It does not copy
anything into production `src/data` and it does not promote a full release pack.

## 3BP repair batch

The first CO vs BTN 3bet-pot candidate solved correctly, but the pilot gate rejected it because the normalized strategy
had no `BLUFF` range lane. For a professional trainer this is the right failure mode: do not mark a 3bet c-bet spot as
usable when the input range/tree creates only a narrow value/check candidate.

Generate the review-only repair batch:

```powershell
npm run mtt:texas-solver-3bp-repair-batch -- --write
```

This writes 8 TexasSolver parameter files under:

```text
Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_3bp_repair_v1/
```

and the manifest:

```text
Agents/solver-input/texas-solver/mtt-safe-flops-v1/coverage-3bp-repair-v1-manifest.json
```

The repair scenario keeps the same pilot scope, `BTN_vs_CO_3BP_FLOP_CBET`, but widens the IP 3bet range with suited
connector and suited gapper bluff candidates. It is not production data; it is a controlled test for whether the missing
`BLUFF` lane was caused by a too value-heavy scenario definition.

Run the repair batch from a normal PowerShell window:

```powershell
.\Agents\solver-input\texas-solver\mtt-safe-flops-v1\run-console-selected.ps1 -ParameterRoot ".\Agents\solver-input\texas-solver\mtt-safe-flops-v1\parameters\pkrtrainer_mtt_3bp_repair_v1" -Limit 999
```

Or launch it as an independent hidden process and keep a filesystem log:

```powershell
Start-Process powershell -WindowStyle Hidden -ArgumentList @(
  '-NoProfile',
  '-ExecutionPolicy',
  'Bypass',
  '-Command',
  "Set-Location 'C:\Users\stachal\PKRTrainer\PKRTrainer'; .\Agents\solver-input\texas-solver\mtt-safe-flops-v1\run-console-selected.ps1 -ParameterRoot '.\Agents\solver-input\texas-solver\mtt-safe-flops-v1\parameters\pkrtrainer_mtt_3bp_repair_v1' -Limit 999 *>&1 | Tee-Object -FilePath '.\artifacts\texas-solver-3bp-repair-run\solver-run.log'"
)
```

Monitor and ingest only this repair manifest:

```powershell
npm run mtt:texas-solver-coverage-status -- --manifest .\Agents\solver-input\texas-solver\mtt-safe-flops-v1\coverage-3bp-repair-v1-manifest.json --summary
npm run mtt:texas-solver-pilot-refresh -- --manifest .\Agents\solver-input\texas-solver\mtt-safe-flops-v1\coverage-3bp-repair-v1-manifest.json --summary
npm run mtt:postflop-pilot-suite -- --summary
```

The suite now prefers the merged `BTN_CO_3BP_FLOP_CBET_PILOT-CHECK` pack for the 3BP pilot once it exists, and falls
back to `MTT9_35BB_CO_BTN_3BP_REPAIR-CHECK` only when the merged pack has not been written yet. If the repair candidate
still fails, keep the pilot blocked and adjust the scenario/range/tree instead of weakening the gate.

Current repair outcome:

```text
coverage: 8/8 raw JSON
pilot suite: valid, 3 READY / 0 WAITING / 0 INVALID
3BP repair fingerprint: d8e5dd1a325f4cf8f8d3dd9d9991fee98a812f34f0b9e8c2c3e92aa0b8b3d1aa
3BP repair buckets: 34 total, VALUE/BLUFF/CHECK = 2/8/24
```

The normalizer preserves meaningful mixed betting frequencies for natural low-card bluff candidates: if a hand is not a
pair, does not start with `A/K/Q/J/T`, and has at least 25% combined `BET_SMALL + BET_BIG`, it can be represented as an
active bluff bucket even when `CHECK` is the single largest action. Strong high-card and pair hands remain CHECK buckets
when CHECK dominates. This keeps the pilot gate honest: mixed bluffs are visible, but pure/check-control hands are not
mislabelled just to satisfy a lane requirement.

`validate:range-import` and `build:range-module` are still expected to fail write readiness for this isolated repair
candidate because it is not full flop-production coverage. The green signal for training use is the scoped pilot suite,
not full production promotion.

## 3BP MID/HIGH SPR expansion batch

After the LOW-SPR 3BP repair pilot is green, the next full-coverage gap is higher SPR and paired boards. Generate the
next review-only batch with:

```powershell
npm run mtt:texas-solver-3bp-expansion-batch -- --write
```

This creates:

```text
Agents/solver-input/texas-solver/mtt-safe-flops-v1/coverage-3bp-expansion-v1-manifest.json
Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_3bp_expansion_v1/
```

The batch contains 12 spots:

```text
MTT9_80BB_CO_BTN_3BP_MIDSPR: 6 boards, SPR ~3.82, includes paired 883r
MTT9_150BB_CO_BTN_3BP_HIGHSPR: 6 boards, SPR ~9.55, includes paired QQ7r
```

Preflight before a long run:

```powershell
npm run mtt:texas-solver-scenario-audit -- --manifest .\Agents\solver-input\texas-solver\mtt-safe-flops-v1\coverage-3bp-expansion-v1-manifest.json --summary
npm run mtt:texas-solver-coverage-status -- --manifest .\Agents\solver-input\texas-solver\mtt-safe-flops-v1\coverage-3bp-expansion-v1-manifest.json --summary
```

Expected pre-solve state:

```text
scenario audit: valid true, 12/12 valid files, 0 errors
coverage status: valid true, 0/12 solved, two WAITING_FOR_RAW families
```

Run:

```powershell
.\Agents\solver-input\texas-solver\mtt-safe-flops-v1\run-console-selected.ps1 -ParameterRoot ".\Agents\solver-input\texas-solver\mtt-safe-flops-v1\parameters\pkrtrainer_mtt_3bp_expansion_v1" -Limit 999
```

When complete, ingest only this manifest:

```powershell
npm run mtt:texas-solver-pilot-refresh -- --manifest .\Agents\solver-input\texas-solver\mtt-safe-flops-v1\coverage-3bp-expansion-v1-manifest.json --summary
```

`mtt:texas-solver-pilot-refresh` now also re-runs the scoped merges after ingest. Current expected partial state while
HIGHSPR is still solving:

```text
MTT9_80BB_CO_BTN_3BP_MIDSPR: RAW_COMPLETE (6/6)
MTT9_150BB_CO_BTN_3BP_HIGHSPR: WAITING_FOR_RAW or RAW_PARTIAL
BTN_CO_3BP_FLOP_CBET_PILOT-CHECK: valid LOW+MID scoped pilot, fullProductionReady=false
```

After `MTT9_150BB_CO_BTN_3BP_HIGHSPR` reaches 6/6 raw JSON, run the same refresh command again. The merged 3BP pilot
will then include LOW/MID/HIGH SPR, still as a scoped pilot rather than full FLOP production coverage.

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

Other scoped pilots use an explicit scope:

```powershell
npm run mtt:postflop-pilot-gate -- --scope=UTG_vs_BB_SRP_FLOP_CBET --normalized .\artifacts\texas-solver-review-integration\normalized-drafts\MTT9_40BB_UTG_BB_SRP-CHECK\normalized.candidate.json --permission-manifest .\artifacts\texas-solver-review-integration\normalized-drafts\MTT9_40BB_UTG_BB_SRP-CHECK\permission.candidate.json --summary
npm run mtt:postflop-pilot-gate -- --scope=BTN_vs_CO_3BP_FLOP_CBET --normalized .\artifacts\texas-solver-review-integration\normalized-drafts\BTN_CO_3BP_FLOP_CBET_PILOT-CHECK\normalized.candidate.json --permission-manifest .\artifacts\texas-solver-review-integration\normalized-drafts\BTN_CO_3BP_FLOP_CBET_PILOT-CHECK\permission.candidate.json --summary
```

Run all known scoped pilots at once:

```powershell
npm run mtt:postflop-pilot-suite -- --summary
npm run mtt:postflop-pilot-suite -- --output=artifacts/mtt-postflop-pilot-suite/report.json
```

Missing UTG/3BP candidates are reported as `WAITING`, not as production failures.

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
