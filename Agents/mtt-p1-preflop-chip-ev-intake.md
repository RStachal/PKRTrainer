# MTT P1 preflop CHIP_EV intake checklist

Updated: 2026-07-22
Status: full-ring wave promoted; six-max wave pending

This guide covers the original first production data wave of 8 preflop CHIP_EV
slots across table format, speed and ante. Four full-ring slots are now
production; four six-max slots remain pending. It intentionally does not contain
hand recommendations or range values.

## Current gate state

```powershell
npm run mtt:intake-plan -- --priority=P1_PREFLOP_CHIP_EV --all --summary
```

Current expected result:

```text
queue rows: 4
ready for validation: 0
missing normalized.json: 4
missing permission.json: 0
```

Generate the source-safe packet for all four pending slots with:

```powershell
npm run mtt:p1-intake-packets
```

It writes only ignored checklists and a machine-readable report below
`artifacts/mtt-next-action/p1-preflop-chip-ev/`; it never creates range data or
changes a slot status. Treat that folder's `summary.json` as the authoritative
current packet list; older ignored packet folders may remain from prior runs.

## Required P1 slots

| Slot | Pack id | Current state | Main blocker |
|---|---|---:|---|
| FULL_RING_9 REGULAR CHIP_EV ante ON | `mtt-full-ring-9-regular-preflop-chip-ev-ante-on-production-v1` | production | none |
| FULL_RING_9 REGULAR CHIP_EV ante OFF | `mtt-full-ring-9-regular-preflop-chip-ev-ante-off-production-v1` | production | none |
| FULL_RING_9 TURBO CHIP_EV ante ON | `mtt-full-ring-9-turbo-preflop-chip-ev-ante-on-production-v1` | production | reviewed `BLIND_SPEED` reuse recorded |
| FULL_RING_9 TURBO CHIP_EV ante OFF | `mtt-full-ring-9-turbo-preflop-chip-ev-ante-off-production-v1` | production | reviewed `BLIND_SPEED` reuse recorded |
| SIX_MAX REGULAR CHIP_EV ante ON | `mtt-six-max-regular-preflop-chip-ev-ante-on-production-v1` | candidate | no normalized production records |
| SIX_MAX REGULAR CHIP_EV ante OFF | `mtt-six-max-regular-preflop-chip-ev-ante-off-production-v1` | candidate | no normalized production records |
| SIX_MAX TURBO CHIP_EV ante ON | `mtt-six-max-turbo-preflop-chip-ev-ante-on-production-v1` | candidate | no normalized production records; turbo cannot be metadata-only |
| SIX_MAX TURBO CHIP_EV ante OFF | `mtt-six-max-turbo-preflop-chip-ev-ante-off-production-v1` | candidate | no normalized production records; turbo cannot be metadata-only |

The owner-confirmed `permission.json` manifests for all four slots were staged
on 2026-07-13. Each slot still requires its own exact reviewed
`normalized.json`; full-ring or regular-speed reuse is not an approved shortcut.

## Files to provide per slot

For each pending pack id:

```text
Agents/range-intake/raw/<packId>/normalized.json
Agents/range-intake/raw/<packId>/permission.json
```

`permission.json` is the compatibility filename used by the tooling. In this
project it means a source-free production provenance/audit manifest, not the
payment model and not user access rights.

Source-safe preparation helpers live in:

```text
Agents/range-intake/templates/mtt-preflop-records-template.csv
Agents/range-intake/templates/mtt-p1-preflop-chip-ev-coverage.csv
Agents/range-intake/templates/mtt-preflop-records-template.README.md
```

The CSV template is only an operator preparation format. It must not be treated
as a production `normalized.json` until converted, reviewed and validated by the
canonical import pipeline.

## Owned solver CSV conversion

When an exact six-max solver export has been transcribed or exported into the
provided CSV schema, create a source-safe draft for that one pack only. This
command does not create any missing hand decisions; it rejects incomplete CSV
coverage.

```powershell
npm run mtt:preflop-csv-draft -- --csv <six-max-export.csv> --pack-id <packId> --out artifacts/mtt-preflop-csv-draft/<packId>/normalized.candidate.json --license-kind OWNED_SOLVER_EXPORT --license-note "Owner-confirmed canonical permission manifest is staged separately." --confidence HIGH --summary
```

The owner-confirmed redistribution and review facts already live in the
canonical `Agents/range-intake/raw/<packId>/permission.json`; do not create a
second candidate permission manifest. For a valid reviewed draft, use the
existing explicit staging command to validate that canonical manifest and write
the normalized raw intake file. Do not copy the candidate manually:

```powershell
npm run mtt:p1-stage-reviewed-preflop -- --pack-id <packId> --draft-dir artifacts/mtt-preflop-csv-draft --permission Agents/range-intake/raw/<packId>/permission.json --write --confirm=STAGE_REVIEWED_MTT_P1_PREFLOP
```

## Four-pack batch preflight

The four prepared six-max workbench files can be checked together. The command
does not write anything by default. Atomic mode refuses the whole write if even
one CSV is incomplete or mapped to the wrong slot. Incremental mode treats
absent CSV files as waiting and advances every currently complete export; a
present but invalid CSV still blocks the write.

```powershell
npm run mtt:sixmax-preflop-intake-batch -- --json
npm run mtt:sixmax-preflop-intake-batch -- --write --confidence=HIGH --confirm=BUILD_MTT_SIXMAX_P1_CANDIDATES
```

