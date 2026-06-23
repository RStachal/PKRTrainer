# MTT RC attempt - 2026-06-17

Updated 2026-06-23 after fail-closed legal provenance and real-browser technical acceptance work.

## Decision

Not a production MTT v1 release candidate yet. Runtime/UI/tooling gates are largely in place, but final MTT production gates are blocked by missing legal production import data.

## Command results

- `npm run mtt:technical-acceptance`: passed on 2026-06-23.
  - Runs typecheck, all Vitest suites, deterministic registry and integrity checks, range verification, production build, precache, bundle budget, four-viewport Chrome E2E and isolated canonical production PREFLOP/FLOP/TURN/RIVER fixture E2E.
  - 10/10 commands passed; Vitest reported 225/225 suites and 542/542 tests.
  - Main build: 269.86 KiB raw / 74.00 KiB gzip; install-precache JS total: 346.75 / 95.11 KiB.
  - Chrome passed desktop 1280 plus mobile 360/390/412, 52 contrast checks, offline reopen and real service-worker rollback.
  - Synthetic lazy chunks raw/gzip: preflop 23.43 / 7.19 KiB, FLOP 21.39 / 5.86 KiB, TURN 9.63 / 3.09 KiB and RIVER 10.29 / 3.21 KiB.
  - Writes `artifacts/mtt-technical-acceptance/report.json`; this is a technical gate and does not override the red legal production-data gates below.
- `npm run mtt:acceptance`: failed as expected before legal production data.
  - valid: false
  - commands: 9
  - failed commands: 2
  - completion matrix: 64 rows, 0 productionReady, 54 preview, 10 blocked
  - blocker summary: 64 blocker rows, 54 candidate blocker rows, 10 missing blocker rows
  - intake files: 64 rows missing `normalized.json`, 64 rows missing `permission.json`
  - postflop final release: 48 total postflop rows, 0 productionReady, 48 blockers
  - source-free UI guard: passed, 9 tests
  - range intake workspace guard: valid
  - registry integrity: valid, 0 errors
- `npm run mtt:release-gates`: failed as expected on the same production data gates.
  - commands: 8
  - failed commands: 2
  - ready intake slots: 0
  - ready validation: valid true with 0 ready rows
- `npm run verify:ranges`: passed legacy range validation and reported current MTT production blockers.
  - ante ON records: 487, validation errors: 0
  - ante OFF records: 487, validation errors: 0
  - MTT preflop readiness: 0 production, 6 candidate, 2 missing
  - flop production strategy readiness: 0 registered production packs
- `npm test -- tests/unit/mttAcceptanceCli.test.ts`: passed after updating the source-free guard expectation from 7 to 9 tests.
- `npm test -- tests/unit/mobileWebViewSmoke.test.ts`: passed, 3 tests.
- `npm run profile:render`: passed with non-blocking warning.
  - preflop range matrix 13x13: WARN avg 44.91 ms against 35 ms warning threshold
  - preflop table: OK avg 2.57 ms
  - postflop Flopzilla matrix 13x13: OK avg 28.13 ms
- `npm run build`: passed.
- `npm run bundle:budget`: passed after build.
  - current build after the 2026-06-18 matrix optimization: main-9cmG-2BA.js, raw 320.96 KiB, gzip 84.63 KiB
  - limits: raw 325 KiB, gzip 86 KiB

## Completed in this pass

- HH import/review parity coverage for MTT flop-turn-river production-like resolver routing.
- Postflop stats bridge schema v3 with explicit `ante` and legacy normalization.
- Dashboard postflop breakdowns over single spot and hand-line street records.
- Central source-free UI release audit expanded to HH review and postflop hand-line.
- Mobile/performance/build/bundle QA recorded.
- Duplicate old MTT import tasks superseded into the 135.x P1-P5 backlog.
- Follow-up 2026-06-18: preflop matrix now delegates cell click/keyboard handling at the matrix level and caches the stable 13x13 hand-label grid, reducing per-render listeners from 338 to 2.
- Follow-up 2026-06-22: two historical full-ring regular CHIP_EV packs now fail closed as `PREVIEW_ONLY`; their non-canonical IDs cannot satisfy legal production readiness or start scoring.

## Blocking items

- P1 preflop CHIP_EV legal production imports: 8 blocker rows.
- P2 preflop DOLAR_EV legal production imports: 8 blocker rows.
- P3 FLOP production imports: 16 blocker rows.
- P4 TURN production imports: 16 blocker rows.
- P5 RIVER production imports: 16 blocker rows.
- No ready validation slots exist yet because all 64 legal intake slots are waiting for `normalized.json` and `permission.json`.

## Next operator action

Run `npm run mtt:next-action` and follow the reported first waiting slot. For each legal slot, place reviewed local intake files under `Agents/range-intake/raw/<packId>/`, then run validation, dry-run module build, promotion, and `npm run mtt:acceptance`.
