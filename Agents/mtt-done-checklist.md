# MTT Done Checklist

Updated: 2026-06-23

This checklist defines when the MTT part of PKRTrainer is complete for the first production release.

## Production Matrix

- `npm run mtt:completion -- --summary` returns `valid: true`.
- All 64 MTT completion rows are production-ready.
- `npm run mtt:blockers -- --summary` reports 0 blocker rows.
- `npm run mtt:intake-plan -- --summary` reports 0 queue rows.
- `npm run mtt:acceptance` returns exit 0.
- `npm run mtt:release-gates` returns exit 0.
- `npm run mtt:registry-integrity` returns exit 0.
- `npm run release:check` returns exit 0.

## Required MTT Coverage

- Table formats: `FULL_RING_9`, `SIX_MAX`.
- Speeds: `REGULAR`, `TURBO`.
- EV models: `CHIP_EV`, `DOLAR_EV`.
- Ante modes: `ON`, `OFF`.
- Streets: `PREFLOP`, `FLOP`, `TURN`, `RIVER`.
- Postflop pot types: single-raised pots and 3bet pots.
- Postflop action nodes: c-bet, barrel, pressure and facing-bet nodes.
- Legal decisions: check, bet small, bet big, call, raise, fold where the node allows them.
- Hand-line transitions: flop to turn to river, terminal fold and terminal all-in paths.

## Data And Permission Requirements

- Every production slot has a legal `normalized.json`.
- Every production slot has a matching `permission.json`.
- Every production import validates with `npm run validate:range-import`.
- Every production module dry-run validates with `npm run build:range-module -- --dry-run`.
- No production promotion uses public heuristic fallback, metadata-only reuse or manually inferred chart values.
- Reuse across `REGULAR`/`TURBO` or `CHIP_EV`/`DOLAR_EV` is allowed only with an explicit reviewed reuse policy.

## Runtime Requirements

- MTT preflop profiles resolve to production RangePacks.
- MTT postflop profiles resolve to production StrategyPacks.
- Production runtime does not silently fall back to candidate, preview or public heuristic data.
- UI, HH review and dashboard remain source-free.
- Visible UI does not expose URLs, provider names, pack IDs, rule IDs, raw import paths or raw internal enums.

## User Smoke

- Start and answer representative 9-max regular CHIP_EV preflop training.
- Start and answer representative 9-max turbo DOLAR_EV preflop training.
- Run representative 6-max regular CHIP_EV flop-to-river hand-line training.
- Run representative 6-max turbo DOLAR_EV river facing-bet training.
- Import a hand history with turn and river review.
- Open Statistics and verify MTT breakdowns for preflop, postflop single spots and hand lines.
- Repeat at mobile widths 360px, 390px and 412px without page-level horizontal overflow.

## Release Candidate

- `npm run mtt:technical-acceptance` passes and writes `artifacts/mtt-technical-acceptance/report.json`.
- `npm run typecheck` passes.
- `npm test` passes.
- `npm run mtt:acceptance` passes.
- `npm run mtt:registry-integrity` passes.
- `npm run verify:ranges` passes.
- `npm run build` passes.
- `npm run bundle:budget` passes.
- Normal Chrome E2E passes desktop plus 360/390/412 px, offline reopen and service-worker rollback.
- Synthetic canonical production fixture E2E passes PREFLOP, FLOP, TURN and RIVER lazy routing without leaving fixture data in the release build.
- Release notes include MTT production row counts, blocker counts, bundle budget and remaining limitations.
