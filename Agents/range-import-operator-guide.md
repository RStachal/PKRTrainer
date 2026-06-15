# Range import operator guide

This guide is for maintainers who prepare legal range data for production promotion.

## Ground rules

- Do not copy third-party chart values unless the project has explicit rights to redistribute them.
- Keep raw source material outside the runtime UI.
- Store permission evidence as internal references, not URL fields, in the permission manifest.
- Production promotion requires non-LOW confidence, real records, source evidence and a valid permission manifest.
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

The guard checks that `Agents/range-intake/raw/` still ignores private local inputs and has no tracked raw files beyond its placeholder docs. The status command is source-free. It checks file presence for `normalized.json` and `permission.json`; it does not validate poker content.

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
- all required pot types, position patterns, board textures, action nodes and range lanes are covered
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
```

This runs typecheck, tests, range verification and production build.

For the full MTT matrix with blocker details and import slot paths:

```powershell
npm run mtt:completion -- --details
```

For a shorter blocker-only queue with local intake file status:

```powershell
npm run mtt:blockers
npm run mtt:blockers -- --summary
npm run mtt:blockers -- --format=SIX_MAX --ev=DOLAR_EV --street=RIVER --json
```

For the prioritized import queue aligned to the current MTT completion goal:

```powershell
npm run mtt:intake-plan
npm run mtt:intake-plan -- --all
npm run mtt:intake-plan -- --format=SIX_MAX --ev=DOLAR_EV --street=RIVER --json
```

To narrow the MTT matrix to the next import batch:

```powershell
npm run mtt:completion -- --details --format=SIX_MAX --ev=DOLAR_EV --street=RIVER --status=candidate
npm run mtt:completion -- --format=SIX_MAX --ev=DOLAR_EV --street=RIVER --json
```

Available filters are `--format`, `--speed`, `--ev`, `--street`, `--ante` and `--status`.
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
