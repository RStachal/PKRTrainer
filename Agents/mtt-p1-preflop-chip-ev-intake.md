# MTT P1 preflop CHIP_EV intake checklist

Updated: 2026-07-07  
Status: source-safe operator guide

This guide covers the first production data wave for the full MTT trainer:
8 preflop CHIP_EV slots across table format, speed and ante. It intentionally
does not contain hand recommendations or range values.

## Current gate state

```powershell
npm run mtt:intake-plan -- --priority=P1_PREFLOP_CHIP_EV --all --summary
```

Current expected result:

```text
queue rows: 8
ready for validation: 0
missing normalized.json: 8
missing permission.json: 8
```

## Required P1 slots

| Slot | Pack id | Current state | Main blocker |
|---|---|---:|---|
| FULL_RING_9 REGULAR CHIP_EV ante ON | `mtt-full-ring-9-regular-preflop-chip-ev-ante-on-production-v1` | candidate | canonical production provenance missing |
| FULL_RING_9 REGULAR CHIP_EV ante OFF | `mtt-full-ring-9-regular-preflop-chip-ev-ante-off-production-v1` | candidate | canonical production provenance missing |
| FULL_RING_9 TURBO CHIP_EV ante ON | `mtt-full-ring-9-turbo-preflop-chip-ev-ante-on-production-v1` | missing | dedicated turbo hand recommendations or reviewed reuse policy required |
| FULL_RING_9 TURBO CHIP_EV ante OFF | `mtt-full-ring-9-turbo-preflop-chip-ev-ante-off-production-v1` | missing | dedicated turbo hand recommendations or reviewed reuse policy required |
| SIX_MAX REGULAR CHIP_EV ante ON | `mtt-six-max-regular-preflop-chip-ev-ante-on-production-v1` | candidate | no normalized production records |
| SIX_MAX REGULAR CHIP_EV ante OFF | `mtt-six-max-regular-preflop-chip-ev-ante-off-production-v1` | candidate | no normalized production records |
| SIX_MAX TURBO CHIP_EV ante ON | `mtt-six-max-turbo-preflop-chip-ev-ante-on-production-v1` | candidate | no normalized production records; turbo cannot be metadata-only |
| SIX_MAX TURBO CHIP_EV ante OFF | `mtt-six-max-turbo-preflop-chip-ev-ante-off-production-v1` | candidate | no normalized production records; turbo cannot be metadata-only |

## Files to provide per slot

For each pack id:

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
- no placeholder strategy values

## Provenance manifest requirements

Each `permission.json` must:

- use the same `packId` as the slot;
- identify reviewer and review date;
- identify source-free evidence references;
- use `licenseKind: OWNED_SOLVER_EXPORT`, `PUBLIC_CHART_WITH_PERMISSION`, or `EXPLICIT_WRITTEN_PERMISSION`;
- allow `PKRTRAINER_RUNTIME_BUNDLE`;
- include reuse policy only when reuse is actually reviewed.

Turbo slots must not become production by copying regular-speed metadata. If
the strategic recommendations are intentionally reused, the manifest must
contain explicit blind-speed reuse rationale and reviewer sign-off.

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
