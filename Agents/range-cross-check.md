# Range cross-check workflow

Status: aggregate pilot plus exact-node comparison ready
Updated: 2026-07-22

This workflow has two levels. The original random hand-class comparison is a
fast diagnostic. Production poker review should use the exact-node contract,
which proves that both solvers used the same profile, ranges, board, node and
action tree before comparing combo strategy and EV. Neither level promotes
production content by itself.

## Preferred exact-node workflow

Convert each owned solver export to `PKRTRAINER_SOLVER_EXACT_NODE_V1`. The two
documents must share:

- profile dimensions, players, stacks, pot and acting seat;
- canonical input-range SHA-256 for every player;
- exact board and canonical node path;
- canonical actions and sizings;
- action-tree SHA-256 and row granularity;
- variant-configuration SHA-256 covering blind/ante and payout/ICM rules or
  rake/cap/straddle economics;
- a completed solve whose exploitability is at or below the same pinned target.

Then run:

```powershell
npm run range:cross-check-exact -- --left=artifacts/range-cross-check/texas-exact.json --right=artifacts/range-cross-check/gto-plus-exact.json --summary
```

Optional review thresholds:

```powershell
npm run range:cross-check-exact -- --left=<left.json> --right=<right.json> --max-mean-strategy-distance-pct=5 --max-row-strategy-distance-pct=15 --max-action-ev-delta-bb=0.03 --equivalent-ev-threshold-bb=0.01 --max-disjoint-best-action-pct=5
```

The report measures weighted total-variation strategy distance, maximum action
frequency delta, every comparable action-EV delta and overlap between each
solver's EV-equivalent best-action set. This matters when two or more actions
have effectively equal EV: a different nominal top action is not a mismatch if
the reviewed equivalent sets still overlap. The disjoint-best-action threshold
is weighted by the compared range rather than by raw row count.

`COMBO` evidence is the production-review target. `HAND_CLASS` remains
diagnostic because aggregation can hide suit and blocker effects. If either
solver lacks complete action EV, the report explicitly downgrades to strategy
only. A passing result is still review evidence, not permission, staging or
promotion.

Current adapter state: the solver-neutral validator/comparator is implemented;
one real export from each solver is still required to finish and prove the raw
TexasSolver and second-solver adapters. The existing GTO+ lane is the preferred
first pair because its three-family/four-board inputs already exist, but its
current readiness is `0/3` with nine expected outputs missing.

## Aggregate diagnostic workflow

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

## Aggregate limitation

The random sample is hand-class/rule based and does not prove identical solver
inputs. Do not use it alone for production sign-off; use the exact-node workflow
above on the same raw board and node exports.
