# Release notes template

## Version

- Version:
- Date:
- Commit:

## Gameplay changes

- Training:
- Table view:
- Preflop:
- Postflop:
- HH Import:

## Range data changes

- Added production packs:
- Added candidate packs:
- Updated coverage:
- Known blocked profiles:
- Legal review status:

## Statistics changes

- New KPIs:
- Changed KPI formulas:
- Storage or migration changes:
- Import/export changes:

## Quality gates

- `npm run mtt:technical-acceptance`:
- Technical acceptance report: `artifacts/mtt-technical-acceptance/report.json`
- `npm run typecheck`:
- `npm test`:
- `npm run mtt:completion -- --summary`:
- `npm run mtt:next-action`:
- MTT next-action report: `artifacts/mtt-next-action/report.json`
- `npm run mtt:acceptance`:
- `npm run mtt:acceptance -- --json`:
- `npm run mtt:acceptance -- --output=artifacts/mtt-acceptance-report.json`:
- `npm run mtt:release-gates`:
- `npm run mtt:release-gates -- --json`:
- `npm run mtt:release-gates -- --output=artifacts/mtt-release-gates-report.json`:
- `npm run mtt:blockers`:
- `npm run mtt:blockers -- --output=artifacts/mtt-blockers-report.json`:
- `npm run mtt:postflop-release -- --summary`:
- `npm run mtt:intake-plan -- --summary`:
- `npm run mtt:intake-plan -- --output=artifacts/mtt-intake-plan-report.json`:
- `npm run mtt:intake-plan -- --ready-only`:
- `npm run mtt:validate-ready-intake`:
- `npm run mtt:promote-ready`:
- `npm run mtt:registry-integrity`:
- `npm run range:intake:guard`:
- `npm run range:intake -- --ready-only`:
- `npm run verify:ranges`:
- `npm run build`:
- `npm run verify:precache`:
- `npm run bundle:budget`:
- `npm run e2e:chrome`:
- `npm run e2e:chrome:production-fixture`:
- `npm run e2e:android:preflight`:
- Android preflight report: `artifacts/e2e-android-preflight/report.json`
- Android preflight status / readySerial:
- `npm run release:check`:

## Known limitations

- Missing legal range exports:
- Candidate-only profiles:
- Postflop production coverage:
- Mobile/browser limitations:

## Operator notes

- Range import notes:
- MTT intake priority plan:
- Range intake status:
- Permission manifest notes:
- Rollback notes:
