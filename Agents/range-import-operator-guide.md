# Range import operator guide

This guide is for maintainers who prepare legal range data for production promotion.

## Ground rules

- Do not copy third-party chart values unless the project has explicit rights to redistribute them.
- Keep raw source material outside the runtime UI.
- Store permission evidence as internal references, not URL fields, in the permission manifest.
- Production promotion requires non-LOW confidence, real records, source evidence and a valid permission manifest.
- Permission manifests must not contain placeholder text such as `TODO`, `TBD`, `FIXME` or `REPLACE_ME`.
- Normalized production imports must not contain placeholder text in metadata, assumptions, explanations or source evidence.
- Candidate packs may exist as metadata placeholders, but must not be used for production scoring.

## Intake folders

- `Agents/range-intake/examples/` contains synthetic examples.
- `Agents/range-intake/raw/` is ignored by git and is the place for private source exports or review material.
- `Agents/production-range-intake-manifest.md` records the required checklist.

## List legal MTT import slots

Use the slot list before creating a new `Agents/range-intake/raw/<pack-id>/` folder:

```powershell
npm run mtt:slots
npm run mtt:slots -- --kind=preflop
npm run mtt:slots -- --kind=postflop
npm run mtt:slots -- --kind=postflop --format=SIX_MAX --ev=DOLAR_EV --street=RIVER --status=candidate
npm run mtt:slots -- --kind=postflop --format=SIX_MAX --ev=DOLAR_EV --street=RIVER --json
```

The output is source-free and includes each legal pack id, normalized input path and permission manifest path.
Available filters are `--format`, `--speed`, `--ev`, `--street`, `--ante` and `--status`.
Use `--json` when another script needs stable slot ids and paths.

## Check local intake status

After staging raw files, check which legal slots have both expected local files:

```powershell
npm run range:intake:guard
npm run range:intake
npm run range:intake -- --kind=preflop --format=SIX_MAX --speed=TURBO
npm run range:intake -- --kind=postflop --format=SIX_MAX --ev=DOLAR_EV --street=RIVER --json
```

The guard checks that `Agents/range-intake/raw/` still ignores private local inputs and has no tracked raw files beyond
its placeholder docs. It also checks local raw folders against the legal slot registry, verifies present `normalized.json`
`id` and `permission.json` `packId`, and prints ready/waiting priority counts without reading source chart values.
The status command is source-free. It checks file presence for `normalized.json` and `permission.json`; it does not
validate poker content.

## Validate an MTT preflop import

Use the synthetic example as the command shape:

```powershell
npm run validate:range-import -- --kind=mtt-preflop Agents/range-intake/examples/mtt-preflop-minimal.synthetic.json --permission-manifest Agents/range-intake/examples/permission-manifest.synthetic.json
```

For automation, add `--json` to receive the same readiness, legal-slot and permission checks as structured output.
The module builder also supports `--json` in dry-run mode for `writeReady`, matched slots and blockers without printing generated module text.

Expected production promotion properties:

- `productionReady: true`
- `legal import slot: true`
- no errors
- no warnings
- confidence is `MEDIUM` or `HIGH`
- records cover required positions, stack buckets and action contexts
- input `id` matches the exact legal slot `packId`
- permission manifest is valid for the exact pack id

## Validate a flop production import

```powershell
npm run validate:range-import -- --kind=flop-production Agents/range-intake/examples/flop-production-minimal.synthetic.json --permission-manifest Agents/range-intake/examples/permission-manifest.synthetic.json
```

Expected properties:

- legal license kind
- confidence is not `LOW`
- `legal import slot: true`
- at least one matched MTT postflop import slot
- rules are present
- all required pot types, the 50 granular MTT postflop position patterns, board textures, action nodes and range lanes are covered
- range buckets use valid hand classes and poker feature labels

## Build a range module

Dry-run first:

