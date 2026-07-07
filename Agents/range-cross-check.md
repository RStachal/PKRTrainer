# Range cross-check workflow

Status: ready for pilot use  
Updated: 2026-07-07

This workflow is for random spot/hand-class verification against another solver or poker tool. It does not promote production content by itself; it produces review evidence.

## 1. Generate a PKRTrainer sample

```powershell
npm run range:cross-check-sample -- --sample-size=40 --seed=7072026 --output=artifacts/range-cross-check/srp-facing-sample.json --csv=artifacts/range-cross-check/srp-facing-sample.csv
```

Default source pack:

```text
artifacts/texas-solver-review-integration/normalized-drafts/BTN_BB_SRP_FLOP_FACING_BET_PILOT/normalized.candidate.json
```

Use `--pack <path>` to sample another normalized candidate.

## 2. Verify rows in another solver/tool

Open the generated CSV and fill:

- `externalAction` when the external solver has a dominant/recommended action.
- Optional exact frequencies in columns:
  - `CHECK`
  - `BET_SMALL`
  - `BET_BIG`
  - `CALL`
  - `RAISE`
  - `FOLD`
- `externalNotes` for board/sizing/model caveats.

The important stable key is `sampleId`. Keep it unchanged.

## 3. Compare

```powershell
npm run range:cross-check-compare -- --sample=artifacts/range-cross-check/srp-facing-sample.json --external=artifacts/range-cross-check/external.csv --frequency-tolerance-pct=15
```

Outputs:

- `artifacts/range-cross-check/compare-report.json`
- `artifacts/range-cross-check/compare-report.md`

The report fails if:

- any sampled row is missing from the external file;
- action mismatch rate exceeds `--action-tolerance-pct`;
- any comparable frequency delta exceeds `--frequency-tolerance-pct`.

## Recommended manual process

1. Generate 20-40 random rows per pilot pack.
2. Recreate the same family/node/SPR context in external software.
3. Fill the external CSV.
4. Run compare.
5. If mismatch is large, mark the candidate as review-blocked rather than production-ready.

## Current limitation

The sample is hand-class/rule based. It does not yet export exact board-by-board TexasSolver node inputs for every row. For high-stakes production sign-off, pair this with a smaller exact-board review from raw solver exports.
