# MTT Production Coverage Audit

Updated: 2026-07-10

Active release priority and scope decisions live in
`Agents/mtt-completion-priorities.md`. This audit continues to track the wider
64-row Full MTT NLHE library as well as the current core release.

## Current production surface

- Game: MTT
- Formats tracked: FULL_RING_9 and SIX_MAX
- Blind speeds tracked: REGULAR and TURBO
- EV models tracked: CHIP_EV and DOLAR_EV
- Streets tracked: PREFLOP, FLOP, TURN and RIVER
- Ante states tracked: ON and OFF
- Current production-ready profiles: four full-ring CHIP_EV preflop profiles.
- Current production baseline:
  - 4 canonical production RangePacks: regular/turbo x ante ON/OFF
  - 4 source-free production permission manifests
  - 2 historical FULL_RING_9 / REGULAR / CHIP_EV packs remain available as preview-only data
  - 4 SIX_MAX CHIP_EV packs remain candidate-only with empty records
  - source citations are not shown in app UI

## Completion matrix

`npm run mtt:completion -- --summary` currently fails the production completion gate and reports:

- total MTT rows: 64
- production-ready rows: 4
- candidate/preview rows: 52
- blocked/missing rows: 8

Use `npm run mtt:completion -- --preview --json` for operator tooling that needs the full matrix while production data
is still missing. Coverage is intentionally broader than the current production data. The matrix includes 6-max and
9-max, regular and turbo, CHIP_EV and DOLAR_EV, preflop and postflop streets, and both ante states. Rows without legal
production data remain candidate or missing.

## Range intake state

`npm run range:intake` currently tracks 60 remaining import rows that are waiting for both files:

- `normalized.json`
- `permission.json`

Useful filters:

- `npm run range:intake -- --kind=preflop`
- `npm run range:intake -- --kind=postflop --format=SIX_MAX --street=RIVER`
- `npm run range:intake -- --ready-only --json`
- `npm run range:intake -- --waiting-only`
- `npm run mtt:completion -- --summary`
- `npm run mtt:completion -- --preview --json`
- `npm run mtt:acceptance`
- `npm run mtt:acceptance -- --json`
- `npm run mtt:handoff`
- `npm run mtt:handoff -- --strict`
- `npm run mtt:registry-integrity`
- `npm run mtt:release-gates`
- `npm run mtt:release-gates -- --json`
- `npm run mtt:blockers -- --format=SIX_MAX --ev=DOLAR_EV --street=RIVER --json`
- `npm run mtt:blockers -- --summary`
- `npm run mtt:postflop-matrix`
- `npm run mtt:postflop-matrix -- --json`
- `npm run mtt:postflop-positions`
- `npm run mtt:postflop-positions -- --json`
- `npm run mtt:postflop-coverage`
- `npm run mtt:postflop-coverage -- --json`
- `npm run mtt:postflop-release`
- `npm run mtt:postflop-release -- --summary`
- `npm run mtt:postflop-release -- --json`
- `npm run mtt:intake-plan`
- `npm run mtt:intake-plan -- --summary`
- `npm run mtt:intake-plan -- --ready-only --json`
- `npm run mtt:intake-plan -- --priority=P1_PREFLOP_CHIP_EV --all`
- `npm run mtt:intake-plan -- --priority=P2_PREFLOP_DOLAR_EV --all`
- `npm run mtt:validate-ready-intake`
- `npm run mtt:validate-ready-intake -- --priority=P1_PREFLOP_CHIP_EV --json`
- `npm run mtt:validate-ready-intake -- --priority=P2_PREFLOP_DOLAR_EV --json`
- `npm run range:intake:guard`

`mtt:blockers` reports the same priority buckets as `mtt:intake-plan`, so blocker summaries can be used to route work
to the next P1-P5 import queue without reopening the full intake plan.
`mtt:completion` defaults to a production gate. It should remain red until every tracked MTT profile is production-ready;
use `--preview` only for queue inspection.
`mtt:acceptance` is the final MTT-only acceptance gate and links its output to `Agents/mtt-done-checklist.md`.
It currently remains red until the missing production data and permissions are imported.
`mtt:handoff` regenerates the full source-free MTT/range/Android JSON bundle for operator handoff; use `--strict`
for final RC evidence because it returns non-zero until `releaseReady` is true.
The handoff bundle also includes `artifacts/texas-solver-review-protocol/report.json`, which shows whether staged
TexasSolver families have human poker sign-off or are still only technically reviewed solver outputs.
It also includes `artifacts/mtt-postflop-pilot-suite/report.json` and
`artifacts/mtt-postflop-pilot-catalog/report.json` so scoped pilot delivery can be audited separately from full
FLOP/TURN/RIVER production coverage.
`mtt:release-gates` prints completion, blocker, intake priority, postflop release, intake workspace and ready-validation summaries before
returning a failing exit code; `--json` returns the same command list, statuses and captured outputs for operator tooling.
`mtt:postflop-matrix` freezes the 48 FLOP/TURN/RIVER production targets and records whether each target is waiting for
legal files, ready for validation, or already production.
`mtt:postflop-positions` freezes all supported and unsupported heads-up aggressor/caller pairs for full-ring and 6-max
SRP/3bet pots.
FLOP/TURN/RIVER production coverage now requires the 50 granular patterns emitted by this report, for example
`SRP_UTG_VS_BB`, `SRP_BTN_VS_BB`, `SRP_SB_VS_BB`, `SRP_HJ_VS_CO`, and `3BP_BTN_VS_UTG`.
`mtt:postflop-coverage` expands the 48 profile targets into 9,600 concrete street/pot/action/position targets and
shows exact blockers for release routing.
`mtt:postflop-release` is the final postflop release gate. The final postflop release gate currently fails because
all 48 FLOP/TURN/RIVER targets are waiting for legal production data and still resolve through fallback runtime.

The remaining preflop intake subset has 12 rows and 0 rows ready for validation.
Four full-ring CHIP_EV rows have already left the queue after production promotion.

## Known blocked profiles

- FULL_RING_9 / REGULAR and TURBO / CHIP_EV / PREFLOP / ante ON and OFF are production. Turbo uses an explicit reviewed `BLIND_SPEED` reuse policy.
- FULL_RING_9 / REGULAR and TURBO / DOLAR_EV / PREFLOP / ante ON and OFF are missing dedicated DOLAR_EV records or an explicitly reviewed reuse policy.
- SIX_MAX / REGULAR and TURBO / CHIP_EV / PREFLOP / ante ON and OFF are candidate metadata only; normalized hand-class records are not present.
- SIX_MAX / REGULAR and TURBO / DOLAR_EV / PREFLOP / ante ON and OFF are missing dedicated DOLAR_EV records or an explicitly reviewed reuse policy.
- FLOP, TURN and RIVER production StrategyPacks are not registered for any tracked MTT profile yet.

## Regular-vs-turbo audit

`npm run verify:ranges` includes the MTT preflop regular-vs-turbo diff audit:

- comparable rows: 2 after the promoted turbo packs carry their explicit reviewed reuse policy.
- blocked rows: 2, both SIX_MAX ante modes with empty candidate records.
- SIX_MAX ante ON/OFF are blocked because regular and turbo candidate packs have no records to compare.
- Turbo cannot become production by changing blind speed metadata only.

## Production rules enforced

- Production requires MEDIUM or HIGH confidence.
- Production pack IDs must match the canonical legal import slot; historical IDs fail closed as preview-only.
- Production requires non-empty normalized records.
- Production requires at least two source evidence entries and at least three recorded searches.
- Production coverage must include every required position, stack bucket and action context for the profile.
- Turbo production requires dedicated turbo hand recommendations or an explicit reviewed reuse policy.
- DOLAR_EV production requires dedicated DOLAR_EV recommendations or an explicit reviewed reuse policy.
- Candidate packs must not start legacy 9-max scoring.

## Verification hooks

- `npm run mtt:completion -- --summary`
- `npm run mtt:acceptance`
- `npm run mtt:registry-integrity`
- `npm run mtt:release-gates`
- `npm run mtt:blockers`
- `npm run mtt:intake-plan`
- `npm run mtt:postflop-release`
- `npm run mtt:texas-solver-review-protocol`
- `npm run mtt:validate-ready-intake`
- `npm run mtt:slots`
- `npm run range:intake`
- `npm run range:intake:guard`
- `npm run validate:range-import`
- `npm run build:range-module`
- `npm run verify:ranges`
- `npm run e2e:chrome`
- `npm run release:check`
- `tests/unit/mttProductionReadiness.test.ts`
- `tests/unit/mttPreflopRangePackImport.test.ts`
- `tests/unit/mttPreflopRangeAudit.test.ts`
- `tests/unit/mttCompletionCli.test.ts`
- `tests/unit/rangeIntakeStatusCli.test.ts`
- `tests/unit/profileSelector.test.ts`
- `tests/unit/bootstrapIntegration.test.ts`
- `tests/unit/uiNoSourceCitation.test.ts`

## Legal data policy

- This audit is source-free and does not bundle, infer or reconstruct chart values.
- Public metadata and marketing pages may support assumptions, but they are not sufficient permission to copy full chart values.
- Production promotion still requires legally usable normalized records plus an explicit permission manifest.