```powershell
npm run build:range-module -- --kind=mtt-preflop --input Agents/range-intake/examples/mtt-preflop-minimal.synthetic.json --permission-manifest Agents/range-intake/examples/permission-manifest.synthetic.json --dry-run
```

Only write a module when:

- `writeReady: true`
- permission report is valid
- import readiness has no blockers
- matched import slots are the intended MTT production target
- output path is reviewed

## Verify the bundled app

Run:

```powershell
npm run verify:ranges
```

This reports:

- current bundled preflop range file validation
- MTT production readiness by format, speed and ante
- MTT pack import readiness
- flop production strategy readiness

## Release gate

Before releasing:

```powershell
npm run release:check
npm run mtt:next-action
npm run mtt:next-action -- --json
npm run mtt:next-action -- --output=artifacts/mtt-next-action/report.json
npm run mtt:next-action -- --priority=P2_PREFLOP_DOLAR_EV
npm run mtt:acceptance
npm run mtt:acceptance -- --json
npm run mtt:release-gates
npm run mtt:release-gates -- --json
npm run mtt:intake-plan -- --summary
```

`release:check` runs typecheck, tests, MTT release gates, range verification and production build.
`mtt:next-action` prints the next concrete MTT import step: first a ready slot, otherwise the first waiting slot by
P0-P5 priority, including missing files, required file acceptance notes, validate/build dry-run commands, filtered
ready-intake validation, promote-ready dry-run/write commands, registry integrity and technical acceptance follow-ups.
Use `--priority=<bucket>` to ask for the next concrete step inside a specific P1-P5 import wave.
Use `--output=artifacts/mtt-next-action/report.json` when the slot intake packet should be saved for handoff or release notes.
`mtt:acceptance` is the final MTT-only acceptance gate. It is green only when the full MTT app matches
`Agents/mtt-done-checklist.md`, including source-free UI checks and ready-intake validation.
`mtt:release-gates` runs every MTT gate, intake priority summary and next-action packet before returning a failing
exit code, so one failing gate does not hide the remaining blocker summaries. Use `--json` when CI or operator tooling
needs the status and captured output of every gate command.

When `mtt:next-action` is in `WAITING_FOR_FILES`, treat its output as the slot intake packet. Do not create placeholder
`normalized.json` or `permission.json`; the files must come from reviewed legal evidence and must match the printed
canonical `packId`.

For the full MTT matrix with blocker details and import slot paths:

```powershell
npm run mtt:completion -- --details
npm run mtt:completion -- --summary
npm run mtt:completion -- --details --preview
npm run mtt:acceptance
npm run mtt:release-gates
```

For a shorter blocker-only queue with local intake file status:

```powershell
npm run mtt:blockers
npm run mtt:blockers -- --summary
npm run mtt:blockers -- --format=SIX_MAX --ev=DOLAR_EV --street=RIVER --json
npm run mtt:postflop-matrix
npm run mtt:postflop-matrix -- --json
npm run mtt:postflop-positions
npm run mtt:postflop-positions -- --json
npm run mtt:postflop-coverage
npm run mtt:postflop-coverage -- --json
npm run mtt:postflop-release
npm run mtt:postflop-release -- --summary
npm run mtt:postflop-release -- --json
```

The blocker report includes priority counts matching the intake plan buckets, so the summary can route work directly
to the next `P1_PREFLOP_CHIP_EV`, `P2_PREFLOP_DOLAR_EV` or postflop production queue.
The postflop matrix freezes the 48 FLOP/TURN/RIVER production targets and shows each target as `WAITING`, `READY` or
`PRODUCTION`.
The postflop positions report freezes supported and unsupported heads-up position pairs for SRP and 3bet pots.
Production FLOP/TURN/RIVER packs must use the granular `SRP_<POS>_VS_<POS>` and `3BP_<POS>_VS_<POS>` patterns from this report; the old five broad patterns remain legacy-compatible but are not enough for production coverage.
The postflop coverage report expands the 48 profile targets into 9,600 concrete street/pot/action/position targets
and shows the exact blocker for each target.
The postflop release gate fails release while any FLOP/TURN/RIVER slot still uses fallback runtime, lacks production
coverage, lacks `permission.json`, contains placeholder text, has LOW confidence or is not production-ready.

For the prioritized import queue aligned to the current MTT completion goal:

```powershell
npm run mtt:intake-plan
npm run mtt:intake-plan -- --all
npm run mtt:intake-plan -- --summary
npm run mtt:intake-plan -- --ready-only --json
npm run mtt:intake-plan -- --priority=P1_PREFLOP_CHIP_EV --all
npm run mtt:intake-plan -- --priority=P2_PREFLOP_DOLAR_EV --all
npm run mtt:intake-plan -- --format=SIX_MAX --ev=DOLAR_EV --street=RIVER --json
npm run mtt:validate-ready-intake
npm run mtt:validate-ready-intake -- --priority=P1_PREFLOP_CHIP_EV --json
npm run mtt:validate-ready-intake -- --priority=P2_PREFLOP_DOLAR_EV --json
npm run mtt:validate-ready-intake -- --format=SIX_MAX --ev=DOLAR_EV --street=RIVER --json
npm run mtt:promote-ready
npm run mtt:promote-ready -- --priority=P1_PREFLOP_CHIP_EV --dry-run
npm run mtt:promote-ready -- --json
npm run mtt:promote-ready -- --write --confirm=WRITE_READY_MTT_MODULES
npm run mtt:registry-integrity
npm run mtt:registry-integrity -- --json
```

To narrow the MTT matrix to the next import batch:

```powershell
npm run mtt:completion -- --details --preview --format=SIX_MAX --ev=DOLAR_EV --street=RIVER --status=candidate
npm run mtt:completion -- --preview --format=SIX_MAX --ev=DOLAR_EV --street=RIVER --json
```

Available filters are `--format`, `--speed`, `--ev`, `--street`, `--ante` and `--status`.
Use `--preview` for operator queue inspection without treating missing production data as a failed release gate.
Use `--json` when another script needs the release gate and filtered readiness rows.

## Promotion checklist

1. Confirm legal right to redistribute the range data.
2. Put raw evidence in `Agents/range-intake/raw/`.
3. Create or update the permission manifest with internal references.
4. Validate the import with `validate:range-import`.
5. Dry-run `build:range-module`.
6. Review generated coverage and blockers.
7. Add the generated module only after `writeReady: true`.
8. Register the pack in the appropriate resolver.
9. Run `npm run release:check`.
10. Confirm runtime UI remains source-free.

For batch work after multiple legal files are staged, `mtt:validate-ready-intake` reads only slots where both
`normalized.json` and `permission.json` are present and runs the same source-free dry-run build validation without
writing runtime modules. Its text and JSON output include the exact `build:range-module --dry-run` command for each
ready slot so failures can be reproduced manually. When no slot is ready, it still prints waiting rows, missing
`normalized.json`, missing `permission.json` and `npm run mtt:next-action` so the operator can distinguish "nothing
staged yet" from a completed import wave.
The prioritized `mtt:intake-plan` output also prints the per-slot `validate:range-import` command and the matching
`build:range-module --dry-run` command.
After ready files validate cleanly, `mtt:promote-ready` can batch-plan module writes. It defaults to dry-run, refuses
real writes without `--write --confirm=WRITE_READY_MTT_MODULES`, and refuses to overwrite existing output modules
unless `--force` is present. Like ready-intake validation, an empty promotion plan prints waiting rows, missing
`normalized.json`, missing `permission.json` and `npm run mtt:next-action`.
After module generation and resolver registration, `mtt:registry-integrity` checks duplicate pack ids, generated
production modules outside legal slots, generated modules not registered in runtime resolvers, and permission manifests
whose `packId` is not a legal MTT slot.