For progressive intake as each export arrives:

```powershell
npm run mtt:sixmax-preflop-intake-progress
npm run mtt:sixmax-preflop-intake-batch -- --incremental --write --confidence=HIGH --confirm=BUILD_MTT_SIXMAX_P1_CANDIDATES
```

Keep the four ignored workbench CSVs aligned with the current action-EV schema:

```powershell
npm run mtt:sixmax-preflop-workbench-refresh
```

The refresh command recognizes the exact generated 118,638-row structure for
each slot. It may upgrade only a complete legacy scaffold whose strategy,
action-EV, reviewer, source and notes cells are still untouched. Any human edit,
truncated file or unknown header is reported and protected from overwrite. The
ten-minute MTT task runs the same guard and exposes current/blank/nonblank/stale
counts in `mtt:autonomous-cycle-status`. The command creates no strategy or EV.

Its output stays under `artifacts/mtt-sixmax-preflop-intake/`. It writes only
`normalized.candidate.json` and a concise `BATCH_REPORT.md`; permission mode
`CANONICAL_STAGED_MANIFEST` means the owner-confirmed manifest remains in its
canonical raw slot. Reviewed normalized-data staging to
`Agents/range-intake/raw/` remains a separate explicit action.

Candidates may be staged atomically as one set or incrementally as reviewed
exports arrive. In incremental mode, a canonical permission awaiting its
candidate is `WAITING`; a candidate without permission or any invalid pair is
`INVALID` and blocks the write. Promotion remains a later explicit gate:

```powershell
npm run mtt:sixmax-preflop-stage-batch -- --draft-dir=artifacts/mtt-sixmax-preflop-intake
npm run mtt:sixmax-preflop-stage-batch -- --draft-dir=artifacts/mtt-sixmax-preflop-intake --write --confirm=STAGE_REVIEWED_MTT_SIXMAX_P1_BATCH
npm run mtt:sixmax-preflop-stage-progress
npm run mtt:sixmax-preflop-stage-batch -- --draft-dir=artifacts/mtt-sixmax-preflop-intake --incremental --write --confirm=STAGE_REVIEWED_MTT_SIXMAX_P1_BATCH
```

## Normalized data requirements

Each `normalized.json` must be for exactly one target slot and must not silently
cover another table format, speed, EV model or ante.

Minimum required dimensions:

- `gameVariant`: `MTT`
- `street`: `PREFLOP`
- `evModel`: `CHIP_EV`
- `rakeMode`: `NONE`
- exact `tableFormat`, `blindSpeed` and `ante` matching the pack id
- confidence at least `MEDIUM`
- all relevant positions for the table format
- stack buckets: `5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150`
- action contexts: `RFI, VS_LIMP, VS_OPEN, VS_3BET, VS_4BET, SQUEEZE, BVB, PUSH_FOLD, VS_ALLIN`
- all 169 hand classes in strict and lenient maps for every covered row
- `actionEvsBb`, `equivalentThresholdBb` and `acceptableThresholdBb` for every
  decision where reviewed counterfactual EV is available; partial EV sets are invalid
- no placeholder strategy values

## Provenance manifest requirements

Each `permission.json` must:

- use the same `packId` as the slot;
- identify reviewer and review date;
- identify source-free evidence references for third-party/public-permission inputs;
- use `licenseKind: OWNED_SOLVER_EXPORT`, `PUBLIC_CHART_WITH_PERMISSION`, or `EXPLICIT_WRITTEN_PERMISSION`;
- allow `PKRTRAINER_RUNTIME_BUNDLE`;
- include reuse policy only when reuse is actually reviewed.

For an owner-confirmed `OWNED_SOLVER_EXPORT`, external evidence references are
not required. Reviewer, rights owner, source material location, runtime-bundle
permission and any reused strategic dimension remain explicit.

Turbo slots must not become production by changing regular-speed metadata only.
If the strategic recommendations are intentionally reused, the manifest must
contain explicit blind-speed reuse rationale and reviewer sign-off. The two
full-ring turbo slots satisfy this rule.

## Validation sequence

Use the slot list first:

```powershell
npm run mtt:slots -- --street=PREFLOP --ev=CHIP_EV --json
```

Then for one slot:

```powershell
npm run validate:range-import -- --kind=mtt-preflop --permission-manifest Agents/range-intake/raw/<packId>/permission.json Agents/range-intake/raw/<packId>/normalized.json
npm run build:range-module -- --kind=mtt-preflop --dry-run --permission-manifest Agents/range-intake/raw/<packId>/permission.json Agents/range-intake/raw/<packId>/normalized.json
npm run mtt:validate-ready-intake
npm run mtt:promote-ready -- --dry-run
```

After the first successful promotion dry-run:

```powershell
npm run verify:ranges
npm run mtt:completion -- --street=PREFLOP --ev=CHIP_EV --summary
npm run mtt:blockers -- --summary
npm run typecheck
npm run build
```

## No-false-green rules

- Do not use postflop TexasSolver outputs for P1 preflop ranges.
- Do not create placeholder `normalized.json` or `permission.json` files just
  to reduce blocker counts.
- Do not mark a pack production-ready when only the profile metadata changed.
- Do not expose raw source paths, URLs or provider details in visible app UI.
- If only a narrow/pilot subset is known, keep it as pilot/candidate and state
  the scope explicitly.
