# MTT preflop records CSV template

Updated: 2026-07-08  
Status: source-safe operator template

This folder contains CSV helpers for preparing real MTT preflop data outside
Git. The files here intentionally contain no hand recommendations and no range
values.

## Files

- `mtt-preflop-records-template.csv` is the row-level template for reviewed
  hand-class decisions.
- `mtt-p1-preflop-chip-ev-coverage.csv` lists the first 8 P1 CHIP_EV production
  slots and the exact coverage each slot needs before it can become production.

## CSV columns

Use one row per `(packId, position, sourceStackBB, bucket, context, handClass)`.

| Column | Meaning |
|---|---|
| `rowKind` | Use `HAND_CLASS_DECISION` for real rows in a private working copy. |
| `packId` | Exact target production slot id. |
| `tableFormat` | `FULL_RING_9` or `SIX_MAX`. |
| `blindSpeed` | `REGULAR` or `TURBO`; do not copy regular data into turbo without review notes. |
| `ante` | `ON` or `OFF`. |
| `evModel` | For P1 this must be `CHIP_EV`. |
| `position` | Full ring: `UTG, UTG+1, UTG+2, LJ, HJ, CO, BTN, SB, BB`; 6-max: `UTG, HJ, CO, BTN, SB, BB`. |
| `sourceStackBB` | Original stack depth from the source or solver export. |
| `bucket` | PKRTrainer bucket: `5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150`. |
| `context` | `RFI, VS_LIMP, VS_OPEN, VS_3BET, VS_4BET, SQUEEZE, BVB, PUSH_FOLD, VS_ALLIN`. |
| `handClass` | One of the 169 preflop classes, for example pair/suited/offsuit notation from the app model. |
| `strictActions` | Pipe-separated action keys for strict scoring, for example `OPEN_25X` or `CALL|3BET`. |
| `lenientActions` | Pipe-separated action keys for lenient scoring; it must include every strict action. |
| `sourceReferenceId` | Internal source-free evidence id that can be matched in `permission.json`. |
| `reviewer` | Human or internal review owner for this row batch. |
| `reviewedAt` | ISO date of the review. |
| `notes` | Source-free assumptions, e.g. table/speed/ante caveats; no URLs or proprietary excerpts. |

Allowed action keys:

```text
FOLD, CALL, LIMP, OVERLIMP, OPEN_2X, OPEN_25X, OPEN_3X, ISO_2X, ISO_25X, ISO_3X, 3BET, 4BET, SQUEEZE, JAM, CALL_JAM
```

## Coverage targets

For each production slot:

- every listed position must be covered;
- every listed stack bucket must be covered;
- every listed action context must be covered;
- every resulting record must contain all 169 hand classes in both
  `strictActions` and `lenientActions`;
- full ring requires at least 1,053 records before hand-class expansion
  (`9 positions * 13 buckets * 9 contexts`);
- 6-max requires at least 702 records before hand-class expansion
  (`6 positions * 13 buckets * 9 contexts`).

## Promotion guardrails

Do not create placeholder `normalized.json` or `permission.json` files. The CSV
is only a preparation format. Production promotion still requires the canonical
private files:

```text
Agents/range-intake/raw/<packId>/normalized.json
Agents/range-intake/raw/<packId>/permission.json
```

Before promotion run:

```powershell
npm run mtt:preflop-csv-scaffold -- --pack-id <packId> --out artifacts/mtt-preflop-csv-scaffold/<packId>.csv
npm run mtt:preflop-csv-draft -- --csv private-filled-copy.csv --pack-id <packId> --out artifacts/mtt-preflop-csv-draft/<packId>/normalized.json --json
npm run validate:range-import -- --kind=mtt-preflop --permission-manifest Agents/range-intake/raw/<packId>/permission.json Agents/range-intake/raw/<packId>/normalized.json
npm run build:range-module -- --kind=mtt-preflop --dry-run --permission-manifest Agents/range-intake/raw/<packId>/permission.json Agents/range-intake/raw/<packId>/normalized.json
npm run mtt:validate-ready-intake -- --priority=P1_PREFLOP_CHIP_EV --json
```

The converter exits non-zero until the generated draft is complete and
production-ready. That is intentional: incomplete CSV batches can still be
inspected in `artifacts/`, but they must not be copied into
`Agents/range-intake/raw/<packId>/` as production files.

The scaffold command creates empty rows only. It intentionally leaves
`strictActions` and `lenientActions` blank so no strategy values are inferred.

The compatible filename `permission.json` means production provenance/audit
metadata in this project. It is not the user subscription/payment permission
model.
